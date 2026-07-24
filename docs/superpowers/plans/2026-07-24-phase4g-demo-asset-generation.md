# Phase 4G: Demo Asset Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An on-demand "Demo Assets" section on each repo's detail page generates a real screen-recording walkthrough (Playwright + ffmpeg) of that repo's dashboard, stored on local disk, auto-deleted after 3 days.

**Architecture:** A new `DemoAsset` table (not `Draft` — no approval semantics for a self-serving artifact). Two small, dependency-injectable wrapper classes (`DemoRecorder` for Playwright, `VideoCompositor` for ffmpeg) — never called from a pipeline stage, only from a plain background job function (this isn't a multi-candidate LLM process, so it doesn't use the `Stage`/`PipelineRunner` abstraction). A 4th daily APScheduler job does cleanup only (no auto-generation trigger — on-demand only for v1).

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Playwright (Python), ffmpeg (subprocess), pytest (backend); Next.js 16 App Router, TanStack Query, Vitest (frontend).

## Global Constraints

- No `Draft` involvement — `DemoAsset` has its own table with `status`/`video_path`/`error_message`, no approve/reject semantics.
- On-demand trigger only — no auto-trigger wired into 4C's release-notes on-approve flow.
- `DemoRecorder`/`VideoCompositor` are called ONLY from `app/demo_asset_jobs.py::generate_demo_asset` — never from anywhere else.
- Cloud storage (R2/Cloudinary/etc.) is explicitly out of scope — VPS local disk only, behind a storage path abstraction simple enough to swap later.
- A daily cleanup job deletes any `DemoAsset` (row + file) older than `settings.demo_asset_retention_days` (default 3), regardless of status.
- Tests never launch a real browser or invoke real `ffmpeg` — `DemoRecorder`/`VideoCompositor` are mocked in every test that touches `generate_demo_asset`.
- No endpoint path may contain `analytics`/`analysis`/`tracking`/`performance`/`metrics`.
- Full spec: `docs/superpowers/specs/2026-07-24-phase4g-demo-asset-generation-design.md`.

---

