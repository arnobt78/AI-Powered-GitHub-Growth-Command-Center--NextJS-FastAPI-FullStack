"""Analytics pipeline contract — load-bearing interface for ``PipelineRunner``.

Educational walkthrough
-----------------------
Each stage is a class with ``name`` + ``run(ctx) -> ctx``. The runner catches
exceptions **per stage**, rolls back a poisoned DB session (CAPA-0001), logs a
``StageRun``, and continues. Breaking this interface breaks that resilience.

Data flows left-to-right through context fields:
raw GitHub payloads → normalized → findings → ranked → narrative → recommendations.
"""

from dataclasses import dataclass, field
from typing import Any

from app.models import Repo


@dataclass
class PipelineContext:
    """Mutable bag of state passed through analytics stages for one repo."""

    repo: Repo
    raw: dict[str, Any] = field(default_factory=dict)
    normalized: dict[str, Any] = field(default_factory=dict)
    findings: list[dict[str, Any]] = field(default_factory=list)
    ranked_findings: list[dict[str, Any]] = field(default_factory=list)
    narrative: str | None = None
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class Stage:
    """Base class every analytics stage implements."""

    name: str = "stage"

    def run(self, ctx: PipelineContext) -> PipelineContext:
        """Transform context and return it (or raise — runner isolates failures)."""
        raise NotImplementedError
