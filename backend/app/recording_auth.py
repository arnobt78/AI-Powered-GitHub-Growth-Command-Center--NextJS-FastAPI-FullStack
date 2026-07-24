import base64
import hashlib
import hmac
import json
import time

from app.config import get_settings

TOKEN_TTL_SECONDS = 300


def _sign(payload_b64: str) -> str:
    settings = get_settings()
    return hmac.new(
        settings.recording_auth_secret.encode(), payload_b64.encode(), hashlib.sha256
    ).hexdigest()


def mint_recording_token(repo_id: int, user_id: int) -> str:
    """Proves to the frontend's auth gate that a specific repo-detail page may
    be viewed, without a real session, by the headless browser DemoRecorder
    drives — mirrors frontend/lib/internal-auth.ts's scheme in reverse (this
    backend mints, frontend/lib/recording-auth.ts verifies). Bound to one
    repo_id so a captured/logged token can't be replayed against a repo the
    minting user doesn't own; 5-minute TTL covers a multi-URL recording
    session's navigation + dwell time, not indefinite reuse."""
    payload = json.dumps(
        {"repo_id": repo_id, "user_id": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    )
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).rstrip(b"=").decode()
    return f"{payload_b64}.{_sign(payload_b64)}"
