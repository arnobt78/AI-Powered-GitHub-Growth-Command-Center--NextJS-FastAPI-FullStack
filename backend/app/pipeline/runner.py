"""Execute an ordered list of stages with per-stage failure isolation.

Educational walkthrough
-----------------------
1. Insert a ``PipelineRun`` (status=running).
2. For each stage: run → on exception ``db.rollback()`` then record error
   (never assume the session is clean after a failed flush — CAPA-0001).
3. Commit a ``StageRun`` row + publish ``stage_completed`` SSE.
4. Mark the overall run ``ok`` or ``degraded`` if any stage failed.

The same runner powers analytics, content, and opportunities by swapping the
``stages`` list, ``context_factory``, and ``pipeline_kind``.
"""

from typing import Any, Callable
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.events import broadcaster
from app.models import PipelineRun, Repo, StageRun
from app.pipeline.base import PipelineContext, Stage


class PipelineRunner:
    """Run stages sequentially for one repo; never abort the whole loop on one error."""

    def __init__(
        self,
        stages: list[Stage],
        db_session: Session,
        context_factory: Callable[[Repo], Any] = PipelineContext,
        pipeline_kind: str = "analytics",
    ):
        self.stages = stages
        self.db = db_session
        self.context_factory = context_factory
        self.pipeline_kind = pipeline_kind

    def run_for_repo(self, repo: Repo) -> Any:
        """Execute all stages for ``repo`` and return the final context object."""
        run_row = PipelineRun(status="running", user_id=repo.user_id, pipeline_kind=self.pipeline_kind)
        self.db.add(run_row)
        self.db.commit()
        self.db.refresh(run_row)

        ctx = self.context_factory(repo)
        had_error = False

        for stage in self.stages:
            start = time.monotonic()
            status = "ok"
            error_text: str | None = None
            try:
                ctx = stage.run(ctx)
            except Exception as exc:  # a stage failure must not stop the pipeline
                self.db.rollback()  # reset a possibly-poisoned session before we log this stage
                status = "error"
                error_text = str(exc)
                ctx.errors.append(f"{stage.name}: {exc}")
                had_error = True
            duration_ms = int((time.monotonic() - start) * 1000)

            self.db.add(StageRun(
                user_id=repo.user_id,
                pipeline_run_id=run_row.id,
                stage_name=stage.name,
                status=status,
                duration_ms=duration_ms,
                error=error_text,
            ))
            self.db.commit()

            # Broadcast-only — no new column, no schema change. The frontend
            # infers "which stage is currently active" from the sequence of
            # these events plus the run's own known stage order, rather than
            # needing a separate "stage started" signal.
            broadcaster.publish(
                "stage_completed",
                {"run_id": run_row.id, "stage_name": stage.name, "status": status},
                user_id=repo.user_id,
            )

        run_row.status = "degraded" if had_error else "ok"
        run_row.finished_at = datetime.now(timezone.utc)
        self.db.commit()

        return ctx