### Task 1: `DemoAsset` model + migration

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/<hash>_add_demo_assets_table.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `DemoAsset` model with `id, user_id, repo_id, status, video_path, error_message, created_at`. Consumed by every later task.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_models.py` (add `DemoAsset` to the existing `from app.models import ...` line):

```python
def test_create_demo_asset_defaults_and_persistence():
    db = SessionLocal()
    user = User(
        github_id="777",
        username="demo-tester",
        avatar_url="https://avatars.githubusercontent.com/u/777",
        email=None,
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    repo = Repo(owner="octocat", name="hello-world", user_id=user.id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    asset = DemoAsset(user_id=user.id, repo_id=repo.id)
    db.add(asset)
    db.commit()
    db.refresh(asset)

    assert asset.status == "generating"
    assert asset.video_path is None
    assert asset.error_message is None
    assert asset.created_at is not None

    asset.status = "ready"
    asset.video_path = "42.mp4"
    db.commit()
    db.refresh(asset)

    assert asset.video_path == "42.mp4"
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_models.py::test_create_demo_asset_defaults_and_persistence -v`
Expected: FAIL with `ImportError: cannot import name 'DemoAsset' from 'app.models'`

- [ ] **Step 3: Add the model**

In `backend/app/models.py`, add this class at the end of the file (after `Draft`):

```python
class DemoAsset(Base):
    __tablename__ = "demo_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="generating")
    # Filename relative to settings.demo_assets_dir, null until status="ready".
    video_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_models.py -v`
Expected: all pass, including the new test.

- [ ] **Step 5: Generate and review the migration**

Run: `cd backend && .venv/bin/python -m alembic revision --autogenerate -m "add demo_assets table"`

Confirm `down_revision = '539370c0d34f'` (verify with `.venv/bin/python -m alembic heads` first) and body:

```python
def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        'demo_assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('repo_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('video_path', sa.String(length=500), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['repo_id'], ['repos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('demo_assets')
    # ### end Alembic commands ###
```

Do not run `alembic upgrade head` against a real database — deferred to the Product Owner, same as every prior migration.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/alembic/versions/*_add_demo_assets_table.py backend/tests/test_models.py
git commit -m "feat(4g): add DemoAsset model + migration"
```

---

### Task 2: `DemoRecorder` (Playwright wrapper) + `playwright` dependency

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/app/demo_recorder.py`
- Test: `backend/tests/test_demo_recorder.py`

**Interfaces:**
- Produces: `DemoRecorder().record(urls: list[str], output_dir: str) -> str` (returns the recorded video's file path). Consumed by `app/demo_asset_jobs.py` (Task 4).

- [ ] **Step 1: Add the dependency**

Add `playwright==1.61.0` to `backend/requirements.txt` (alphabetical position, matching the file's existing ordering — check the file first). Install it into the dev venv:

Run: `cd backend && .venv/bin/pip install playwright==1.61.0`

Do **not** run `.venv/bin/playwright install chromium` — downloading and installing a real browser binary is a real deployment-environment step, out of scope for this sandbox (documented as a manual deploy step in `.env.example`, Task 5). This task only needs the Python package importable; no test in this task launches a real browser.

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_demo_recorder.py`:

```python
from unittest.mock import MagicMock, patch

from app.demo_recorder import DemoRecorder


@patch("app.demo_recorder.sync_playwright")
def test_record_launches_browser_and_visits_each_url(mock_sync_playwright):
    mock_page = MagicMock()
    mock_page.video.path.return_value = "/tmp/demo/abc123.webm"
    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_playwright = MagicMock()
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright

    result = DemoRecorder().record(["https://example.com/repos/1"], output_dir="/tmp/demo")

    assert result == "/tmp/demo/abc123.webm"
    mock_browser.new_context.assert_called_once_with(record_video_dir="/tmp/demo", viewport={"width": 1280, "height": 800})
    mock_page.goto.assert_called_once_with("https://example.com/repos/1")
    mock_context.close.assert_called_once()
    mock_browser.close.assert_called_once()


@patch("app.demo_recorder.sync_playwright")
def test_record_visits_multiple_urls_in_order(mock_sync_playwright):
    mock_page = MagicMock()
    mock_page.video.path.return_value = "/tmp/demo/xyz.webm"
    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_playwright = MagicMock()
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright

    DemoRecorder().record(["https://example.com/a", "https://example.com/b"], output_dir="/tmp/demo")

    assert mock_page.goto.call_args_list[0].args[0] == "https://example.com/a"
    assert mock_page.goto.call_args_list[1].args[0] == "https://example.com/b"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_recorder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.demo_recorder'`

- [ ] **Step 4: Implement `DemoRecorder`**

Create `backend/app/demo_recorder.py`:

```python
from playwright.sync_api import sync_playwright


class DemoRecorder:
    """Launches headless Chromium, records a walkthrough of the given URLs,
    returns the path to the raw .webm recording. Playwright writes video
    files to a directory it manages internally via record_video_dir — the
    exact filename isn't known until the context closes and the page
    finishes writing it."""

    def record(self, urls: list[str], output_dir: str) -> str:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(record_video_dir=output_dir, viewport={"width": 1280, "height": 800})
            page = context.new_page()
            for url in urls:
                page.goto(url)
                page.wait_for_timeout(2000)
            video_path = page.video.path()
            context.close()
            browser.close()
            return video_path
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_recorder.py -v`
Expected: `2 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/demo_recorder.py backend/tests/test_demo_recorder.py
git commit -m "feat(4g): add DemoRecorder (Playwright wrapper) + playwright dependency"
```

---

### Task 3: `VideoCompositor` (ffmpeg wrapper)

**Files:**
- Create: `backend/app/video_compositor.py`
- Test: `backend/tests/test_video_compositor.py`

**Interfaces:**
- Produces: `VideoCompositor().to_mp4(input_path: str, output_path: str) -> None`. Consumed by `app/demo_asset_jobs.py` (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_video_compositor.py`:

```python
import subprocess
from unittest.mock import patch

import pytest

from app.video_compositor import VideoCompositor


@patch("app.video_compositor.subprocess.run")
def test_to_mp4_invokes_ffmpeg_with_correct_args(mock_run):
    VideoCompositor().to_mp4("/tmp/raw.webm", "/tmp/out.mp4")

    mock_run.assert_called_once_with(
        ["ffmpeg", "-y", "-i", "/tmp/raw.webm", "-vcodec", "libx264", "-crf", "23", "/tmp/out.mp4"],
        check=True, capture_output=True,
    )


@patch("app.video_compositor.subprocess.run")
def test_to_mp4_propagates_ffmpeg_failure(mock_run):
    mock_run.side_effect = subprocess.CalledProcessError(1, "ffmpeg")

    with pytest.raises(subprocess.CalledProcessError):
        VideoCompositor().to_mp4("/tmp/raw.webm", "/tmp/out.mp4")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_video_compositor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.video_compositor'`

- [ ] **Step 3: Implement `VideoCompositor`**

Create `backend/app/video_compositor.py`:

```python
import subprocess


class VideoCompositor:
    """Converts a raw .webm recording into a shareable .mp4 via the system
    ffmpeg binary. Raises subprocess.CalledProcessError on failure — the
    caller (app/demo_asset_jobs.py) catches this and marks the DemoAsset
    as failed rather than letting it propagate."""

    def to_mp4(self, input_path: str, output_path: str) -> None:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-vcodec", "libx264", "-crf", "23", output_path],
            check=True, capture_output=True,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_video_compositor.py -v`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/video_compositor.py backend/tests/test_video_compositor.py
git commit -m "feat(4g): add VideoCompositor (ffmpeg wrapper)"
```

---

### Task 4: `demo_asset_jobs.py::generate_demo_asset` + config

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Create: `backend/app/demo_asset_jobs.py`
- Test: `backend/tests/test_demo_asset_jobs.py`

**Interfaces:**
- Consumes: `DemoRecorder.record` (Task 2), `VideoCompositor.to_mp4` (Task 3).
- Produces: `generate_demo_asset(db: Session, demo_asset_id: int, urls: list[str]) -> None`. Consumed by the API trigger endpoint (Task 6).

- [ ] **Step 1: Add config fields**

In `backend/app/config.py`, inside `class Settings(BaseSettings):`, add after the existing Phase 4E notification fields:

```python

    # Phase 4G: Demo asset generation
    demo_assets_dir: str = "demo_assets"
    demo_asset_retention_days: int = 3
```

In `backend/.env.example`, add after the Phase 4E block:

```text

# --- Phase 4G: Demo asset generation (both optional, sensible defaults) ---
# Local directory (relative to the backend's working directory) where
# generated .mp4 files are written and served from. Created automatically
# if it doesn't exist.
DEMO_ASSETS_DIR=demo_assets
# How many days a generated demo video is kept before a daily cleanup job
# deletes it (row + file) — keeps a shared VPS from accumulating videos.
DEMO_ASSET_RETENTION_DAYS=3
```

Also document, as a comment block (not an env var — these are real deploy-time system requirements, not app config), that the deployment target needs `ffmpeg` installed (`apt-get install ffmpeg`) and Playwright's Chromium downloaded (`playwright install chromium --with-deps`) as manual one-time steps:

```text

# Phase 4G also requires two system-level installs on the deploy target
# (NOT app config — nothing to set here, just a reminder for the VPS setup):
#   apt-get install -y ffmpeg
#   .venv/bin/playwright install chromium --with-deps
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_demo_asset_jobs.py`:

```python
from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.demo_asset_jobs import generate_demo_asset
from app.models import DemoAsset, Repo


def _seed_demo_asset(user_id: int) -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    asset = DemoAsset(user_id=user_id, repo_id=repo.id)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id
    db.close()
    return repo.id, asset_id


@patch("app.demo_asset_jobs.broadcaster.publish")
@patch("app.demo_asset_jobs.os.remove")
@patch("app.demo_asset_jobs.VideoCompositor")
@patch("app.demo_asset_jobs.DemoRecorder")
def test_generate_demo_asset_success_marks_ready(mock_recorder_cls, mock_compositor_cls, mock_os_remove, mock_publish, seed_user):
    _repo_id, asset_id = _seed_demo_asset(seed_user)

    mock_recorder = MagicMock()
    mock_recorder.record.return_value = "/tmp/demo_assets/raw.webm"
    mock_recorder_cls.return_value = mock_recorder
    mock_compositor_cls.return_value = MagicMock()

    db = SessionLocal()
    generate_demo_asset(db, asset_id, urls=["https://example.com/repos/1"])

    asset = db.get(DemoAsset, asset_id)
    assert asset.status == "ready"
    assert asset.video_path == f"{asset_id}.mp4"
    assert asset.error_message is None
    mock_publish.assert_called_once_with("demo_asset_updated", {"id": asset_id, "status": "ready"}, user_id=seed_user)
    db.close()


@patch("app.demo_asset_jobs.broadcaster.publish")
@patch("app.demo_asset_jobs.DemoRecorder")
def test_generate_demo_asset_failure_marks_failed(mock_recorder_cls, mock_publish, seed_user):
    _repo_id, asset_id = _seed_demo_asset(seed_user)

    mock_recorder = MagicMock()
    mock_recorder.record.side_effect = RuntimeError("browser launch failed")
    mock_recorder_cls.return_value = mock_recorder

    db = SessionLocal()
    generate_demo_asset(db, asset_id, urls=["https://example.com/repos/1"])

    asset = db.get(DemoAsset, asset_id)
    assert asset.status == "failed"
    assert asset.error_message == "browser launch failed"
    mock_publish.assert_called_once_with("demo_asset_updated", {"id": asset_id, "status": "failed"}, user_id=seed_user)
    db.close()
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_asset_jobs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.demo_asset_jobs'`

- [ ] **Step 4: Implement `generate_demo_asset`**

Create `backend/app/demo_asset_jobs.py`:

```python
import os

from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_recorder import DemoRecorder
from app.events import broadcaster
from app.models import DemoAsset
from app.video_compositor import VideoCompositor


def generate_demo_asset(db: Session, demo_asset_id: int, urls: list[str]) -> None:
    settings = get_settings()
    asset = db.get(DemoAsset, demo_asset_id)
    os.makedirs(settings.demo_assets_dir, exist_ok=True)

    try:
        raw_path = DemoRecorder().record(urls, output_dir=settings.demo_assets_dir)
        mp4_filename = f"{demo_asset_id}.mp4"
        mp4_path = os.path.join(settings.demo_assets_dir, mp4_filename)
        VideoCompositor().to_mp4(raw_path, mp4_path)
        os.remove(raw_path)
        asset.status = "ready"
        asset.video_path = mp4_filename
    except Exception as exc:
        asset.status = "failed"
        asset.error_message = str(exc)

    db.commit()
    broadcaster.publish("demo_asset_updated", {"id": asset.id, "status": asset.status}, user_id=asset.user_id)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_asset_jobs.py -v`
Expected: `2 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/.env.example backend/app/demo_asset_jobs.py backend/tests/test_demo_asset_jobs.py
git commit -m "feat(4g): add generate_demo_asset job + demo asset config"
```

---

### Task 5: `cleanup_expired_demo_assets` + 4th daily scheduler job

**Files:**
- Modify: `backend/app/demo_asset_jobs.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_demo_asset_jobs.py`

**Interfaces:**
- Produces: `cleanup_expired_demo_assets(db: Session) -> None`. Wired into `app/main.py`'s scheduler as a 4th daily job.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_demo_asset_jobs.py`:

```python
from datetime import datetime, timedelta, timezone

from app.demo_asset_jobs import cleanup_expired_demo_assets


@patch("app.demo_asset_jobs.os.path.exists")
@patch("app.demo_asset_jobs.os.remove")
def test_cleanup_deletes_expired_assets_and_files(mock_os_remove, mock_os_exists, seed_user):
    mock_os_exists.return_value = True

    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    old_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="ready", video_path="old.mp4",
        created_at=datetime.now(timezone.utc) - timedelta(days=5),
    )
    recent_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="ready", video_path="recent.mp4",
        created_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add_all([old_asset, recent_asset])
    db.commit()
    old_id, recent_id = old_asset.id, recent_asset.id

    cleanup_expired_demo_assets(db)

    assert db.get(DemoAsset, old_id) is None
    assert db.get(DemoAsset, recent_id) is not None
    mock_os_remove.assert_called_once()
    db.close()


@patch("app.demo_asset_jobs.os.path.exists")
@patch("app.demo_asset_jobs.os.remove")
def test_cleanup_deletes_failed_assets_with_no_file(mock_os_remove, mock_os_exists, seed_user):
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    failed_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="failed", video_path=None,
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    db.add(failed_asset)
    db.commit()
    failed_id = failed_asset.id

    cleanup_expired_demo_assets(db)

    assert db.get(DemoAsset, failed_id) is None
    mock_os_remove.assert_not_called()
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_asset_jobs.py -v -k cleanup`
Expected: FAIL with `ImportError: cannot import name 'cleanup_expired_demo_assets'`

- [ ] **Step 3: Implement `cleanup_expired_demo_assets`**

In `backend/app/demo_asset_jobs.py`, add the import and function:

```python
from datetime import datetime, timedelta, timezone
```

```python
def cleanup_expired_demo_assets(db: Session) -> None:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.demo_asset_retention_days)
    expired = db.query(DemoAsset).filter(DemoAsset.created_at < cutoff).all()
    for asset in expired:
        if asset.video_path:
            full_path = os.path.join(settings.demo_assets_dir, asset.video_path)
            if os.path.exists(full_path):
                os.remove(full_path)
        db.delete(asset)
    db.commit()
```

- [ ] **Step 4: Wire the scheduler job**

In `backend/app/main.py`, add the import:

```python
from app.pipeline.opportunity_jobs import run_opportunities_pipeline_for_all_repos
```

(already present — confirm it's there, then add alongside it:)

```python
from app.demo_asset_jobs import cleanup_expired_demo_assets
```

Add a new scheduler wrapper function, near `_scheduled_opportunities_run`:

```python
def _scheduled_demo_asset_cleanup() -> None:
    db = SessionLocal()
    try:
        cleanup_expired_demo_assets(db)
    finally:
        db.close()
```

In the `lifespan` function, after the existing `scheduler.add_job(_scheduled_opportunities_run, ...)` call, add a 4th job. This one is a cheap filesystem/DB cleanup, not an external API call, so it doesn't need the same rate-limit-avoiding stagger as the other three — run it once daily, offset by 1 hour from startup so it doesn't compete with the other jobs' startup-time initialization:

```python
    scheduler.add_job(
        _scheduled_demo_asset_cleanup,
        "interval",
        hours=24,
        id="daily_demo_asset_cleanup",
        next_run_time=datetime.now() + timedelta(hours=1),
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_asset_jobs.py -v`
Expected: all 4 pass (2 from Task 4 + 2 new).

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, no regressions (confirms the `main.py` change didn't break anything).

- [ ] **Step 6: Commit**

```bash
git add backend/app/demo_asset_jobs.py backend/app/main.py backend/tests/test_demo_asset_jobs.py
git commit -m "feat(4g): add cleanup_expired_demo_assets + 4th daily scheduler job"
```

---

### Task 6: Backend API — `POST`/`GET /repos/{repo_id}/demo-assets`

**Files:**
- Create: `backend/app/api/demo_assets.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_demo_assets_api.py`

**Interfaces:**
- Consumes: `generate_demo_asset` (Task 4).
- Produces: `POST /repos/{repo_id}/demo-assets` (202, `BackgroundTasks`), `GET /repos/{repo_id}/demo-assets -> list[DemoAssetOut]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_demo_assets_api.py`, mirroring `tests/test_insights_extra_endpoints.py`'s `_require_repo`-style per-repo test pattern (read that file first):

```python
from unittest.mock import patch

from app.db import SessionLocal
from app.models import DemoAsset, Repo


def _seed_repo(user_id: int) -> int:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    repo_id = repo.id
    db.close()
    return repo_id


def test_trigger_demo_asset_returns_202_and_creates_generating_row(client, seed_user):
    repo_id = _seed_repo(seed_user)

    with patch("app.api.demo_assets._background_generate_demo_asset"):
        resp = client.post(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 202

    db = SessionLocal()
    assets = db.query(DemoAsset).filter_by(repo_id=repo_id).all()
    assert len(assets) == 1
    assert assets[0].status == "generating"
    db.close()


def test_trigger_demo_asset_404_for_other_users_repo(client, other_user_client):
    repo_id = _seed_repo(other_user_client.test_user_id)

    resp = client.post(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 404


def test_list_demo_assets_returns_current_users_assets(client, seed_user):
    repo_id = _seed_repo(seed_user)
    db = SessionLocal()
    db.add(DemoAsset(user_id=seed_user, repo_id=repo_id, status="ready", video_path="1.mp4"))
    db.commit()
    db.close()

    resp = client.get(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "ready"


def test_list_demo_assets_404_for_other_users_repo(client, other_user_client):
    repo_id = _seed_repo(other_user_client.test_user_id)

    resp = client.get(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_assets_api.py -v`
Expected: FAIL — `404 Not Found` for both routes (they don't exist yet).

- [ ] **Step 3: Implement the router**

Create `backend/app/api/demo_assets.py`:

```python
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.demo_asset_jobs import generate_demo_asset
from app.deps import require_api_key, require_user
from app.models import DemoAsset, Repo, User
from app.rate_limit import limiter

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


def _require_repo(repo_id: int, db: Session, current_user: User) -> Repo:
    repo = db.execute(
        select(Repo).where(Repo.id == repo_id, Repo.user_id == current_user.id)
    ).scalars().first()
    if repo is None:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


@router.get("/{repo_id}/demo-assets", response_model=list[DemoAssetOut])
def list_demo_assets(
    repo_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> list[DemoAsset]:
    _require_repo(repo_id, db, current_user)
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
    repo = _require_repo(repo_id, db, current_user)
    asset = DemoAsset(user_id=current_user.id, repo_id=repo.id, status="generating")
    db.add(asset)
    db.commit()
    db.refresh(asset)

    settings = get_settings()
    urls = [f"{settings.frontend_base_url}/repos/{repo.id}"]
    background_tasks.add_task(_background_generate_demo_asset, asset.id, urls)
    return TriggerDemoAssetOut(status="started")


def _background_generate_demo_asset(demo_asset_id: int, urls: list[str]) -> None:
    db = SessionLocal()
    try:
        generate_demo_asset(db, demo_asset_id, urls)
    finally:
        db.close()
```

In `backend/app/main.py`, add the import and registration:

```python
from app.api.demo_assets import router as demo_assets_router
```

```python
app.include_router(demo_assets_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_assets_api.py -v`
Expected: `4 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, `pip-audit` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/demo_assets.py backend/app/main.py backend/tests/test_demo_assets_api.py
git commit -m "feat(4g): add POST/GET /repos/{id}/demo-assets API"
```

---

### Task 7: Backend API — `GET /demo-assets/{id}/video`

**Files:**
- Modify: `backend/app/api/demo_assets.py`
- Test: `backend/tests/test_demo_assets_api.py`

**Interfaces:**
- Produces: `GET /demo-assets/{demo_asset_id}/video -> FileResponse`. 404 if not found, not owned by the caller, or not yet `"ready"`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_demo_assets_api.py`:

```python
import os

from app.config import get_settings


def _seed_ready_asset(user_id: int, repo_id: int, filename: str) -> int:
    settings = get_settings()
    os.makedirs(settings.demo_assets_dir, exist_ok=True)
    full_path = os.path.join(settings.demo_assets_dir, filename)
    with open(full_path, "wb") as f:
        f.write(b"fake mp4 bytes")

    db = SessionLocal()
    asset = DemoAsset(user_id=user_id, repo_id=repo_id, status="ready", video_path=filename)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id
    db.close()
    return asset_id


def test_get_video_returns_file_for_ready_asset(client, seed_user):
    repo_id = _seed_repo(seed_user)
    asset_id = _seed_ready_asset(seed_user, repo_id, "test-video.mp4")

    resp = client.get(f"/demo-assets/{asset_id}/video")

    assert resp.status_code == 200
    assert resp.content == b"fake mp4 bytes"


def test_get_video_404_for_not_ready_asset(client, seed_user):
    repo_id = _seed_repo(seed_user)
    db = SessionLocal()
    asset = DemoAsset(user_id=seed_user, repo_id=repo_id, status="generating")
    db.add(asset)
    db.commit()
    asset_id = asset.id
    db.close()

    resp = client.get(f"/demo-assets/{asset_id}/video")

    assert resp.status_code == 404


def test_get_video_404_for_other_users_asset(client, other_user_client):
    repo_id = _seed_repo(other_user_client.test_user_id)
    asset_id = _seed_ready_asset(other_user_client.test_user_id, repo_id, "other-video.mp4")

    resp = client.get(f"/demo-assets/{asset_id}/video")

    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_assets_api.py -v -k video`
Expected: FAIL — `404 Not Found` for the route (doesn't exist yet).

- [ ] **Step 3: Implement the video-serving route**

In `backend/app/api/demo_assets.py`, add a second router (different prefix, since this endpoint isn't nested under `/repos/{repo_id}`) and its route. Add these imports:

```python
import os

from fastapi.responses import FileResponse
```

Add a second router instance and route at the end of the file:

```python
video_router = APIRouter(prefix="/demo-assets", tags=["demo-assets"], dependencies=[Depends(require_api_key)])


@video_router.get("/{demo_asset_id}/video")
def get_demo_asset_video(
    demo_asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> FileResponse:
    asset = db.execute(
        select(DemoAsset).where(DemoAsset.id == demo_asset_id, DemoAsset.user_id == current_user.id)
    ).scalars().first()
    if asset is None or asset.status != "ready" or not asset.video_path:
        raise HTTPException(status_code=404, detail="Demo asset not found")

    settings = get_settings()
    full_path = os.path.join(settings.demo_assets_dir, asset.video_path)
    return FileResponse(full_path, media_type="video/mp4")
```

In `backend/app/main.py`, register the second router alongside the first:

```python
from app.api.demo_assets import router as demo_assets_router, video_router as demo_assets_video_router
```

```python
app.include_router(demo_assets_router)
app.include_router(demo_assets_video_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_demo_assets_api.py -v`
Expected: `7 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, pristine output.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/demo_assets.py backend/app/main.py backend/tests/test_demo_assets_api.py
git commit -m "feat(4g): add GET /demo-assets/{id}/video"
```

---

### Task 8: Frontend types, API client, hooks, SSE mapping

**Files:**
- Modify: `frontend/lib/query-keys.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/api-types.ts`
- Modify: `frontend/hooks/use-live-events.ts`
- Create: `frontend/app/api/repos/[id]/demo-assets/route.ts`
- Create: `frontend/hooks/use-demo-assets.ts`
- Test: `frontend/tests/use-live-events.test.tsx` (extend)

**Interfaces:**
- Consumes: `DemoAssetOut` (regenerated OpenAPI type).
- Produces: `queryKeys.demoAssets.all`, `api.listDemoAssets(repoId)`, `api.triggerDemoAsset(repoId)`, `useDemoAssets(repoId)`, `useTriggerDemoAsset()`. Consumed by the frontend component (Task 9).

- [ ] **Step 1: Regenerate OpenAPI types**

Start the local backend (`.venv/bin/uvicorn app.main:app --reload` from `backend/`, real local Postgres already running, `backend/.env` already has a working `DATABASE_URL`), then from `frontend/`: `npm run generate:types`. Confirm with `grep -n "DemoAssetOut" frontend/types/api.d.ts` — expect a match with `id`, `repo_id`, `status`, `video_path`, `error_message`, `created_at`. Stop the backend afterward.

- [ ] **Step 2: Add the query key**

In `frontend/lib/query-keys.ts`, add after the existing `opportunities` entry:

```ts
  demoAssets: {
    all: ["demo-assets"] as const,
  },
```

- [ ] **Step 3: Add `api.listDemoAssets`/`api.triggerDemoAsset`**

In `frontend/lib/api.ts`, add `DemoAsset` to the existing `import type { ... } from "@/lib/api-types"` line, and add these two methods after the existing `listOpportunities`/`dismissOpportunity` methods:

```ts
  listDemoAssets: (repoId: number) => backendFetch<DemoAsset[]>(`/repos/${repoId}/demo-assets`),
  triggerDemoAsset: (repoId: number) =>
    backendFetch<{ status: string }>(`/repos/${repoId}/demo-assets`, { method: "POST" }),
```

In `frontend/lib/api-types.ts`, add:

```ts
export type DemoAsset = components["schemas"]["DemoAssetOut"];
```

- [ ] **Step 4: Add the SSE mapping**

In `frontend/hooks/use-live-events.ts`, add to `EVENT_QUERY_MAP` (after the existing `opportunity_updated` entry):

```ts
  demo_asset_updated: [queryKeys.demoAssets.all],
```

- [ ] **Step 5: Create the Route Handler**

Create `frontend/app/api/repos/[id]/demo-assets/route.ts`:

```ts
import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRoute(() => api.listDemoAssets(Number(id)));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRoute(() => api.triggerDemoAsset(Number(id)));
}
```

- [ ] **Step 6: Create the hooks**

Create `frontend/hooks/use-demo-assets.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { DemoAsset } from "@/lib/api-types";

export function useDemoAssets(repoId: number) {
  return useQuery({
    queryKey: queryKeys.demoAssets.all,
    queryFn: () => fetchJson<DemoAsset[]>(`/api/repos/${repoId}/demo-assets`),
  });
}

export function useTriggerDemoAsset(repoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ status: string }>(`/api/repos/${repoId}/demo-assets`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.demoAssets.all });
    },
  });
}
```

(`useDemoAssets`'s query key is account-wide (`demoAssets.all`), not repo-scoped — matches the spec's stated reasoning: the UI always shows one repo's assets via a filtered client fetch scoped by the URL path, not a per-repo cache key. `useTriggerDemoAsset` uses `invalidateQueries` rather than `setQueryData` since the trigger response doesn't return the new list — a full refetch is correct here, matching `useTriggerContentRun`'s existing pattern from the Drafts page.)

- [ ] **Step 7: Extend the SSE-mapping test**

In `frontend/tests/use-live-events.test.tsx`, add one test case following the file's exact established idiom (read the file first for the precedent, e.g. how the `opportunities_generated`/`opportunity_updated` tests are written):

```tsx
it("invalidates demoAssets.all when demo_asset_updated arrives", () => {
  const { invalidateSpy } = renderHarness();
  emit("demo_asset_updated", { id: 1, status: "ready" });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.demoAssets.all });
});
```

Adjust the exact helper names (`renderHarness`, `emit`) to match whatever this file's real helpers are actually called.

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all pass, zero errors/warnings.

- [ ] **Step 9: Commit**

```bash
git add frontend/types/api.d.ts frontend/lib/query-keys.ts frontend/lib/api.ts frontend/lib/api-types.ts frontend/hooks/use-live-events.ts frontend/hooks/use-demo-assets.ts frontend/app/api/repos/ frontend/tests/
git commit -m "feat(4g): add demo assets API client, hooks, SSE mapping"
```

---

### Task 9: `DemoAssetsSection` component + repo-detail page wiring

**Files:**
- Create: `frontend/components/repo-detail/demo-assets-section.tsx`
- Modify: `frontend/components/repo-detail/repo-detail-client.tsx`
- Test: `frontend/tests/demo-assets-section.test.tsx`

**Interfaces:**
- Consumes: `useDemoAssets`, `useTriggerDemoAsset` (Task 8).
- Produces: `<DemoAssetsSection repoId={number} />`, rendered inside `RepoDetailClient`.

- [ ] **Step 1: Write the failing test**

First read `frontend/components/opportunities/opportunities-client.tsx` and its test file (the most recent precedent for a status-badge-driven list) for the mocking convention. Create `frontend/tests/demo-assets-section.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoAssetsSection } from "@/components/repo-detail/demo-assets-section";
import * as useDemoAssetsModule from "@/hooks/use-demo-assets";

function mockHooks(assets: unknown[], mutate = vi.fn()) {
  vi.spyOn(useDemoAssetsModule, "useDemoAssets").mockReturnValue({ data: assets } as ReturnType<typeof useDemoAssetsModule.useDemoAssets>);
  vi.spyOn(useDemoAssetsModule, "useTriggerDemoAsset").mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useDemoAssetsModule.useTriggerDemoAsset>);
}

