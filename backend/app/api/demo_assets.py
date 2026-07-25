"""Demo asset (walkthrough video) generation and authenticated streaming.

Educational walkthrough
-----------------------
1. ``POST /repos/{id}/demo-assets`` creates a ``generating`` row, mints a
   short-lived recording token, and schedules Playwright+ffmpeg in the background.
2. Headless Chromium opens the frontend with ``?recording_token=…`` (no cookie).
3. ``GET /demo-assets/{id}/video`` streams the mp4 once ``status=ready``.

Requires matching ``RECORDING_AUTH_SECRET`` on backend + frontend, plus
``FRONTEND_BASE_URL``, ffmpeg, and Playwright Chromium on the host.
"""

import os
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.demo_asset_jobs import generate_demo_asset
from app.deps import get_owned_or_404, require_api_key, require_user
from app.models import DemoAsset, Repo, User
from app.rate_limit import limiter
from app.recording_auth import mint_recording_token

router = APIRouter(prefix="/repos", tags=["demo-assets"], dependencies=[Depends(require_api_key)])


class DemoAssetOut(BaseModel):
    id: int
    repo_id: int
    status: str
    video_path: str | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TriggerDemoAssetOut(BaseModel):
    status: str


@router.get("/{repo_id}/demo-assets", response_model=list[DemoAssetOut])
def list_demo_assets(
    repo_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> list[DemoAsset]:
    get_owned_or_404(db, Repo, repo_id, current_user.id, "Repo")
    return db.execute(
        select(DemoAsset).where(DemoAsset.repo_id == repo_id).order_by(DemoAsset.created_at.desc())
    ).scalars().all()


@router.post("/{repo_id}/demo-assets", response_model=TriggerDemoAssetOut, status_code=202)
@limiter.limit("10/minute")
def trigger_demo_asset(
    repo_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> TriggerDemoAssetOut:
    repo = get_owned_or_404(db, Repo, repo_id, current_user.id, "Repo")
    asset = DemoAsset(user_id=current_user.id, repo_id=repo.id, status="generating")
    db.add(asset)
    db.commit()
    db.refresh(asset)

    settings = get_settings()
    recording_token = mint_recording_token(repo_id=repo.id, user_id=current_user.id, github_id=current_user.github_id)
    urls = [f"{settings.frontend_base_url}/repos/{repo.id}?recording_token={recording_token}"]
    background_tasks.add_task(_background_generate_demo_asset, asset.id, urls)
    return TriggerDemoAssetOut(status="started")


def _background_generate_demo_asset(demo_asset_id: int, urls: list[str]) -> None:
    db = SessionLocal()
    try:
        generate_demo_asset(db, demo_asset_id, urls)
    finally:
        db.close()


video_router = APIRouter(prefix="/demo-assets", tags=["demo-assets"], dependencies=[Depends(require_api_key)])


@video_router.get("/{demo_asset_id}/video")
def get_demo_asset_video(
    demo_asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> FileResponse:
    asset = get_owned_or_404(db, DemoAsset, demo_asset_id, current_user.id, "Demo asset")
    if asset.status != "ready" or not asset.video_path:
        raise HTTPException(status_code=404, detail="Demo asset not found")

    settings = get_settings()
    full_path = os.path.join(settings.demo_assets_dir, asset.video_path)
    return FileResponse(full_path, media_type="video/mp4")
