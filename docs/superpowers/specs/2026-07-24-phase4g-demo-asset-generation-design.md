# Phase 4G: Demo Asset Generation — Design Spec

Sub-project 4G of `docs/PROJECT_PLAN.md`'s Phase 4 (Professional Automation & Growth Platform). Depends on 4A only — investigation confirmed the roadmap's claimed "depends on 4C" dependency is unbuilt (4C's own spec explicitly deferred the demo-asset-regen hook, matching the same pattern found and corrected in 4F's brainstorm for its claimed 4D dependency).

This is the fifth and final sub-project in the Product Owner's authorized Phase 4 build sequence (4E, 4C, 4D, 4F already shipped).

## Three investigation findings that shaped this design

1. **New runtime tooling, not just new code.** Every prior Phase 4 sub-project only needed Python/TypeScript code. This is the first needing `ffmpeg` (a system binary, not installed in the dev sandbox) and Playwright (a browser-automation library with its own downloaded browser binaries, not yet a dependency anywhere in this codebase). Recording "the live dashboard" also requires an actual running, deployed instance with real data — this project isn't deployed yet (VPS/Vercel deployment is still pending, gated separately per POL-0006). The design below builds the code with both integrations behind small, dependency-injectable wrapper classes (mirroring `HackerNewsClient`'s testable shape), tested with fakes exactly like every other external integration in this codebase (`GitHubClient`, `LLMRouter`, `EmailClient`, `HackerNewsClient` are all tested via mocks, never live calls). Genuine live end-to-end recording is deferred to the Product Owner once deployed, matching the established pattern for every prior live-verification step (OAuth sign-in, real email send, real GitHub post).
2. **4C→4G auto-trigger doesn't exist.** Confirmed via grep (`demo|video|ffmpeg|playwright` across `app/` — zero hits) and by reading 4C's own spec, which explicitly states "4C leaves no half-built hook for it, since 4G's design will define what it actually needs." Product-Owner-confirmed decision: 4G ships on-demand only for v1; wiring an auto-trigger into 4C's on-approve flow is a deliberate, deferred fast-follow, not part of this build.
3. **This doesn't fit Draft-and-approve.** Unlike 4C/4F (LLM-generated content with real hallucination/reputational risk that a human must review before anything external happens), a screen recording of your own dashboard has no correctness-to-review step and posts nowhere external by itself. Architecturally this is closer to 4D's `Opportunity` precedent (a generated artifact you view, no approval semantics) than to `Draft`.

## Data model: `DemoAsset`

```python
class DemoAsset(Base):
    __tablename__ = "demo_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="generating")  # "generating" | "ready" | "failed"
    # Local filesystem path (relative to settings.demo_assets_dir), null until status="ready".
    video_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

## Storage: VPS local disk now, cloud storage explicitly deferred

Videos are written to a local directory (`settings.demo_assets_dir`, default `"demo_assets"` relative to the backend's working directory — created on first use if missing) and served back through a new authenticated Route via `fastapi.responses.FileResponse`. Product-Owner-confirmed decision: a parallel cloud-storage backend (Cloudflare R2, Cloudinary, ImageKit, or another generous-free-tier provider) is a real, wanted future addition, but not built now — it needs a provider choice and real credentials from the Product Owner first, matching how every other external service in this project got added (Resend, GitHub OAuth App). Storage access is isolated behind one small function (`save_video`/`get_video_path` in the new job module) so swapping in a cloud backend later is a contained change, not a rewrite.

## Automatic cleanup: keep the shared VPS healthy

Product-Owner-confirmed requirement: this VPS hosts multiple personal projects and other people may use this one as a showcase — generated videos must not accumulate indefinitely. A new daily APScheduler job (`_scheduled_demo_asset_cleanup`, the 4th daily job, no particular stagger needed since it's a cheap filesystem/DB operation, not an external API call) deletes any `DemoAsset` row (and its file, if present) older than `settings.demo_asset_retention_days` (default `3`, matching the Product Owner's suggested 1–3 day range) — `created_at < now() - retention_days`, regardless of status (a `"failed"` row with no file is just as much clutter as a `"ready"` one).

## Recording + compositing: two small, injectable wrapper classes

**`DemoRecorder`** (`backend/app/demo_recorder.py`, new) wraps Playwright:

```python
from playwright.sync_api import sync_playwright


