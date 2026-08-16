import asyncio
from dataclasses import dataclass
from html import escape

import httpx
from firebase_admin import auth

from app.core.config import Settings
from app.core.security import firebase_app


@dataclass(frozen=True, slots=True)
class EmailDelivery:
    status: str
    provider_id: str | None = None
    development_link: str | None = None


async def generate_magic_sign_in_link(email: str, settings: Settings) -> str:
    action_settings = auth.ActionCodeSettings(
        url=settings.public_app_url,
        handle_code_in_app=True,
    )
    return await asyncio.to_thread(
        auth.generate_sign_in_with_email_link,
        email,
        action_settings,
        app=firebase_app(),
    )


async def send_role_invitation(
    *, email: str, roles: list[str], link: str, settings: Settings
) -> EmailDelivery:
    if not settings.resend_api_key:
        return EmailDelivery(
            status="EMAIL_PROVIDER_NOT_CONFIGURED",
            development_link=link if settings.app_env != "production" else None,
        )
    role_names = ", ".join(role.replace("ROLE_", "").replace("_", " ").title() for role in roles)
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <div style="font-weight:800;font-size:22px;color:#e11d48">RaktFlow</div>
      <h1 style="font-size:24px">You have been invited</h1>
      <p>An administrator granted <strong>{escape(role_names)}</strong> access to {escape(email)}.</p>
      <p><a href="{escape(link)}" style="display:inline-block;background:#e11d48;color:white;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:700">Accept invitation securely</a></p>
      <p style="font-size:12px;color:#64748b">This link is bound to your email. Do not forward it. If you were not expecting this invitation, ignore this message.</p>
    </div>
    """
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [email],
                "subject": "Your RaktFlow access invitation",
                "html": html,
            },
        )
        response.raise_for_status()
        payload = response.json()
    return EmailDelivery(status="SENT", provider_id=payload.get("id"))
