# Phase 4D: Community & Trend Monitoring — Design Spec

Sub-project 4D of `docs/PROJECT_PLAN.md`'s Phase 4 (Professional Automation & Growth Platform). Depends on 4A (Draft plumbing — though this sub-project doesn't use `Draft` at all, see Scope). Chosen as the next sub-project per the Product Owner's "keep going through 4C→4D→4F→4G" instruction.

## Scope

`PROJECT_PLAN.md`'s 4D row names three sources: HN (Algolia, no auth), Reddit (needs a registered Reddit developer app), and GitHub Discussions (existing OAuth token covers it). This build ships **HN + GitHub Discussions monitoring only**, following the same "build what's unblocked now, defer what needs new external credentials" pattern Phase 4C established for its own cross-posting scope.

**Explicitly out of scope, deliberately:**

- **Reddit monitoring.** Needs a registered Reddit API app (client ID/secret) — real external setup only the Product Owner can do. When registered, Reddit becomes a small follow-up: one more source in `OpportunityExtractor`, reusing every other piece of this sub-project unchanged.
- **Any reply/action on a surfaced opportunity.** Per `PROJECT_PLAN.md`'s own words, "any reply always goes through 4F" (issue/discussion auto-response). This sub-project is purely informational — a dismissable inbox, not a draft-and-approve producer. It does not use the `Draft` table at all (see Data model below for why).

## Data model: `Opportunity`, not `Draft`

`Draft`'s semantics are a one-way `pending → approved | rejected` transition, because approving one *does something* (once a future producer wires an on-approve action). An `Opportunity` is a raw external mention with nothing to approve — there's no action to take on it here, only "seen it, dismiss it," which is exactly `Recommendation`'s existing dismissable-card pattern, not `Draft`'s. Reusing `Draft` would force an "approved" state with no real meaning, and reusing `Recommendation` directly would conflate two independently-evolving inboxes (a repo-health suggestion and an external community mention aren't the same feature, even if today they render similarly) — matching the same reasoning that gave `Draft` its own table in 4A rather than extending `Recommendation`.

```python
class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(50))  # "hacker_news" | "github_discussions"
    # Dedup key: HN's Algolia objectID or the GitHub Discussion's GraphQL node id.
    # A daily poll would otherwise re-surface the same mention every run until it
    # scrolls out of the search index/result window.
    external_id: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(1000))
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

No DB-level unique constraint on `(repo_id, source, external_id)` — matches this codebase's existing convention (no unique constraints beyond primary keys anywhere in `models.py`); dedup is a query-before-insert check in the Assembler stage, safe at this single-threaded-daily-poll scale.

## New external clients

**`HackerNewsClient`** (new file `backend/app/hackernews_client.py`), no auth, mirrors `GitHubClient`'s DI-testable `httpx.Client` shape even though it holds no credentials — for consistency with every other external integration in this codebase and to allow the same `http_client=` injection pattern in tests:

```python
import httpx


class HackerNewsClient:
    def __init__(self, http_client: httpx.Client | None = None):
        self._http = http_client or httpx.Client(base_url="https://hn.algolia.com/api/v1", timeout=15.0)

    def search(self, query: str, limit: int = 5) -> list[dict]:
        resp = self._http.get("/search", params={"query": query, "tags": "story", "hitsPerPage": limit})
        resp.raise_for_status()
        return resp.json().get("hits", [])
```

Each hit has `objectID`, `title` (or `story_title` for a comment hit — restrict `tags=story` to keep this simple and avoid comment-hit noise for v1), and `url` (falls back to the HN discussion permalink `https://news.ycombinator.com/item?id={objectID}` when a story has no external `url`, e.g. an Ask HN post).

**`GitHubClient.search_discussions`** (new method on the existing class), GitHub's GraphQL API — no REST equivalent exists for cross-repo discussion search:

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

Uses the existing `self._http` client (same `base_url="https://api.github.com"`, same `Authorization` header already set in `__init__`) since GitHub serves GraphQL at `/graphql` on the same host — no second client needed. Each node has `id` (the dedup key), `title`, `url`.

## Pipeline: two stages, no LLM synthesis

Unlike the analytics and content pipelines, nothing here is generated or judged — these are raw external facts (a real HN post exists, a real Discussion exists), so the full best-of-N/synthesizer/validator machinery doesn't apply. A minimal two-stage pipeline, still on the same `Stage`/`PipelineRunner` contract per Phase 4's governing decision #1:

```python
@dataclass
class OpportunityPipelineContext:
    repo: Repo
    raw: dict[str, Any] = field(default_factory=dict)
    opportunities: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
```

**`OpportunityExtractor`** (`backend/app/pipeline/opportunities/extractor.py`):

```python
class OpportunityExtractor(Stage):
    name = "opportunity_extractor"

    def __init__(self, hn_client: HackerNewsClient, gh_client: GitHubClient):
        self.hn_client = hn_client
        self.gh_client = gh_client

    def run(self, ctx: OpportunityPipelineContext) -> OpportunityPipelineContext:
        keyword = ctx.repo.name
        hn_hits = self.hn_client.search(keyword)
        for hit in hn_hits:
            ctx.opportunities.append({
                "source": "hacker_news",
                "external_id": hit["objectID"],
                "title": hit.get("title") or hit.get("story_title") or keyword,
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}",
            })

        discussion_hits = self.gh_client.search_discussions(keyword)
        for node in discussion_hits:
            ctx.opportunities.append({
                "source": "github_discussions",
                "external_id": node["id"],
                "title": node["title"],
                "url": node["url"],
            })
        return ctx
```

A repo-name search naturally matches on the repo's own Discussions too (the repo's own maintainer/community activity) as well as external mentions — both are legitimate "someone's talking about this" signals worth surfacing, so no filtering-out-your-own-repo step is needed.