class DemoRecorder:
    """Launches headless Chromium, records a walkthrough of the given URLs,
    returns the path to the raw recording. Playwright writes video files
    (.webm) to a directory it manages internally via record_video_dir."""

    def record(self, urls: list[str], output_dir: str) -> str:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(record_video_dir=output_dir, viewport={"width": 1280, "height": 800})
            page = context.new_page()
            for url in urls:
                page.goto(url)
                page.wait_for_timeout(2000)  # let the page settle/render before moving on
            video_path = page.video.path()
            context.close()
            browser.close()
            return video_path
```

**`VideoCompositor`** (`backend/app/video_compositor.py`, new) wraps `ffmpeg` via `subprocess`:

```python
import subprocess


class VideoCompositor:
    """Converts a raw .webm recording into a shareable .mp4. Raises
    subprocess.CalledProcessError on failure (caught by the caller)."""

    def to_mp4(self, input_path: str, output_path: str) -> None:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-vcodec", "libx264", "-crf", "23", output_path],
            check=True, capture_output=True,
        )
```

Both classes take no constructor arguments (no credentials — Playwright/ffmpeg are local tools, not authenticated services), so tests inject a `MagicMock()`/fake subclass directly rather than a `http_client=` swap like the other clients in this codebase.

## Generation job: a plain background function, not the Stage/PipelineRunner pipeline

This isn't a multi-candidate LLM process — there's no "best of 3," no judge, no `ContentTask`. Forcing it into the `Stage`/`PipelineRunner` abstraction built for the analytics/content pipelines would be a bad fit for a fundamentally different, deterministic two-step job (record, then composite). `backend/app/demo_asset_jobs.py` (new):

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
        os.remove(raw_path)  # raw .webm is intermediate — only the composited mp4 is kept
        asset.status = "ready"
        asset.video_path = mp4_filename
    except Exception as exc:
        asset.status = "failed"
        asset.error_message = str(exc)

    db.commit()
    broadcaster.publish("demo_asset_updated", {"id": asset.id, "status": asset.status}, user_id=asset.user_id)


def cleanup_expired_demo_assets(db: Session) -> None:
    from datetime import datetime, timedelta, timezone

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

`urls` for v1 is the single repo-detail page URL (`{settings.frontend_base_url}/repos/{repo_id}`, reusing the `frontend_base_url` config already added in Phase 4E) — a short walkthrough of one page is a reasonable, simple v1; recording a multi-page tour is a natural future enhancement, not required now.

## Backend API

```text
POST /repos/{repo_id}/demo-assets       -> 202, kicks off generate_demo_asset via BackgroundTasks
GET  /repos/{repo_id}/demo-assets       -> list[DemoAssetOut], current user's, newest first
GET  /demo-assets/{demo_asset_id}/video -> FileResponse (the .mp4), 404 if not ready or not found/not owned
```

`POST`/`GET /repos/{repo_id}/demo-assets` live in a new `app/api/demo_assets.py` router, mirroring `insights.py`'s `_require_repo(repo_id, db, current_user)` per-repo ownership-check pattern (404 not 403 on cross-user access, matching every other resource in this codebase) and `runs.py`'s `BackgroundTasks`/`@limiter.limit(...)` trigger pattern. The video-serving route checks `DemoAsset.user_id == current_user.id` directly (same 404-not-403 convention) before returning `FileResponse(full_path, media_type="video/mp4")`.

Path `demo-assets` contains none of the forbidden ad-blocker substrings.

## Real-time sync

New event `demo_asset_updated` (`{id, status}` payload, matches `recommendation_updated`'s precedent), published when generation finishes (success or failure). `EVENT_QUERY_MAP` gains `demo_asset_updated: [queryKeys.demoAssets.all]`.

## Config

```python
demo_assets_dir: str = "demo_assets"
demo_asset_retention_days: int = 3
```

`.env.example` documents both, plus a note that the deployment target needs `ffmpeg` installed (`apt-get install ffmpeg` on the Coolify/Hetzner VPS) and Playwright's Chromium downloaded (`playwright install chromium --with-deps`) as manual one-time deploy steps — neither is something this build can install/verify in this sandbox, same category as `alembic upgrade head` always being deferred to the Product Owner's real environment.

## Frontend

- `lib/query-keys.ts`: `demoAssets: { all: ["demo-assets"] as const }` (account-wide list; a repo-scoped variant isn't needed for v1 since the UI shows one repo's assets at a time via a filtered client-side view, matching how `opportunities-client.tsx` doesn't need a repo-scoped query key either).
- `lib/api.ts`/`api-types.ts`: `listDemoAssets(repoId)`, `triggerDemoAsset(repoId)`; `DemoAsset` type from the regenerated OpenAPI schema.
- `hooks/use-demo-assets.ts`: `useDemoAssets(repoId)` (query) + `useTriggerDemoAsset(repoId)` (mutation, matches `useTriggerContentRun`'s trigger-and-toast pattern from the Drafts page).
- New section on the existing repo-detail page (`app/repos/[id]/page.tsx`/its client component) — not a new top-level nav page, since demo assets are inherently repo-scoped and the repo-detail page is where a user already reviews everything about one tracked repo. A "Demo Assets" card: generate button, list of past attempts (status badge, `<video>` preview + download link when `ready`, error message when `failed`).
- `hooks/use-live-events.ts`: `demo_asset_updated` mapping.

## Testing

Backend:

- `DemoRecorder`/`VideoCompositor`: thin enough that their own unit tests just confirm they call `sync_playwright`/`subprocess.run` with the right arguments via mocking those two functions directly (no real browser/ffmpeg invocation in tests).
- `demo_asset_jobs.py`: `generate_demo_asset` — success path sets `status="ready"`/`video_path`; a `DemoRecorder`/`VideoCompositor` exception sets `status="failed"`/`error_message`; SSE published in both cases. `cleanup_expired_demo_assets` — deletes rows older than the cutoff (and their files, mocked via `os.path.exists`/`os.remove`), leaves newer rows untouched.
- `test_demo_assets_api.py`: per-user isolation (404 not 403) on both the list and video-serving endpoints; `POST` returns 202 and creates a `"generating"` row; video route 404s when `status != "ready"`.

Frontend:

- New component test for the Demo Assets card: generate button triggers the mutation, status badge reflects each state, video/download link appears only when `ready`.
- `use-live-events` test: extend with the `demo_asset_updated` mapping.

Both suites stay at 100% pass, zero warnings.

## Migration & sequencing

1. Add `DemoAsset` model + migration (reviewed, not applied against real Postgres — deferred to the Product Owner).
2. Add `playwright` to `backend/requirements.txt` (a real new dependency — `pip install` it in the dev venv for this build's own test suite to import `playwright.sync_api`, but do NOT attempt to download Chromium/run `playwright install` in this sandbox; tests never launch a real browser).
3. Build/test `DemoRecorder`, `VideoCompositor`, `demo_asset_jobs.py`, the API router — each independently testable with fakes.
4. Wire the 4th scheduler job (cleanup only).
5. Regenerate frontend types, build the frontend layer.

## Non-goals restated (from Phase 4's governing decisions, still binding)

- "Demo videos" means real Playwright screen recordings, never AI-generated synthetic video — this sub-project is that governing decision's actual implementation.
- No auto-trigger on release approval — explicit, deliberate deferral, not an oversight.
- No cloud storage integration yet — explicit, deliberate deferral pending a provider choice and real credentials from the Product Owner.
- No n8n, no new service — this lives in the existing FastAPI backend, same as every other Phase 4 automation.
