"""Shared FastAPI dependencies — auth and tenant-safe row loading.

Educational walkthrough
-----------------------
Defense in depth (two layers on most routes):

1. ``require_api_key`` — shared service secret between Next.js BFF and this API.
   The browser never sees this key; Route Handlers attach it server-side.

2. ``require_user`` — HMAC-signed ``X-Internal-User-Token`` minted by the
   frontend from the Auth.js session (or recording identity). Proves *which*
   GitHub user the request is for after the API key has already passed.

3. ``get_owned_or_404`` — always filter by ``user_id`` in SQL. Return 404 (not
   403) for cross-tenant access so callers cannot probe whether an id exists.
"""

from typing import TypeVar

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.internal_auth import verify_internal_user_token
from app.models import User

ModelT = TypeVar("ModelT")


def require_api_key(authorization: str = Header(default="")) -> None:
    """Reject requests that lack the exact ``Authorization: Bearer <API_KEY>`` header."""
    settings = get_settings()
    expected = f"Bearer {settings.api_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def require_user(
    x_internal_user_token: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the current ``User`` row from the signed internal token header."""
    if not x_internal_user_token:
        raise HTTPException(status_code=401, detail="Invalid or missing user token")

    try:
        github_id = verify_internal_user_token(x_internal_user_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or missing user token")

    user = db.execute(select(User).where(User.github_id == github_id)).scalars().first()
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or missing user token")
    return user


def get_owned_or_404(db: Session, model: type[ModelT], id_: int, user_id: int, resource_name: str) -> ModelT:
    """Fetch a row scoped by user_id, or raise 404 — never fetch-then-check.

    Cross-user access to an existing row returns 404 like a missing one, never
    403, so an unauthorized caller can't distinguish "not yours" from "doesn't
    exist" (no existence leak).
    """
    obj = db.execute(select(model).where(model.id == id_, model.user_id == user_id)).scalars().first()
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{resource_name} not found")
    return obj
