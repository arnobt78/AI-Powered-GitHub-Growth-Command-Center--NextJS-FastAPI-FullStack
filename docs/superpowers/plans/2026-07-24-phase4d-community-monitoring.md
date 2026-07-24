# Phase 4D: Community & Trend Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dismissable "Opportunities" inbox surfaces new mentions of your tracked repos on Hacker News and GitHub Discussions, found by a daily scheduled poll.

**Architecture:** A new `Opportunity` model (dismissable, mirrors `Recommendation` — not `Draft`, since there's nothing to approve here). A minimal 2-stage `Stage`/`PipelineRunner` pipeline (`OpportunityExtractor` → `OpportunityAssembler`, no LLM synthesis — these are raw external facts). Two new external clients: `HackerNewsClient` (new, no-auth) and `GitHubClient.search_discussions` (new GraphQL method on the existing class). A third daily scheduler job + manual trigger, mirroring the content pipeline's wiring exactly. Frontend mirrors the Recommendations page/hook/component trio.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, httpx, pytest (backend); Next.js 16 App Router, TanStack Query, Vitest (frontend).

## Global Constraints

- No draft-and-approve gate — this feature is purely informational (surface + dismiss), matching `Recommendation`'s pattern, not `Draft`'s approve/reject transition.
- Reddit monitoring is explicitly out of scope (needs a Reddit developer app registration) — only HN + GitHub Discussions.
- Dedup: an `Opportunity` is only inserted if its `external_id` isn't already present for that `repo_id` — a daily poll must not re-surface the same mention every run.
- `HackerNewsClient` has no auth; `GitHubClient.search_discussions` reuses the existing per-user authenticated `httpx.Client` (same `Authorization` header already set in `__init__`).
- Manual `POST /runs/opportunities` and the scheduled job behave identically — no manual-vs-scheduled asymmetry for this feature (unlike Phase 4E's notify-only-on-scheduled distinction).
- No endpoint path may contain `analytics`/`analysis`/`tracking`/`performance`/`metrics`.
- Full spec: `docs/superpowers/specs/2026-07-24-phase4d-community-monitoring-design.md`.

---

### Task 1: `Opportunity` model + migration

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/alembic/versions/<hash>_add_opportunities_table.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `Opportunity` model with `id, user_id, repo_id, source, external_id, title, url, dismissed, created_at`. Consumed by every later task.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_models.py`:

```python
def test_create_opportunity_scoped_to_repo_and_user():
    db = SessionLocal()
    user = User(
        github_id="888",
        username="opp-tester",
        avatar_url="https://avatars.githubusercontent.com/u/888",
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

    opportunity = Opportunity(
        user_id=user.id,
        repo_id=repo.id,
        source="hacker_news",
        external_id="12345",
        title="Show HN: hello-world",
        url="https://news.ycombinator.com/item?id=12345",
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)

    assert opportunity.dismissed is False
    assert opportunity.created_at is not None

    fetched = db.query(Opportunity).filter_by(repo_id=repo.id).one()
    assert fetched.source == "hacker_news"
    assert fetched.external_id == "12345"
    db.close()
```

Add `Opportunity` to the existing `from app.models import ...` import line in `test_models.py` (alongside `Repo`, `User`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_models.py::test_create_opportunity_scoped_to_repo_and_user -v`
Expected: FAIL with `ImportError: cannot import name 'Opportunity' from 'app.models'`

- [ ] **Step 3: Add the model**

In `backend/app/models.py`, add this class after `class Draft(Base): ...`'s closing (before the next class, or at the end of the file if `Draft` is currently last — check the file to place it correctly, matching the existing style of one blank line between class bodies):

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_models.py -v`
Expected: all pass, including the new test.

- [ ] **Step 5: Generate and review the Alembic migration**

Run: `cd backend && .venv/bin/python -m alembic revision --autogenerate -m "add opportunities table"`

Confirm `down_revision = '572cc3d9b80d'` (the current head — verify with `.venv/bin/python -m alembic heads` first) and the body matches:

```python
def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        'opportunities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('repo_id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=1000), nullable=False),
        sa.Column('dismissed', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['repo_id'], ['repos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('opportunities')
    # ### end Alembic commands ###
```

If autogenerate produces column ordering or constraint-naming differences, that's fine (Alembic's exact rendering varies) — what matters is: all 9 columns present with correct types/nullability, both FKs with `ondelete='CASCADE'`, and `downgrade` cleanly drops the table. Do **not** run `alembic upgrade head` against a real database — deferred to the Product Owner, same as every prior migration.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/alembic/versions/*_add_opportunities_table.py backend/tests/test_models.py
git commit -m "feat(4d): add Opportunity model + migration"
```

---

### Task 2: `HackerNewsClient`

**Files:**
- Create: `backend/app/hackernews_client.py`
- Test: `backend/tests/test_hackernews_client.py`

**Interfaces:**
- Produces: `HackerNewsClient(http_client: httpx.Client | None = None)` with `search(query: str, limit: int = 5) -> list[dict]`. Consumed by `app/pipeline/opportunities/extractor.py` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_hackernews_client.py`:

```python
import httpx
import pytest

from app.hackernews_client import HackerNewsClient


@pytest.fixture
def mock_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/search":
            assert request.url.params["query"] == "hello-world"
            return httpx.Response(200, json={
                "hits": [
                    {"objectID": "111", "title": "Show HN: hello-world", "url": "https://example.com/hello-world"},
                    {"objectID": "222", "title": None, "story_title": "hello-world discussion", "url": None},
                ]
            })
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def hn_client(mock_transport):
    http = httpx.Client(base_url="https://hn.algolia.com/api/v1", transport=mock_transport)
    return HackerNewsClient(http_client=http)


def test_search_returns_hits(hn_client):
    hits = hn_client.search("hello-world")
    assert hits[0]["objectID"] == "111"
    assert hits[0]["title"] == "Show HN: hello-world"


def test_search_raises_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    http = httpx.Client(base_url="https://hn.algolia.com/api/v1", transport=httpx.MockTransport(handler))
    client = HackerNewsClient(http_client=http)

    with pytest.raises(httpx.HTTPStatusError):
        client.search("hello-world")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_hackernews_client.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.hackernews_client'`

- [ ] **Step 3: Implement `HackerNewsClient`**

Create `backend/app/hackernews_client.py`:

```python
import httpx


class HackerNewsClient:
    """Thin wrapper around Algolia's public HN Search API. No auth required.
    Mirrors GitHubClient's DI-testable httpx.Client shape for consistency,
    even though it holds no credentials."""

    def __init__(self, http_client: httpx.Client | None = None):
        self._http = http_client or httpx.Client(base_url="https://hn.algolia.com/api/v1", timeout=15.0)

    def search(self, query: str, limit: int = 5) -> list[dict]:
        resp = self._http.get("/search", params={"query": query, "tags": "story", "hitsPerPage": limit})
        resp.raise_for_status()
        return resp.json().get("hits", [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_hackernews_client.py -v`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/hackernews_client.py backend/tests/test_hackernews_client.py
git commit -m "feat(4d): add HackerNewsClient"
```

---

### Task 3: `GitHubClient.search_discussions`

**Files:**
- Modify: `backend/app/github_client.py`
- Test: `backend/tests/test_github_client.py`

**Interfaces:**
- Produces: `GitHubClient.search_discussions(query: str, limit: int = 5) -> list[dict]`. Consumed by `app/pipeline/opportunities/extractor.py` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_github_client.py`. First extend the existing `mock_transport` fixture's `handler` function with a new branch (add before the final `return httpx.Response(404)` line) that handles a GraphQL POST:

```python
        if request.url.path == "/graphql" and request.method == "POST":
            body = request.read()
            import json as json_module
            payload = json_module.loads(body)
            if "hello-world" in payload["variables"]["searchQuery"]:
                return httpx.Response(200, json={
                    "data": {
                        "search": {
                            "nodes": [
                                {"id": "D_kwABC123", "title": "hello-world usage question", "url": "https://github.com/someone/other/discussions/5"}
                            ]
                        }
                    }
                })
            return httpx.Response(200, json={"data": {"search": {"nodes": []}}})
```

Then add these tests:

```python
def test_search_discussions_returns_nodes(gh_client):
    nodes = gh_client.search_discussions("hello-world")
    assert nodes[0]["id"] == "D_kwABC123"
    assert nodes[0]["title"] == "hello-world usage question"


def test_search_discussions_returns_empty_list_when_no_matches(gh_client):
    nodes = gh_client.search_discussions("no-such-repo-xyz")
    assert nodes == []


def test_search_discussions_raises_needs_reauth_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    with pytest.raises(GitHubAuthError):
        client.search_discussions("hello-world")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_github_client.py -v -k search_discussions`
Expected: FAIL with `AttributeError: 'GitHubClient' object has no attribute 'search_discussions'`

- [ ] **Step 3: Implement `search_discussions`**

In `backend/app/github_client.py`, add this method to `class GitHubClient:` (place it near `list_releases`):

```python
    def search_discussions(self, query: str, limit: int = 5) -> list[dict]:
        graphql_query = """
        query($searchQuery: String!, $limit: Int!) {
          search(query: $searchQuery, type: DISCUSSION, first: $limit) {
            nodes {
              ... on Discussion {
                id
                title
                url
              }
            }
          }
        }
        """
        resp = self._http.post(
            "/graphql", json={"query": graphql_query, "variables": {"searchQuery": query, "limit": limit}}
        )
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected for GraphQL search '{query}'")
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("search", {}).get("nodes", [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_github_client.py -v`
Expected: all pass, including the 3 new tests, no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/github_client.py backend/tests/test_github_client.py
git commit -m "feat(4d): add GitHubClient.search_discussions (GraphQL)"
```

---

### Task 4: `OpportunityPipelineContext` + `OpportunityExtractor`

**Files:**
- Create: `backend/app/pipeline/opportunities/__init__.py` (empty)
- Create: `backend/app/pipeline/opportunity_base.py`
- Create: `backend/app/pipeline/opportunities/extractor.py`
- Test: `backend/tests/test_opportunity_extractor.py`

**Interfaces:**
- Consumes: `HackerNewsClient.search`, `GitHubClient.search_discussions` (Tasks 2, 3).
- Produces: `OpportunityPipelineContext(repo: Repo)` with `.raw`, `.opportunities: list[dict]`, `.errors: list[str]`. `OpportunityExtractor(hn_client, gh_client).run(ctx)` populates `ctx.opportunities` with `{"source", "external_id", "title", "url"}` dicts. Consumed by `app/pipeline/opportunities/assembler.py` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_opportunity_extractor.py`:

```python
from unittest.mock import MagicMock

from app.models import Repo
from app.pipeline.opportunities.extractor import OpportunityExtractor
from app.pipeline.opportunity_base import OpportunityPipelineContext


def _fake_hn_client():
    hn = MagicMock()
    hn.search.return_value = [
        {"objectID": "111", "title": "Show HN: hello-world", "url": "https://example.com/hello-world"},
    ]
    return hn


def _fake_gh_client():
    gh = MagicMock()
    gh.search_discussions.return_value = [
        {"id": "D_kwABC123", "title": "hello-world usage question", "url": "https://github.com/someone/other/discussions/5"},
    ]
    return gh


def test_extractor_combines_hn_and_discussion_hits():
    repo = Repo(owner="octocat", name="hello-world")
    ctx = OpportunityPipelineContext(repo=repo)
    hn = _fake_hn_client()
    gh = _fake_gh_client()

    ctx = OpportunityExtractor(hn_client=hn, gh_client=gh).run(ctx)

    assert len(ctx.opportunities) == 2
    hn_item = next(o for o in ctx.opportunities if o["source"] == "hacker_news")
    assert hn_item["external_id"] == "111"
    assert hn_item["title"] == "Show HN: hello-world"
    assert hn_item["url"] == "https://example.com/hello-world"

    gh_item = next(o for o in ctx.opportunities if o["source"] == "github_discussions")
    assert gh_item["external_id"] == "D_kwABC123"
    assert gh_item["title"] == "hello-world usage question"

    hn.search.assert_called_once_with("hello-world")
    gh.search_discussions.assert_called_once_with("hello-world")


def test_extractor_falls_back_to_hn_permalink_when_no_url():
    repo = Repo(owner="octocat", name="hello-world")
    ctx = OpportunityPipelineContext(repo=repo)
    hn = MagicMock()
    hn.search.return_value = [{"objectID": "222", "title": None, "story_title": "hello-world discussion", "url": None}]
    gh = MagicMock()
    gh.search_discussions.return_value = []

    ctx = OpportunityExtractor(hn_client=hn, gh_client=gh).run(ctx)

    assert ctx.opportunities[0]["title"] == "hello-world discussion"
    assert ctx.opportunities[0]["url"] == "https://news.ycombinator.com/item?id=222"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_extractor.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.pipeline.opportunity_base'`

- [ ] **Step 3: Implement the context and extractor**

Create `backend/app/pipeline/opportunity_base.py`:

```python
from dataclasses import dataclass, field
from typing import Any

from app.models import Repo


@dataclass
class OpportunityPipelineContext:
    repo: Repo
    raw: dict[str, Any] = field(default_factory=dict)
    opportunities: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
```

Create `backend/app/pipeline/opportunities/__init__.py` (empty file, makes this a package — matches `backend/app/pipeline/content/__init__.py`'s existing pattern, check it's also empty).

Create `backend/app/pipeline/opportunities/extractor.py`:

```python
from app.github_client import GitHubClient
from app.hackernews_client import HackerNewsClient
from app.pipeline.base import Stage
from app.pipeline.opportunity_base import OpportunityPipelineContext


class OpportunityExtractor(Stage):
    name = "opportunity_extractor"

    def __init__(self, hn_client: HackerNewsClient, gh_client: GitHubClient):
        self.hn_client = hn_client
        self.gh_client = gh_client

    def run(self, ctx: OpportunityPipelineContext) -> OpportunityPipelineContext:
        keyword = ctx.repo.name

        for hit in self.hn_client.search(keyword):
            ctx.opportunities.append({
                "source": "hacker_news",
                "external_id": hit["objectID"],
                "title": hit.get("title") or hit.get("story_title") or keyword,
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}",
            })

        for node in self.gh_client.search_discussions(keyword):
            ctx.opportunities.append({
                "source": "github_discussions",
                "external_id": node["id"],
                "title": node["title"],
                "url": node["url"],
            })

        return ctx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_extractor.py -v`
Expected: `2 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipeline/opportunity_base.py backend/app/pipeline/opportunities/ backend/tests/test_opportunity_extractor.py
git commit -m "feat(4d): add OpportunityPipelineContext + OpportunityExtractor"
```

---

### Task 5: `OpportunityAssembler`

**Files:**
- Create: `backend/app/pipeline/opportunities/assembler.py`
- Test: `backend/tests/test_opportunity_assembler.py`

**Interfaces:**
- Consumes: `ctx.opportunities: list[dict]` (Task 4).
- Produces: `Opportunity` rows written via `OpportunityAssembler(db_session).run(ctx)`, deduped against existing `external_id`s per `repo_id`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_opportunity_assembler.py`:

```python
from app.db import SessionLocal
from app.models import Opportunity, Repo
from app.pipeline.opportunities.assembler import OpportunityAssembler
from app.pipeline.opportunity_base import OpportunityPipelineContext


def _db_and_repo(user_id: int):
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    return db, repo


def test_assembler_writes_new_opportunities(seed_user):
    db, repo = _db_and_repo(seed_user)
    ctx = OpportunityPipelineContext(repo=repo)
    ctx.opportunities = [
        {"source": "hacker_news", "external_id": "111", "title": "Show HN: hello-world", "url": "https://example.com/1"},
        {"source": "github_discussions", "external_id": "D_kwABC123", "title": "usage question", "url": "https://example.com/2"},
    ]

    ctx = OpportunityAssembler(db_session=db).run(ctx)

    written = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(written) == 2
    assert {o.external_id for o in written} == {"111", "D_kwABC123"}
    db.close()


def test_assembler_skips_already_seen_external_ids(seed_user):
    db, repo = _db_and_repo(seed_user)
    db.add(Opportunity(
        user_id=seed_user, repo_id=repo.id, source="hacker_news", external_id="111",
        title="Show HN: hello-world", url="https://example.com/1",
    ))
    db.commit()

    ctx = OpportunityPipelineContext(repo=repo)
    ctx.opportunities = [
        {"source": "hacker_news", "external_id": "111", "title": "Show HN: hello-world", "url": "https://example.com/1"},
        {"source": "github_discussions", "external_id": "D_kwABC123", "title": "usage question", "url": "https://example.com/2"},
    ]

    ctx = OpportunityAssembler(db_session=db).run(ctx)

    written = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(written) == 2  # 1 pre-existing + 1 genuinely new; the duplicate "111" was not re-inserted
    assert {o.external_id for o in written} == {"111", "D_kwABC123"}
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_assembler.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.pipeline.opportunities.assembler'`

- [ ] **Step 3: Implement `OpportunityAssembler`**

Create `backend/app/pipeline/opportunities/assembler.py`:

```python
from sqlalchemy.orm import Session

from app.models import Opportunity
from app.pipeline.base import Stage
from app.pipeline.opportunity_base import OpportunityPipelineContext


class OpportunityAssembler(Stage):
    name = "opportunity_assembler"

    def __init__(self, db_session: Session):
        self.db = db_session

    def run(self, ctx: OpportunityPipelineContext) -> OpportunityPipelineContext:
        existing_ids = {
            row.external_id
            for row in self.db.query(Opportunity.external_id).filter(
                Opportunity.repo_id == ctx.repo.id
            ).all()
        }
        for item in ctx.opportunities:
            if item["external_id"] in existing_ids:
                continue
            self.db.add(Opportunity(
                user_id=ctx.repo.user_id,
                repo_id=ctx.repo.id,
                source=item["source"],
                external_id=item["external_id"],
                title=item["title"],
                url=item["url"],
            ))
        self.db.commit()
        return ctx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_assembler.py -v`
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipeline/opportunities/assembler.py backend/tests/test_opportunity_assembler.py
git commit -m "feat(4d): add OpportunityAssembler with per-repo dedup"
```

---

### Task 6: `opportunity_jobs.py` + scheduler + manual trigger

**Files:**
- Create: `backend/app/pipeline/opportunity_jobs.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/runs.py`
- Test: `backend/tests/test_opportunity_jobs.py`

**Interfaces:**
- Consumes: `OpportunityExtractor`, `OpportunityAssembler` (Tasks 4, 5), `HackerNewsClient` (Task 2).
- Produces: `run_opportunities_pipeline_for_all_repos(db: Session, user_id: int | None = None) -> None`. `POST /runs/opportunities` (202, background task). A third daily scheduler job.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_opportunity_jobs.py`, mirroring `test_content_jobs.py`'s exact structure (read that file first for the precedent):

```python
from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.models import Opportunity, Repo, User
from app.pipeline.opportunity_jobs import run_opportunities_pipeline_for_all_repos


def _fake_hn_client():
    hn = MagicMock()
    hn.search.return_value = []
    return hn


def _fake_gh_client():
    gh = MagicMock()
    gh.search_discussions.return_value = [
        {"id": "D_kwABC123", "title": "usage question", "url": "https://example.com/1"},
    ]
    return gh


@patch("app.pipeline.opportunity_jobs.broadcaster.publish")
@patch("app.pipeline.opportunity_jobs.GitHubClient")
@patch("app.pipeline.opportunity_jobs.HackerNewsClient")
def test_runs_opportunities_pipeline_and_publishes_per_user(mock_hn_cls, mock_gh_cls, mock_publish, seed_user):
    mock_hn_cls.return_value = _fake_hn_client()
    mock_gh_cls.return_value = _fake_gh_client()

    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()

    run_opportunities_pipeline_for_all_repos(db, user_id=seed_user)

    opportunities = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(opportunities) == 1
    assert opportunities[0].source == "github_discussions"

    mock_publish.assert_called_once_with("opportunities_generated", {}, user_id=seed_user)
    db.close()


@patch("app.pipeline.opportunity_jobs.broadcaster.publish")
def test_skips_repos_for_user_with_undecryptable_token(mock_publish, seed_user):
    db = SessionLocal()
    user = db.get(User, seed_user)
    user.access_token_encrypted = "not-valid-fernet-ciphertext"
    db.commit()

    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()

    run_opportunities_pipeline_for_all_repos(db, user_id=seed_user)

    assert db.query(Opportunity).count() == 0
    mock_publish.assert_not_called()
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_jobs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.pipeline.opportunity_jobs'`

- [ ] **Step 3: Implement `opportunity_jobs.py`**

Create `backend/app/pipeline/opportunity_jobs.py`:

```python
from sqlalchemy.orm import Session

from app.events import broadcaster
from app.github_client import GitHubClient
from app.hackernews_client import HackerNewsClient
from app.models import Repo, User
from app.pipeline.opportunities.assembler import OpportunityAssembler
from app.pipeline.opportunities.extractor import OpportunityExtractor
from app.pipeline.opportunity_base import OpportunityPipelineContext
from app.pipeline.runner import PipelineRunner
from app.token_crypto import decrypt_token


def run_opportunities_pipeline_for_all_repos(db: Session, user_id: int | None = None) -> None:
    hn_client = HackerNewsClient()

    query = db.query(Repo)
    if user_id is not None:
        query = query.filter(Repo.user_id == user_id)
    repos = query.all()

    failed_auth_user_ids: set[int] = set()
    processed_user_ids: set[int] = set()

    for repo in repos:
        if repo.user_id in failed_auth_user_ids:
            continue

        try:
            owner = db.get(User, repo.user_id)
            gh_client = GitHubClient(token=decrypt_token(owner.access_token_encrypted))
        except Exception:
            failed_auth_user_ids.add(repo.user_id)
            continue

        runner = PipelineRunner(
            stages=[
                OpportunityExtractor(hn_client=hn_client, gh_client=gh_client),
                OpportunityAssembler(db_session=db),
            ],
            db_session=db,
            context_factory=OpportunityPipelineContext,
            pipeline_kind="opportunities",
        )
        ctx = runner.run_for_repo(repo)

        if any("needs_reauth" in error for error in ctx.errors):
            failed_auth_user_ids.add(repo.user_id)
            continue

        processed_user_ids.add(repo.user_id)

    for uid in processed_user_ids:
        broadcaster.publish("opportunities_generated", {}, user_id=uid)
```

- [ ] **Step 4: Wire the scheduler and manual trigger**

In `backend/app/main.py`, add the import and scheduler wrapper. Find the existing imports block and add:

```python
from app.pipeline.opportunity_jobs import run_opportunities_pipeline_for_all_repos
```

Add a new scheduler wrapper function, near `_scheduled_content_pipeline_run`:

```python
def _scheduled_opportunities_run() -> None:
    db = SessionLocal()
    try:
        run_opportunities_pipeline_for_all_repos(db)
    finally:
        db.close()
```

In the `lifespan` function, after the existing `scheduler.add_job(_scheduled_content_pipeline_run, ...)` call, add a third job:

```python
    # Offset a further 6h from the content job (18h total from analytics) so all
    # three daily jobs' outbound HTTP calls are spread across the day.
    scheduler.add_job(
        _scheduled_opportunities_run,
        "interval",
        hours=24,
        id="daily_opportunities_run",
        next_run_time=datetime.now() + timedelta(hours=18),
    )
```

In `backend/app/api/runs.py`, add the manual trigger endpoint after the existing `POST /content` route:

```python
@router.post("/opportunities", response_model=TriggerRunOut, status_code=202)
@limiter.limit("10/minute")
def trigger_opportunities_run(
    request: Request, background_tasks: BackgroundTasks, current_user: User = Depends(require_user)
) -> TriggerRunOut:
    background_tasks.add_task(_run_opportunities_pipeline_background, current_user.id)
    return TriggerRunOut(status="started")


def _run_opportunities_pipeline_background(user_id: int) -> None:
    from app.pipeline.opportunity_jobs import run_opportunities_pipeline_for_all_repos

    db = SessionLocal()
    try:
        run_opportunities_pipeline_for_all_repos(db, user_id=user_id)
    finally:
        db.close()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunity_jobs.py -v`
Expected: `2 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, no regressions (confirms the `main.py`/`runs.py` changes didn't break anything).

- [ ] **Step 6: Commit**

```bash
git add backend/app/pipeline/opportunity_jobs.py backend/app/main.py backend/app/api/runs.py backend/tests/test_opportunity_jobs.py
git commit -m "feat(4d): wire opportunity_jobs into scheduler + manual trigger"
```

---

### Task 7: Backend API `GET`/`PATCH /opportunities`

**Files:**
- Create: `backend/app/api/opportunities.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_opportunities_api.py`

**Interfaces:**
- Produces: `GET /opportunities -> list[OpportunityOut]`, `PATCH /opportunities/{id}` (body `{"dismissed": bool}`) `-> OpportunityOut`. Publishes `opportunity_updated`. Consumed by the frontend (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_opportunities_api.py`, mirroring `backend/tests/test_recommendations_api.py`'s exact structure (read that file first):

```python
from app.db import SessionLocal
from app.models import Opportunity, Repo


def _seed_opportunity_for(user_id: int) -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    opp = Opportunity(
        user_id=user_id,
        repo_id=repo.id,
        source="hacker_news",
        external_id="111",
        title="Show HN: hello-world",
        url="https://news.ycombinator.com/item?id=111",
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)
    opp_id = opp.id
    repo_id = repo.id
    db.close()
    return repo_id, opp_id


def test_opportunities_isolated_per_user(client, other_user_client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    other_list = other_user_client.get("/opportunities")
    assert other_list.json() == []

    other_patch = other_user_client.patch(f"/opportunities/{opp_id}", json={"dismissed": True})
    assert other_patch.status_code == 404


def test_list_opportunities_returns_current_users(client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    resp = client.get("/opportunities")
    assert resp.status_code == 200
    assert any(o["id"] == opp_id and o["source"] == "hacker_news" for o in resp.json())


def test_dismiss_opportunity(client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    resp = client.patch(f"/opportunities/{opp_id}", json={"dismissed": True})
    assert resp.status_code == 200
    assert resp.json()["dismissed"] is True

    list_resp = client.get("/opportunities")
    assert any(o["id"] == opp_id and o["dismissed"] for o in list_resp.json())


def test_opportunities_require_user_token(client_without_user_token):
    resp = client_without_user_token.get("/opportunities")
    assert resp.status_code == 401

    resp = client_without_user_token.patch("/opportunities/1", json={"dismissed": True})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunities_api.py -v`
Expected: FAIL — `404 Not Found` for `/opportunities` (route doesn't exist yet).

- [ ] **Step 3: Implement the router**

Create `backend/app/api/opportunities.py`:

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_api_key, require_user
from app.events import broadcaster
from app.models import Opportunity, User

router = APIRouter(prefix="/opportunities", tags=["opportunities"], dependencies=[Depends(require_api_key)])


class OpportunityOut(BaseModel):
    id: int
    repo_id: int
    source: str
    title: str
    url: str
    dismissed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class OpportunityPatch(BaseModel):
    dismissed: bool


@router.get("", response_model=list[OpportunityOut])
def list_opportunities(
    db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> list[Opportunity]:
    return db.execute(
        select(Opportunity)
        .where(Opportunity.user_id == current_user.id)
        .order_by(Opportunity.created_at.desc())
    ).scalars().all()


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
def update_opportunity(
    opportunity_id: int,
    payload: OpportunityPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> Opportunity:
    opp = db.execute(
        select(Opportunity).where(
            Opportunity.id == opportunity_id, Opportunity.user_id == current_user.id
        )
    ).scalars().first()
    if opp is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp.dismissed = payload.dismissed
    db.commit()
    db.refresh(opp)
    broadcaster.publish(
        "opportunity_updated", {"id": opp.id, "dismissed": opp.dismissed}, user_id=current_user.id
    )
    return opp
```

In `backend/app/main.py`, add the import and registration alongside the other routers:

```python
from app.api.opportunities import router as opportunities_router
```

```python
app.include_router(opportunities_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_opportunities_api.py -v`
Expected: `4 passed`

Then run the full backend suite once: `cd backend && .venv/bin/python -m pytest -q` — expect all pass, pristine output, and `pip-audit` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/opportunities.py backend/app/main.py backend/tests/test_opportunities_api.py
git commit -m "feat(4d): add GET/PATCH /opportunities API"
```

---

### Task 8: Frontend types, API client, hooks, SSE mapping

**Files:**
- Modify: `frontend/lib/query-keys.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/hooks/use-live-events.ts`
- Create: `frontend/app/api/opportunities/route.ts`
- Create: `frontend/app/api/opportunities/[id]/route.ts`
- Create: `frontend/hooks/use-opportunities.ts`
- Test: `frontend/tests/use-live-events.test.tsx` (extend)

**Interfaces:**
- Consumes: `OpportunityOut` (regenerated OpenAPI type, since `Opportunity` has real typed fields unlike Draft's untyped `content` JSON).
- Produces: `queryKeys.opportunities.all`, `api.listOpportunities()`, `api.dismissOpportunity(id, dismissed)`, `useOpportunities()`, `useDismissOpportunity()`. Consumed by the Opportunities page (Task 9).

- [ ] **Step 1: Regenerate OpenAPI types**

Start the local backend (`.venv/bin/uvicorn app.main:app --reload` from `backend/`, backgrounded or in a separate terminal — real local Postgres is already running on this machine, `backend/.env` already has a working `DATABASE_URL`). Then from `frontend/`:

Run: `npm run generate:types`

Confirm with: `grep -n "OpportunityOut" frontend/types/api.d.ts` — expect at least one match, including `source`, `title`, `url`, `dismissed`, `created_at`, `repo_id`, `id` fields. Stop the background `uvicorn` process afterward.

- [ ] **Step 2: Add the query key**

In `frontend/lib/query-keys.ts`, add after the existing `providers` entry:

```ts
  opportunities: {
    all: ["opportunities"] as const,
  },
```

- [ ] **Step 3: Add `api.listOpportunities`/`api.dismissOpportunity`**

In `frontend/lib/api.ts`, add `Opportunity` to the existing `import type { ... } from "@/lib/api-types"` line, and add these two methods after `listRecommendations`/`dismissRecommendation` (read the exact existing method names for those two first, and match the style — likely `listRecommendations: () => backendFetch<Recommendation[]>("/recommendations")` and a PATCH-based dismiss method):

```ts
  listOpportunities: () => backendFetch<Opportunity[]>("/opportunities"),
  dismissOpportunity: (id: number, dismissed: boolean) =>
    backendFetch<Opportunity>(`/opportunities/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ dismissed }),
    }),
```

In `frontend/lib/api-types.ts`, add:

```ts
export type Opportunity = components["schemas"]["OpportunityOut"];
```

- [ ] **Step 4: Add the SSE mappings**

In `frontend/hooks/use-live-events.ts`, add to `EVENT_QUERY_MAP` (after the existing `drafts_generated` entry):

```ts
  opportunities_generated: [queryKeys.opportunities.all, queryKeys.runs.all],
  opportunity_updated: [queryKeys.opportunities.all],
```

- [ ] **Step 5: Create the Route Handlers**

Create `frontend/app/api/opportunities/route.ts`:

```ts
import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function GET() {
  return proxyRoute(() => api.listOpportunities());
}
```

Create `frontend/app/api/opportunities/[id]/route.ts`:

```ts
import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json()) as { dismissed: boolean };
  return proxyRoute(() => api.dismissOpportunity(Number(id), payload.dismissed));
}
```

- [ ] **Step 6: Create the hooks**

Create `frontend/hooks/use-opportunities.ts`, matching `hooks/use-recommendations.ts`'s exact pattern (read it first — the `setQueryData`-on-success cache-patch approach, not a full refetch):

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { Opportunity } from "@/lib/api-types";

export function useOpportunities() {
  return useQuery({
    queryKey: queryKeys.opportunities.all,
    queryFn: () => fetchJson<Opportunity[]>("/api/opportunities"),
  });
}

export function useDismissOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dismissed }: { id: number; dismissed: boolean }) =>
      fetchJson<Opportunity>(`/api/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Opportunity[]>(queryKeys.opportunities.all, (current) =>
        current?.map((o) => (o.id === updated.id ? updated : o)) ?? [],
      );
    },
  });
}
```

- [ ] **Step 7: Extend the SSE-mapping test**

First check whether `frontend/tests/use-live-events.test.tsx` exists (it does, per Phase 4E's Task 7) and follow its exact established idiom (render `Harness` → `useLiveEvents()` → `FakeEventSource.emit(eventType, payload)` → assert `invalidateSpy` called with the right key). Add two new test cases:

```tsx
it("invalidates opportunities.all and runs.all when opportunities_generated arrives", () => {
  const { invalidateSpy } = renderHarness();
  emit("opportunities_generated", {});
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.opportunities.all });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.runs.all });
});

