"""Application settings loaded from environment / ``backend/.env``.

Educational walkthrough
-----------------------
- ``pydantic-settings`` maps env vars to typed fields (case-insensitive).
- ``extra="ignore"`` lets unknown env vars exist without crashing startup.
- Required fields (no default) must be set or the app fails fast at boot —
  better than discovering a missing DATABASE_URL mid-request.
- Optional LLM / Resend keys default to ``""`` so the product still runs;
  features that need them degrade gracefully.
- ``get_settings`` is ``lru_cache``'d so we parse ``.env`` once per process.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    api_key: str

    # LLMRouter tries providers in this order when keys are non-empty (policy-locked).
    groq_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    huggingface_api_key: str = ""
    cloudflare_api_key: str = ""
    cloudflare_account_id: str = ""
    vercel_ai_gateway_key: str = ""

    cors_origins: list[str] = []

    # Multi-tenant SaaS foundation (Phase 2)
    token_encryption_key: str = ""  # Fernet key — encrypt GitHub OAuth tokens at rest
    internal_auth_secret: str = ""  # HMAC secret shared with frontend for user tokens

    # Phase 4E: Notifications & alerting
    resend_api_key: str = ""
    email_from: str = ""
    frontend_base_url: str = ""  # also used to build demo-recording URLs (4G)

    # Phase 4G: Demo asset generation
    demo_assets_dir: str = "demo_assets"
    demo_asset_retention_days: int = 3
    recording_auth_secret: str = ""  # must match frontend RECORDING_AUTH_SECRET


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide Settings singleton."""
    return Settings()
