from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_name: str = "RaktFlow API"
    app_env: str = "production"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://localhost/raktflow"
    firebase_project_id: str = ""
    firebase_credentials_json: str = ""
    cors_origins: list[str] = Field(default_factory=list)
    token_signing_secret: str = "development-only-secret-change-me-32chars"  # noqa: S105
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    allow_dev_auth: bool = False
    requisition_storage_dir: Path = Path("./var/requisitions")
    max_db_connections: int = 5
    max_upload_bytes: int = 10 * 1024 * 1024
    bootstrap_admin_email: str = ""
    public_app_url: str = "http://localhost:5173"
    resend_api_key: str = ""
    email_from: str = "RaktFlow <noreply@example.invalid>"
    admin_notification_email: str = "chemnaam@gmail.com"
    contact_email: str = "chemnaam@gmail.com"
    contact_phone: str = "9908840322"
    pii_encryption_key: str = ""
    phone_hash_pepper: str = "development-phone-pepper-change-me"
    screening_min_age: int = 18
    screening_max_age: int = 65
    screening_min_weight_kg: float = 45.0
    screening_whole_blood_interval_days: int = 90

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("max_db_connections")
    @classmethod
    def enforce_free_tier_pool_cap(cls, value: int) -> int:
        if not 1 <= value <= 5:
            raise ValueError("MAX_DB_CONNECTIONS must be between 1 and 5")
        return value

    def validate_production(self) -> None:
        if self.app_env == "production":
            if self.allow_dev_auth:
                raise RuntimeError("ALLOW_DEV_AUTH cannot be enabled in production")
            if len(self.token_signing_secret) < 32 or "development-only" in self.token_signing_secret:
                raise RuntimeError("A strong TOKEN_SIGNING_SECRET is required in production")
            if not self.firebase_project_id:
                raise RuntimeError("FIREBASE_PROJECT_ID is required in production")
            if not self.bootstrap_admin_email:
                raise RuntimeError("BOOTSTRAP_ADMIN_EMAIL is required in production")
            if len(self.phone_hash_pepper) < 24 or "development" in self.phone_hash_pepper:
                raise RuntimeError("A strong PHONE_HASH_PEPPER is required in production")
            if not self.pii_encryption_key:
                raise RuntimeError("PII_ENCRYPTION_KEY is required in production")


@lru_cache

def get_settings() -> Settings:
    return Settings()