it("invalidates opportunities.all when opportunity_updated arrives", () => {
  const { invalidateSpy } = renderHarness();
  emit("opportunity_updated", { id: 1, dismissed: true });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.opportunities.all });
});
```

Adjust the exact helper function names (`renderHarness`, `emit`) to match whatever the existing test file's real helpers are actually called — read the file first rather than assuming these exact names.

- [ ] **Step 8: Run tests, typecheck, lint**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all pass, zero errors/warnings.

- [ ] **Step 9: Commit**

```bash
git add frontend/types/api.d.ts frontend/lib/query-keys.ts frontend/lib/api.ts frontend/lib/api-types.ts frontend/hooks/use-live-events.ts frontend/hooks/use-opportunities.ts frontend/app/api/opportunities/ frontend/tests/
git commit -m "feat(4d): add opportunities API client, hooks, SSE mapping"
```

---

### Task 9: Opportunities page + nav entry

**Files:**
- Create: `frontend/app/opportunities/page.tsx`
- Create: `frontend/components/opportunities/opportunities-client.tsx`
- Modify: `frontend/components/nav-sidebar.tsx`
- Test: `frontend/tests/opportunities-client.test.tsx`

**Interfaces:**
- Consumes: `useOpportunities`, `useDismissOpportunity` (Task 8).
- Produces: `<OpportunitiesClient />`, the `/opportunities` route, a new nav entry.

- [ ] **Step 1: Write the failing test**

First read `frontend/components/recommendations/recommendations-client.tsx` and its nearest test file's mocking convention (or `frontend/tests/notification-settings-card.test.tsx` for the `vi.spyOn` idiom) to match exactly. Create `frontend/tests/opportunities-client.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpportunitiesClient } from "@/components/opportunities/opportunities-client";
import * as useOpportunitiesModule from "@/hooks/use-opportunities";
import * as useReposModule from "@/hooks/use-repos";

