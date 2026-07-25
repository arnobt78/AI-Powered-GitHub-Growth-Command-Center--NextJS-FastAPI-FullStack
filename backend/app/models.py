"""SQLAlchemy ORM models — the Postgres schema as Python classes.

Educational walkthrough
-----------------------
Every tenant-owned table carries ``user_id`` (FK → users) so queries can be
scoped in SQL. Prefer ``ON DELETE CASCADE`` from parent → children so deleting
a user/repo cleans related history without orphan rows.

High-level map:
- ``User`` — GitHub identity + encrypted OAuth token + notification prefs
- ``Repo`` — tracked repositories
- ``Snapshot`` / ``Referrer`` / ``PopularPath`` / ``BenchmarkRepo`` — time-series & peers
- ``PipelineRun`` / ``StageRun`` — run history (``pipeline_kind`` distinguishes analytics/content/opportunities)
- ``Recommendation`` — LLM growth suggestions (dismissable)
- ``Draft`` — approve/reject before external side effects
- ``Opportunity`` — HN/Discussions matches (dismissable, not draft-gated)
- ``DemoAsset`` — generated walkthrough videos
- ``LLMUsage`` — per-provider call accounting for Settings status
"""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    """UTC timestamp helper for column defaults."""
    return datetime.now(timezone.utc)


class User(Base):
    """Signed-in GitHub account; one row per ``github_id``."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[str] = mapped_column(String(500))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Fallback alert-email recipient when `email` (derived from GitHub OAuth
    # scope, not guaranteed present) is empty. Settings page lets the user
    # set/clear this directly — see app/api/users.py's GET/PATCH /users/me.
    notification_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Rate-limit guard for the needs_reauth alert email: null means "never
    # sent (or eligible to send again)". needs_reauth persists until the user
    # reconnects GitHub, so without this the daily scheduler would re-email
    # the same unresolved condition every single day.
    last_reauth_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Fernet ciphertext of the user's GitHub OAuth access token. Never logged,
    # never returned by any API response — see app/token_crypto.py.
    access_token_encrypted: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    max_tracked_repos: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Repo(Base):
    """A GitHub repo the user asked us to track."""

    __tablename__ = "repos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    tracked_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Last release tag_name we've already generated (or attempted to generate)
    # release notes for. Null means "never checked" — the repo's current
    # latest release, even if it predates tracking, still gets a Draft the
    # first time the content pipeline runs for it. Only advances when a Draft
    # was actually written (see ContentAssembler) — a transient LLM outage
    # must not permanently skip a release.
    last_release_tag: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Snapshot(Base):
    """One day's metric snapshot for a tracked repo (stars/forks/traffic, …)."""

    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    watchers: Mapped[int] = mapped_column(Integer, default=0)
    open_issues: Mapped[int] = mapped_column(Integer, default=0)
    views_14d: Mapped[int] = mapped_column(Integer, default=0)
    unique_views_14d: Mapped[int] = mapped_column(Integer, default=0)
    clones_14d: Mapped[int] = mapped_column(Integer, default=0)
    unique_clones_14d: Mapped[int] = mapped_column(Integer, default=0)


class BenchmarkRepo(Base):
    __tablename__ = "benchmark_repos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(255))
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    topics: Mapped[list] = mapped_column(JSON, default=list)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Referrer(Base):
    __tablename__ = "referrers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    referrer: Mapped[str] = mapped_column(String(255))
    count: Mapped[int] = mapped_column(Integer, default=0)
    uniques: Mapped[int] = mapped_column(Integer, default=0)


class PopularPath(Base):
    __tablename__ = "popular_paths"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    path: Mapped[str] = mapped_column(String(500))
    count: Mapped[int] = mapped_column(Integer, default=0)
    uniques: Mapped[int] = mapped_column(Integer, default=0)


class PipelineRun(Base):
    """One execution of a pipeline (status: running → ok|degraded)."""

    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")
    pipeline_kind: Mapped[str] = mapped_column(String(50), default="analytics")


class StageRun(Base):
    """Per-stage outcome inside a ``PipelineRun`` (isolation + timing + error text)."""

    __tablename__ = "stage_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    pipeline_run_id: Mapped[int] = mapped_column(ForeignKey("pipeline_runs.id"))
    stage_name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50))
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Recommendation(Base):
    """Growth suggestion produced by analytics synthesizer/validator."""

    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    snapshot_id: Mapped[int | None] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=True)
    category: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Draft(Base):
    """Human-gated proposal (content / release notes / issue reply, …)."""

    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int | None] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(255))
    content: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set only when status transitions to "failed" — currently only
    # issue_reply/discussion_reply can reach "failed" (posting to GitHub can
    # fail); every other kind's approve is a pure status flip with nothing
    # that can fail. Null otherwise.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


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


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(50))
    # Dedup key: HN's Algolia objectID or GitHub's GraphQL node id. Without this,
    # a daily poll would re-surface the same mention every single run.
    external_id: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(1000))
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class LLMUsage(Base):
    __tablename__ = "llm_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date)
    call_count: Mapped[int] = mapped_column(Integer, default=0)
