"""Opportunities-pipeline context/stage contract (HN + Discussions; Draft-free)."""

from dataclasses import dataclass, field
from typing import Any

from app.models import Repo


@dataclass
class OpportunityPipelineContext:
    repo: Repo
    raw: dict[str, Any] = field(default_factory=dict)
    opportunities: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