const baseOpportunity = {
  id: 1,
  repo_id: 10,
  dismissed: false,
  created_at: "2026-07-24T00:00:00Z",
};

function mockHooks(opportunities: unknown[]) {
  vi.spyOn(useOpportunitiesModule, "useOpportunities").mockReturnValue({ data: opportunities } as ReturnType<typeof useOpportunitiesModule.useOpportunities>);
  vi.spyOn(useOpportunitiesModule, "useDismissOpportunity").mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useOpportunitiesModule.useDismissOpportunity>);
  vi.spyOn(useReposModule, "useRepos").mockReturnValue({ data: [{ id: 10, owner: "octocat", name: "hello-world" }] } as unknown as ReturnType<typeof useReposModule.useRepos>);
}

describe("OpportunitiesClient", () => {
  it("shows an empty state when there are no opportunities", () => {
    mockHooks([]);
    render(<OpportunitiesClient />);
    expect(screen.getByText(/no.*opportunities/i)).toBeInTheDocument();
  });

  it("renders an opportunity card with source, title, and repo name", () => {
    mockHooks([{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1" }]);
    render(<OpportunitiesClient />);
    expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
    expect(screen.getByText("Show HN: hello-world")).toBeInTheDocument();
    expect(screen.getByText(/Hacker News/i)).toBeInTheDocument();
  });

  it("calls dismiss when the dismiss button is clicked", () => {
    const mutate = vi.fn();
    vi.spyOn(useOpportunitiesModule, "useOpportunities").mockReturnValue({
      data: [{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1" }],
    } as ReturnType<typeof useOpportunitiesModule.useOpportunities>);
    vi.spyOn(useOpportunitiesModule, "useDismissOpportunity").mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useOpportunitiesModule.useDismissOpportunity>);
    vi.spyOn(useReposModule, "useRepos").mockReturnValue({ data: [{ id: 10, owner: "octocat", name: "hello-world" }] } as unknown as ReturnType<typeof useReposModule.useRepos>);

    render(<OpportunitiesClient />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true }, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("does not render dismissed opportunities", () => {
    mockHooks([{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1", dismissed: true }]);
    render(<OpportunitiesClient />);
    expect(screen.queryByText("Show HN: hello-world")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/opportunities-client.test.tsx`
Expected: FAIL — module `@/components/opportunities/opportunities-client` not found.

- [ ] **Step 3: Implement the page and client component**

Create `frontend/app/opportunities/page.tsx`, mirroring `frontend/app/recommendations/page.tsx` exactly:

```tsx
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { OpportunitiesClient } from "@/components/opportunities/opportunities-client";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const queryClient = new QueryClient();

  const [opportunities, repos] = await Promise.all([api.listOpportunities(), api.listRepos()]);
  queryClient.setQueryData(queryKeys.opportunities.all, opportunities);
  queryClient.setQueryData(queryKeys.repos.all, repos);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OpportunitiesClient />
    </HydrationBoundary>
  );
}
```

Create `frontend/components/opportunities/opportunities-client.tsx`:

```tsx
"use client";

import { Radar, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useDismissOpportunity, useOpportunities } from "@/hooks/use-opportunities";
import { useRepos } from "@/hooks/use-repos";

const SOURCE_LABELS: Record<string, string> = {
  hacker_news: "Hacker News",
  github_discussions: "GitHub Discussions",
};

export function OpportunitiesClient() {
  const { data: opportunities } = useOpportunities();
  const { data: repos } = useRepos();
  const dismiss = useDismissOpportunity();

  const repoNameById = useMemo(() => {
    const map = new Map<number, string>();
    repos?.forEach((r) => map.set(r.id, `${r.owner}/${r.name}`));
    return map;
  }, [repos]);

  const visible = opportunities?.filter((o) => !o.dismissed);

  return (
    <div className="space-y-6">
      <SectionHeading icon={Radar} title="Opportunities" subtitle="New community mentions of your tracked repos" iconColor="text-rose-500" />

      {visible && visible.length === 0 ? (
        <EmptyState icon={Radar} title="No opportunities yet" description="They'll show up here once a mention is found." />
      ) : (
        <div className="space-y-2">
          {visible?.map((opp) => (
            <Card key={opp.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {repoNameById.get(opp.repo_id) ?? `repo #${opp.repo_id}`}
                  </p>
                  <a href={opp.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {opp.title}
                  </a>
                  <div className="mt-1">
                    <Chip>{SOURCE_LABELS[opp.source] ?? opp.source}</Chip>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss opportunity"
                  onClick={() =>
                    dismiss.mutate(
                      { id: opp.id, dismissed: true },
                      { onError: () => toast.error("Could not dismiss — try again.") },
                    )
                  }
                  disabled={dismiss.isPending}
                >
                  <X className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav entry**

In `frontend/components/nav-sidebar.tsx`, add `Radar` to the existing `lucide-react` import, and add a new entry to `NAV_ITEMS` after the existing `"Pipeline Runs"` entry:

```ts
{ href: "/opportunities", label: "Opportunities", icon: Radar, color: "text-rose-500" },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/opportunities-client.test.tsx`
Expected: `4 passed`

Then the full frontend verification (this is the final task in the plan):

Run: `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run && npx next build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/opportunities/ frontend/components/opportunities/ frontend/components/nav-sidebar.tsx frontend/tests/opportunities-client.test.tsx
git commit -m "feat(4d): add Opportunities page + nav entry"
```

---

## Final whole-branch review

After all 9 tasks: dispatch a final whole-branch code reviewer (opus, per this project's established pattern) covering the full diff since this plan's first commit. Confirm: backend full suite passes with no warnings, `pip-audit` clean; frontend `tsc`/`eslint`/`vitest`/`next build` all clean; the per-repo dedup genuinely prevents re-surfacing the same mention across runs; `search_discussions`'s 401 handling correctly trips the same `needs_reauth` circuit breaker as every other GitHubClient method; manual and scheduled triggers behave identically (no notify-style asymmetry, since none was designed for this feature). Then update `.agile-v/REQUIREMENTS.md` (new REQ), `.agile-v/STATE.md`, `docs/PROJECT_PLAN.md` (mark 4D's HN+Discussions scope done), and `docs/PROJECT_WALKTHROUGH.md` before the Product Owner's Gate 2 review — same sequence as every prior sub-project.