**`OpportunityAssembler`** (`backend/app/pipeline/opportunities/assembler.py`):

```python
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

Dedup is scoped to `repo_id` only (not `repo_id + source`) since `external_id`s from HN (numeric Algolia IDs) and GitHub (GraphQL global node IDs, always base64-encoded strings starting with distinct prefixes) never collide in practice — no compound key needed.

## Wiring: jobs.py-style batch runner, third scheduler job, manual trigger

`backend/app/pipeline/opportunity_jobs.py`, structurally identical to `content_jobs.py`'s `run_content_pipeline_for_all_repos` (per-repo loop, per-user auth-failure circuit breaker, `PipelineRunner` with `pipeline_kind="opportunities"`, SSE publish after the loop):

```python
def run_opportunities_pipeline_for_all_repos(db: Session, user_id: int | None = None) -> None:
    settings = get_settings()
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

`PipelineRun.pipeline_kind` gains a third value, `"opportunities"` — no schema change needed, it's already an unconstrained `String` column (same reasoning as `"analytics"`/`"content"`).

`app/main.py` gains a third scheduler job, staggered 6h after the content job (analytics at T+0h, content at T+12h, opportunities at T+18h — spreading all three across the day so none contend for the same outbound-HTTP-call window, even though HN/GitHub Discussions calls aren't LLM-rate-limited like the content pipeline is):

```python
scheduler.add_job(
    _scheduled_opportunities_run,
    "interval",
    hours=24,
    id="daily_opportunities_run",
    next_run_time=datetime.now() + timedelta(hours=18),
)
```

`app/api/runs.py` gains `POST /runs/opportunities`, mirroring `POST /runs/content`'s exact shape (`BackgroundTasks`, `@limiter.limit("10/minute")`, 202 response).

## Backend API: `GET`/`PATCH /opportunities`

New router `app/api/opportunities.py`, mirroring `app/api/recommendations.py` byte-for-byte in structure:

```text
GET   /opportunities                    -> list[OpportunityOut], current user's, newest first
PATCH /opportunities/{opportunity_id}   -> OpportunityOut, body: {"dismissed": bool}
```

- `PATCH` sets `dismissed` directly (a re-flippable boolean, like `Recommendation.dismissed` — not a one-way transition like `Draft.status`), commits, publishes `broadcaster.publish("opportunity_updated", {"id": opp.id, "dismissed": opp.dismissed}, user_id=current_user.id)`.
- Path `opportunities` contains none of the forbidden ad-blocker substrings.
- Router registered in `app/main.py` alongside the other 7 routers.

## Real-time sync

Two new event types, both empty-payload/id-payload matching existing precedents:

- `opportunities_generated` (published after a full batch run, empty payload — matches `run_completed`/`drafts_generated`'s precedent).
- `opportunity_updated` (published on dismiss, `{id, dismissed}` payload — matches `recommendation_updated`'s precedent exactly).

`hooks/use-live-events.ts`'s `EVENT_QUERY_MAP` gains:

```ts
opportunities_generated: [queryKeys.opportunities.all, queryKeys.runs.all],
opportunity_updated: [queryKeys.opportunities.all],
```

## Frontend

Mirrors the Recommendations page/hook/component trio, per this project's established "reuse the exact interaction, new data" pattern:

- `lib/query-keys.ts`: `opportunities: { all: ["opportunities"] as const }`.
- `lib/api.ts`: `listOpportunities`, `dismissOpportunity` (mirrors `listRecommendations`/`dismissRecommendation` exactly).
- `hooks/use-opportunities.ts`: `useOpportunities()` + `useDismissOpportunity()`, mirrors `use-recommendations.ts`'s `setQueryData`-on-success pattern (no `insights` cache to invalidate here, since `Opportunity` has no derived count shown elsewhere — unlike `Recommendation.dismissed`, nothing else in the UI currently surfaces an opportunity count).
- `app/opportunities/page.tsx`: SSR, `Promise.all([api.listOpportunities(), api.listRepos()])`, mirrors `app/recommendations/page.tsx`.
- `components/opportunities/opportunities-client.tsx`: mirrors `recommendations-client.tsx`'s card list — repo name, `source` badge (`Chip` primitive, e.g. "Hacker News" / "GitHub Discussions"), title as a link to `url` (opens in a new tab), dismiss button. No category filter (unlike Recommendations, there's no meaningful per-repo category grouping here beyond source, and with only 2 sources a filter is premature UI for v1).
- `components/nav-sidebar.tsx`: new entry `{ href: "/opportunities", label: "Opportunities", icon: Radar, color: "text-rose-500" }` — `rose` is the one color already reserved-but-unused in the existing nav set (confirmed against the current 5 entries: sky/amber/emerald/violet/slate).
- `hooks/use-live-events.ts`: the two new event mappings above.

## Testing

Backend:

- `test_hackernews_client.py` (new): `search` returns parsed hits; `raise_for_status` propagates on HTTP error — same `httpx.MockTransport` pattern as `test_github_client.py`.
- `test_github_client.py`: extend with `search_discussions` tests (populated result, 401 → `GitHubAuthError`, empty result).
- `test_opportunity_extractor.py` / `test_opportunity_assembler.py` (new, mirroring `test_content_extractor.py`/`test_content_assembler.py`'s structure): Extractor combines both sources' hits into `ctx.opportunities`; Assembler dedupes against existing `external_id`s per repo, writes only new rows.
- `test_opportunity_jobs.py` (new, mirroring `test_content_jobs.py`): per-user scoping, auth-failure circuit breaker isolation, SSE publish.
- `test_opportunities_api.py` (new, mirroring `test_recommendations_api.py`): list scoping, dismiss toggle, cross-user 404, SSE publish assertion.

Frontend:

- `opportunities-client.test.tsx` (new, mirroring an existing recommendations/drafts client test): renders opportunity cards, dismiss action, source badge.
- `use-live-events` test: extend with the 2 new event mappings.

Both suites stay at 100% pass, zero warnings.

## Migration & type-generation sequencing

Same established order as every prior sub-project: add `Opportunity` model + migration (review, don't run `alembic upgrade head` against real Postgres) → build/test backend pipeline stages + jobs + API in isolation → start local backend + regenerate frontend types (`OpportunityOut` needs to exist in the OpenAPI schema, unlike 4C's untyped `Draft.content`) → build frontend layer.

## Non-goals restated (from Phase 4's governing decisions, still binding)

- Nothing here posts, replies, or acts on anything external — pure read/surface/dismiss, no draft-and-approve gate needed since there's no external action to gate.
- No n8n, no new service, no new deploy target — `HackerNewsClient` is a plain `httpx` call, `search_discussions` reuses the existing authenticated GitHub `httpx.Client`, same shape as every other integration in this codebase.
