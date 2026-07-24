import base64
import hashlib
import hmac
import json
import time

from app.config import get_settings

TOKEN_TTL_SECONDS = 60


def _sign(payload_b64: str) -> str:
    settings = get_settings()
    return hmac.new(
        settings.recording_auth_secret.encode(), payload_b64.encode(), hashlib.sha256
    ).hexdigest()


def mint_recording_token(repo_id: int, user_id: int, github_id: str) -> str:
    """Proves to the frontend that the headless browser DemoRecorder drives
    may act as this user for a short window, without a real Auth.js session —
    mirrors frontend/lib/internal-auth.ts's scheme in reverse (this backend
    mints, frontend/lib/recording-auth.ts verifies). Two separate frontend
    consumers use this: auth.ts's global page gate (repo_id-bound, so a
    captured/logged token can't be replayed to view a different repo's
    page) and backend-client.ts's backendFetch (github_id-bound, so SSR
    prefetches and API-route data calls during the recording resolve to a
    real backend identity instead of 401ing). 60s TTL (matching
    internal_auth's own token lifetime) comfortably covers one page load +
    dwell, not indefinite reuse."""
    if not get_settings().recording_auth_secret:
        raise RuntimeError("RECORDING_AUTH_SECRET is not configured")
    payload = json.dumps(
        {
            "repo_id": repo_id,
            "user_id": user_id,
            "github_id": github_id,
            "exp": int(time.time()) + TOKEN_TTL_SECONDS,
        }
    )
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).rstrip(b"=").decode()
    return f"{payload_b64}.{_sign(payload_b64)}"
