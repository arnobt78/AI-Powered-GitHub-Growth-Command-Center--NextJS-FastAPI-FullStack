import base64
import json

from app.recording_auth import mint_recording_token


def test_mint_produces_token_with_payload_and_signature_segments():
    token = mint_recording_token(repo_id=42, user_id=7)
    payload_b64, signature = token.rsplit(".", 1)

    padding = "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))

    assert payload["repo_id"] == 42
    assert payload["user_id"] == 7
    assert isinstance(payload["exp"], int)
    assert isinstance(signature, str) and len(signature) == 64


def test_mint_produces_different_signature_for_different_repo():
    token_a = mint_recording_token(repo_id=1, user_id=7)
    token_b = mint_recording_token(repo_id=2, user_id=7)

    _payload_a, sig_a = token_a.rsplit(".", 1)
    _payload_b, sig_b = token_b.rsplit(".", 1)
    assert sig_a != sig_b
