import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import firebase_admin
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from app.core.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
ALL_ROLES = {
    "ROLE_DONOR",
    "ROLE_HOSPITAL",
    "ROLE_ORGANIZER",
    "ROLE_HOST_VENUE",
    "ROLE_SUPER_ADMIN",
}


@dataclass(frozen=True, slots=True)
class Actor:
    uid: str
    email: str
    roles: frozenset[str]
    email_verified: bool = False
    hospital_id: str | None = None

    @property
    def role(self) -> str:
        """Backward-compatible primary role for older route code."""
        priority = [
            "ROLE_SUPER_ADMIN",
            "ROLE_HOSPITAL",
            "ROLE_ORGANIZER",
            "ROLE_HOST_VENUE",
            "ROLE_DONOR",
        ]
        return next((role for role in priority if role in self.roles), "ROLE_DONOR")

    def has_any(self, *roles: str) -> bool:
        return "ROLE_SUPER_ADMIN" in self.roles or bool(self.roles.intersection(roles))


@lru_cache
def firebase_app():
    settings = get_settings()
    if firebase_admin._apps:  # Firebase Admin exposes no public app-exists predicate.
        return firebase_admin.get_app()
    if settings.firebase_credentials_json:
        credential = credentials.Certificate(json.loads(settings.firebase_credentials_json))
        return firebase_admin.initialize_app(credential, {"projectId": settings.firebase_project_id})
    return firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})


def _claim_roles(claims: dict) -> frozenset[str]:
    raw_roles = claims.get("roles")
    if isinstance(raw_roles, list):
        roles = {str(role) for role in raw_roles}
    elif claims.get("role"):
        roles = {str(claims["role"])}
    else:
        roles = set()
    return frozenset(roles.intersection(ALL_ROLES))


async def current_actor(
    token: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_dev_uid: Annotated[str | None, Header()] = None,
    x_dev_role: Annotated[str | None, Header()] = None,
) -> Actor:
    if settings.allow_dev_auth and settings.app_env != "production" and x_dev_uid and x_dev_role:
        roles = frozenset(role.strip() for role in x_dev_role.split(",") if role.strip() in ALL_ROLES)
        return Actor(uid=x_dev_uid, email="dev@raktflow.local", roles=roles or frozenset({"ROLE_DONOR"}), email_verified=True)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Firebase bearer token")
    try:
        claims = auth.verify_id_token(token.credentials, app=firebase_app(), check_revoked=True)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked identity token") from exc
    roles = _claim_roles(claims)
    # A newly authenticated user may have no claim until /auth/bootstrap provisions the account.
    if not roles and not claims.get("email"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A verified email is required")
    return Actor(
        uid=claims["uid"],
        email=str(claims.get("email", "")).lower(),
        roles=roles,
        email_verified=bool(claims.get("email_verified")),
        hospital_id=claims.get("hospital_id"),
    )


def require_roles(*roles: str):
    async def dependency(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
        if not actor.has_any(*roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Role is not authorized for this action")
        return actor

    return dependency