describe("DemoAssetsSection", () => {
  it("shows an empty state when no assets exist yet", () => {
    mockHooks([]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText(/no demo/i)).toBeInTheDocument();
  });

  it("calls the trigger mutation when Generate is clicked", () => {
    const mutate = vi.fn();
    mockHooks([], mutate);
    render(<DemoAssetsSection repoId={1} />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a video element and download link for a ready asset", () => {
    mockHooks([{ id: 1, repo_id: 1, status: "ready", video_path: "1.mp4", error_message: null, created_at: "2026-07-24T00:00:00Z" }]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute("href", "/api/demo-assets/1/video");
  });

  it("shows the error message for a failed asset", () => {
    mockHooks([{ id: 1, repo_id: 1, status: "failed", video_path: null, error_message: "ffmpeg not found", created_at: "2026-07-24T00:00:00Z" }]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText("ffmpeg not found")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/demo-assets-section.test.tsx`
Expected: FAIL — module `@/components/repo-detail/demo-assets-section` not found.

- [ ] **Step 3: Implement the component**

You'll need a Route Handler proxying the video download link too — create `frontend/app/api/demo-assets/[id]/video/route.ts`:

```ts
import { auth } from "@/auth";
import { mintInternalUserToken } from "@/lib/internal-auth";

const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const githubId = session?.user?.id;
  if (!githubId) {
    return new Response("Not authenticated", { status: 401 });
  }

  const res = await fetch(`${BASE_URL}/demo-assets/${id}/video`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "X-Internal-User-Token": mintInternalUserToken(githubId),
    },
  });

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "video/mp4" },
  });
}
```

(This one streams a binary file through, unlike every other Route Handler in this codebase which proxies JSON via `proxyRoute` — read `frontend/lib/route-handler.ts` and `frontend/lib/backend-client.ts` first to confirm `mintInternalUserToken`'s exact import path and signature before using it here, since this route bypasses `backendFetch`/`proxyRoute` entirely to stream the raw response body.)

Create `frontend/components/repo-detail/demo-assets-section.tsx`:

```tsx
"use client";

import { Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useDemoAssets, useTriggerDemoAsset } from "@/hooks/use-demo-assets";

const STATUS_LABELS: Record<string, string> = {
  generating: "Generating…",
  ready: "Ready",
  failed: "Failed",
};

export function DemoAssetsSection({ repoId }: { repoId: number }) {
  const { data: assets } = useDemoAssets(repoId);
  const trigger = useTriggerDemoAsset(repoId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading icon={Clapperboard} title="Demo Assets" iconColor="text-cyan-500" />
        <Button
          onClick={() =>
            trigger.mutate(undefined, { onError: () => toast.error("Could not start demo generation") })
          }
          disabled={trigger.isPending}
        >
          {trigger.isPending ? "Starting..." : "Generate"}
        </Button>
      </div>

      {assets && assets.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No demo videos yet" description="Click Generate to record a walkthrough." />
      ) : (
        <div className="space-y-2">
          {assets?.map((asset) => (
            <Card key={asset.id}>
              <CardContent className="py-3">
                <p className="text-sm font-medium">{STATUS_LABELS[asset.status] ?? asset.status}</p>
                {asset.status === "failed" && asset.error_message && (
                  <p className="mt-1 text-xs text-red-500">{asset.error_message}</p>
                )}
                {asset.status === "ready" && (
                  <div className="mt-2 space-y-2">
                    <video controls className="w-full max-w-md rounded-md" src={`/api/demo-assets/${asset.id}/video`} />
                    <a href={`/api/demo-assets/${asset.id}/video`} download className="text-sm text-sky-500 hover:underline">
                      Download
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into `RepoDetailClient`**

In `frontend/components/repo-detail/repo-detail-client.tsx`, add the import and render the new section after `<RepoRecommendations repoId={repo.id} />`:

```tsx
import { DemoAssetsSection } from "@/components/repo-detail/demo-assets-section";
```

```tsx
      <RepoRecommendations repoId={repo.id} />
      <DemoAssetsSection repoId={repo.id} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/demo-assets-section.test.tsx`
Expected: `4 passed`

Then the full frontend verification (this is the final task in the plan, and the final sub-project in the whole Phase 4 build sequence):

Run: `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npx next build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/repo-detail/demo-assets-section.tsx frontend/components/repo-detail/repo-detail-client.tsx frontend/app/api/demo-assets/ frontend/tests/demo-assets-section.test.tsx
git commit -m "feat(4g): add DemoAssetsSection to repo detail page"
```

---

## Final whole-branch review

After all 9 tasks: dispatch a final whole-branch code reviewer (opus, per this project's established pattern) covering the full diff since this plan's first commit. Confirm: backend full suite passes with no warnings, `pip-audit` clean; frontend `tsc`/`eslint`/`vitest`/`next build` all clean; `DemoRecorder`/`VideoCompositor` are genuinely called only from `generate_demo_asset`, never anywhere else (grep the whole diff); the cleanup job's cutoff logic is correct (deletes strictly older than the retention window, not newer); per-user/per-repo isolation holds on all 3 new endpoints (404 not 403); the video-serving endpoint never returns a file for a non-`"ready"` or not-owned asset. This is the final sub-project in the Product Owner's authorized Phase 4 build sequence — after this review, update `.agile-v/REQUIREMENTS.md` (new REQ), `.agile-v/STATE.md`, `docs/PROJECT_PLAN.md` (mark 4G done), and `docs/PROJECT_WALKTHROUGH.md` before the Product Owner's Gate 2 review, same as every prior sub-project.
