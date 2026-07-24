# Phase 4F: Issue/Discussion Auto-Response — Design Spec

Sub-project 4F of `docs/PROJECT_PLAN.md`'s Phase 4 (Professional Automation & Growth Platform). Depends on 4A (Draft plumbing, done) and 4B (Agentic Content Pipeline, done).

## Relationship to 4D (resolved by investigation, not assumption)

`PROJECT_PLAN.md`'s dependency table lists 4F as depending on 4A, 4B, **and 4D**. Investigation (reading `backend/app/github_client.py`, `backend/app/pipeline/opportunities/*`, and both rows' exact wording) confirms this is **not a data dependency**: 4D monitors *external* mentions of tracked repos elsewhere on the internet (HN, GitHub Discussions searched globally by repo name) and surfaces them as a read-only `Opportunity` inbox. 4F is about replying to activity happening *on* the user's own tracked repos — a completely different GitHub API surface (list issues/discussions for one specific owned repo, then post a reply) that shares zero data with `Opportunity`. The dependency in the table is best read as "4D introduced the first GraphQL capability to `GitHubClient` (`search_discussions`)" — a technical pattern 4F extends (a new, differently-scoped GraphQL method), not a data or workflow dependency. 4F does not read from, write to, or reference the `Opportunity` table anywhere.

## Why this is architecturally different from every prior Draft-producing sub-project

Every Draft kind before this one (4B's four kinds, 4C's `release_notes`) has "approved" as a pure status flip — no future producer had ever wired an on-approve side effect, exactly as 4A's own design spec anticipated ("Each future producer registers its own on-approve behavior when it lands"). **4F is that producer.** Approving an `issue_reply`/`discussion_reply` Draft must actually post the reply to GitHub. This is also the first write capability `GitHubClient` will ever have — CLAUDE.md's hard constraint ("no method that could star, fork, follow, or otherwise touch another account's repo... any future feature that would write to GitHub — issue replies, etc. — goes through the Draft approval gate first, never directly") explicitly anticipates and permits exactly this, gated behind Draft approval, never called from the pipeline itself.

**Posting happens synchronously inside `PATCH /drafts/{id}`** (Product-Owner-confirmed): a single external HTTP/GraphQL call, not a multi-minute LLM pipeline — the user clicks approve and sees "posted" or "failed" (with the real reason) immediately, with no new transient "approved-but-not-yet-posted" state or new SSE event needed for this specific transition.

## Scope

Ships both `issue_reply` and `discussion_reply` kinds together (they share nearly all machinery — separating them into two build phases would be artificial). No new external credentials needed: the user's own GitHub OAuth token already covers reading/commenting on repos they own.

**Explicitly out of scope:**

- **Filtering out issues that already have a maintainer reply.** Detecting "has anyone already responded" reliably needs fetching and inspecting every issue's comment thread — real complexity for a v1 whose safety net (human review before posting) already makes an occasionally-redundant draft a non-issue (the reviewer just rejects it).
- **Any classification of "should this even get a reply"** (spam/off-topic detection). Every new issue/discussion gets a drafted reply; the human decides whether it's worth sending.
- **Replying to Pull Requests.** GitHub's issues REST endpoint returns PRs as a subtype of issue (each has a `pull_request` key when it's actually a PR) — these are explicitly filtered out. PR review is a different, higher-stakes surface not in scope here.

## Data model: no new columns, reuse Draft's existing dedup-by-existence pattern

Unlike 4C's single "latest release" (one high-water-mark column works fine), a repo can get multiple new issues/discussions between polls, and a single `last_seen_number` column can't cleanly express "this one failed to draft, retry it next time" without also silently re-fetching (and wastefully re-running LLM calls on) issues that already got a Draft. Instead, mirroring 4D's `OpportunityAssembler`'s per-`external_id` dedup check against existing rows: **before creating a candidate task, check whether a `Draft` already exists for `(repo_id, kind, target)`.** If one exists — regardless of its status (pending/approved/rejected/posted/failed all count as "already handled") — skip it. If none exists, it's genuinely new and gets drafted. This needs no schema change to `Repo` and correctly retries only genuine LLM/pipeline failures (no Draft was ever written for those) without ever double-drafting something already decided.

Two new nullable `Draft` columns, generic across all kinds (not just these two — kept general since any future kind could need the same "why did this fail" surface):

```python
class Draft(Base):
    ...
    # Set only when status transitions to "failed" (currently only issue_reply/
    # discussion_reply can reach "failed" — every other kind's approve is a pure
    # status flip with nothing that can fail). Null otherwise.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`status` itself needs no schema change — it's already an unconstrained `String(50)`; `"posted"`/`"failed"` are new *values*, not new columns, matching the original Draft table sketch's own comment (`"pending" | "approved" | "rejected" | "posted" | "failed"`) that 4A deliberately didn't enforce at the DB layer.

## New `GitHubClient` capabilities (2 read, 2 write — the project's first writes)

```python
def list_repo_issues(self, owner: str, name: str, limit: int = 20) -> list[dict]:
    """Open issues only, newest first, PRs excluded (GitHub's issues endpoint
    returns PRs as a subtype — each carries a 'pull_request' key)."""
    resp = self._get(f"/repos/{owner}/{name}/issues", params={"state": "open", "sort": "created", "direction": "desc", "per_page": limit})
    return [issue for issue in resp.json() if "pull_request" not in issue]

def list_repo_discussions(self, owner: str, name: str, limit: int = 10) -> list[dict]:
    graphql_query = """
    query($owner: String!, $name: String!, $limit: Int!) {
      repository(owner: $owner, name: $name) {
        discussions(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { id number title body url }
        }
      }
    }
    """
    resp = self._http.post("/graphql", json={"query": graphql_query, "variables": {"owner": owner, "name": name, "limit": limit}})
    if resp.status_code == 401:
        raise GitHubAuthError(f"needs_reauth: GitHub token rejected listing discussions for {owner}/{name}")
    resp.raise_for_status()
    data = resp.json().get("data") or {}
    repo = data.get("repository") or {}
    discussions = repo.get("discussions") or {}
    return discussions.get("nodes") or []

def create_issue_comment(self, owner: str, name: str, issue_number: int, body: str) -> dict:
    resp = self._http.post(f"/repos/{owner}/{name}/issues/{issue_number}/comments", json={"body": body})
    if resp.status_code == 401:
        raise GitHubAuthError(f"needs_reauth: GitHub token rejected posting to {owner}/{name}#{issue_number}")
    resp.raise_for_status()
    return resp.json()

def create_discussion_comment(self, discussion_id: str, body: str) -> dict:
    graphql_query = """
    mutation($discussionId: ID!, $body: String!) {
      addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
        comment { id }
      }
    }
    """
    resp = self._http.post("/graphql", json={"query": graphql_query, "variables": {"discussionId": discussion_id, "body": body}})
    if resp.status_code == 401:
        raise GitHubAuthError(f"needs_reauth: GitHub token rejected posting a discussion comment")
    resp.raise_for_status()
    return resp.json()
```

`list_repo_issues` is a REST GET (like every existing `_get`-wrapped method); `list_repo_discussions` reuses the GraphQL pattern 4D introduced, scoped to one repo instead of a global search. The two `create_*` methods are genuinely new territory for this codebase — **both are called ONLY from the on-approve handler in `app/api/drafts.py`, never from the pipeline** (the pipeline only ever reads and drafts, matching every existing Stage's read-only contract).

## Pipeline: extend the existing content pipeline (4C's precedent, not a new pipeline)

Same reasoning 4C used for release notes: this is another "generate content via LLM, write as Draft" producer, so it's two more `ContentTask` kinds inside the existing `ContentExtractor → ContentAnalyzer → ContentPreprocessor → ContentOptimizer → ContentSynthesizer → ContentValidator → ContentAssembler` pipeline. No new pipeline, no new scheduler job, no new `pipeline_kind` value (stays `"content"`).

**`ContentExtractor`** gains two more raw fetches: `ctx.raw["open_issues"] = gh_client.list_repo_issues(owner, name)` and `ctx.raw["discussions"] = gh_client.list_repo_discussions(owner, name)`.

**`ContentAnalyzer`** needs DB access for the first time (a small, justified constructor change — matching how `ContentAssembler` already takes `db_session`) to check existing Drafts before creating a task:

```python
class ContentAnalyzer(Stage):
    name = "content_analyzer"

    def __init__(self, db_session: Session):
        self.db = db_session

    def run(self, ctx: ContentPipelineContext) -> ContentPipelineContext:
        ...  # existing readme/missing-doc/topic/seo/release_notes logic unchanged

        for issue in ctx.raw.get("open_issues", []):
            target = f"issue:{issue['number']}"
            if self._draft_exists(ctx.repo.id, "issue_reply", target):
                continue
            tasks.append(ContentTask(
                kind="issue_reply", target=target, structured=False, current=None,
                source_material={"title": issue["title"], "body": issue.get("body") or "", "repo_name": ctx.repo.name},
            ))

        for disc in ctx.raw.get("discussions", []):
            target = f"discussion:{disc['number']}"
            if self._draft_exists(ctx.repo.id, "discussion_reply", target):
                continue
            tasks.append(ContentTask(
                kind="discussion_reply", target=target, structured=False, current=None,
                source_material={
                    "title": disc["title"], "body": disc.get("body") or "", "repo_name": ctx.repo.name,
                    "discussion_node_id": disc["id"],
                },
            ))

        ctx.tasks = tasks
        return ctx

    def _draft_exists(self, repo_id: int, kind: str, target: str) -> bool:
        return self.db.query(Draft).filter_by(repo_id=repo_id, kind=kind, target=target).first() is not None
```

`content_jobs.py` updates its `build_content_stages` call site to pass `db_session` into `ContentAnalyzer(db_session=db)`.

**`ContentSynthesizer`** gains two prompts (free-text, `structured=False`, flows through the existing candidate-generation path unmodified):

```python
"issue_reply": (
    "You are a helpful, friendly open-source maintainer replying to a new GitHub "
    "issue on {repo_name}. Write a considerate, helpful reply — ask for missing "
    "details if the issue is unclear, or offer initial guidance if the problem is "
    "clear. Do not make promises about timelines or commit to specific fixes. "
    "Respond with the reply text only, no commentary.\n\n"
    "Issue title: {title}\nIssue body:\n{body}"
),
"discussion_reply": (
    "You are a helpful, friendly open-source maintainer replying to a new GitHub "
    "Discussion on {repo_name}. Write a considerate, helpful reply engaging with "
    "what was asked or discussed. Do not make promises about timelines or commit "
    "to specific fixes. Respond with the reply text only, no commentary.\n\n"
    "Discussion title: {title}\nDiscussion body:\n{body}"
),
```

**`ContentValidator`** needs no change — the existing metric-claim number-check and LLM-as-judge selection are kind-agnostic already.

**`ContentAssembler`** writes the kind-specific content shape:

```python
if task.kind == "discussion_reply":
    return {"suggested": task.winner, "reason": task.winner_reason, "discussion_node_id": task.source_material["discussion_node_id"]}
if task.kind in ("missing_doc_suggestion", "release_notes", "issue_reply"):
    return {"suggested": task.winner, "reason": task.winner_reason}
```

`discussion_reply` carries `discussion_node_id` because GitHub's `addDiscussionComment` mutation needs the discussion's GraphQL global node ID, not its human-facing `number` — `target` stays the readable `"discussion:{number}"` string for the UI, while the id needed to actually post lives in `content`.

## Backend API: the on-approve dispatch in `app/api/drafts.py`

`DraftOut` gains `error_message: str | None`. The `PATCH /drafts/{id}` handler gains a kind-specific dispatch, executed synchronously after the status flips to `"approved"` and before the response is returned:

```python
@router.patch("/{draft_id}", response_model=DraftOut)
def review_draft(
    draft_id: int,
    payload: DraftPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> Draft:
    draft = db.execute(
        select(Draft).where(Draft.id == draft_id, Draft.user_id == current_user.id)
    ).scalars().first()
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "pending":
        raise HTTPException(status_code=409, detail="Draft has already been reviewed")

    draft.status = payload.status
    draft.reviewed_at = datetime.now(draft.created_at.tzinfo)

    if payload.status == "approved" and draft.kind in ("issue_reply", "discussion_reply"):
        _post_reply(draft, current_user, db)

    db.commit()
    db.refresh(draft)
    broadcaster.publish("draft_updated", {"id": draft.id, "status": draft.status}, user_id=current_user.id)
    return draft


def _post_reply(draft: Draft, current_user: User, db: Session) -> None:
    repo = db.get(Repo, draft.repo_id)
    try:
        gh_client = GitHubClient(token=decrypt_token(current_user.access_token_encrypted))
        if draft.kind == "issue_reply":
            issue_number = int(draft.target.removeprefix("issue:"))
            gh_client.create_issue_comment(repo.owner, repo.name, issue_number, draft.content["suggested"])
        else:
            gh_client.create_discussion_comment(draft.content["discussion_node_id"], draft.content["suggested"])
        draft.status = "posted"
    except Exception as exc:
        draft.status = "failed"
        draft.error_message = str(exc)
```

`_post_reply` mutates `draft.status`/`draft.error_message` in place; the caller's single `db.commit()` persists both the review and the post outcome atomically — either everything commits together, or (on a DB-level failure) nothing does, never a half-applied state. Rejecting a Draft never calls `_post_reply` — matches every existing kind's behavior exactly.

## Frontend

- `frontend/types/drafts.ts`: `DraftKind` gains `"issue_reply"` and `"discussion_reply"`. New `IssueReplyContent = MissingDocSuggestionContent` and `DiscussionReplyContent extends MissingDocSuggestionContent { discussion_node_id: string }` type aliases.
- `frontend/components/drafts/drafts-client.tsx`: `DRAFT_KIND_LABELS` gains `issue_reply: "Issue reply"`, `discussion_reply: "Discussion reply"`. The approve button's mutation call gains a response-status branch: on success, if the returned Draft's `status === "failed"`, show `toast.error(`Could not post: ${draft.error_message}`)`; if `"posted"`, show `toast.success("Reply posted to GitHub")`. Every other kind's approve keeps today's plain success/no-toast behavior (their status is always `"approved"` on success, never `"posted"`/`"failed"`, so the new branch is a no-op for them).
- `frontend/components/drafts/draft-content.tsx`: two new branches, both reusing `isMissingDocSuggestion`'s shape/rendering (matching `release_notes`'s precedent of reusing the identical `{suggested, reason}` display).

No new backend endpoint, no new SSE event — `draft_updated` already carries this; the frontend just needs to react to two new terminal `status` values it hasn't seen before.

## Testing

Backend:

- `GitHubClient`: `list_repo_issues` filters out PR-shaped issues; `list_repo_discussions` (GraphQL, null-safe like `search_discussions`); `create_issue_comment`/`create_discussion_comment` (success + 401 → `GitHubAuthError`).
- `ContentAnalyzer`: creates `issue_reply`/`discussion_reply` tasks for new issues/discussions; skips ones with an existing Draft for that `(repo_id, kind, target)`, regardless of that Draft's status.
- `ContentSynthesizer`: prompt-building for both new kinds.
- `ContentAssembler`: `discussion_reply`'s content includes `discussion_node_id`; `issue_reply`'s doesn't.
- `test_drafts_api.py`: approving an `issue_reply` Draft calls `create_issue_comment` and the response `status` becomes `"posted"`; approving a `discussion_reply` Draft calls `create_discussion_comment` with the right node id; a mocked posting failure sets `status="failed"` and populates `error_message`; rejecting never calls either posting method; every pre-existing kind's approve flow is unaffected (still ends in `"approved"`, no posting attempted).

Frontend:

- `draft-content.test.tsx`: both new kinds render `suggested`/`reason`.
- `drafts-client.test.tsx` (or new): approve on a `posted`-response Draft shows a success toast; approve on a `failed`-response Draft shows an error toast with the message; approve on every other kind shows no such toast (regression check).

Both suites stay at 100% pass, zero warnings.

## Migration & sequencing

1. Add `Draft.error_message`, migrate (reviewed, not applied against real Postgres — deferred to the Product Owner, same as every prior migration).
2. Build/test the 4 new `GitHubClient` methods in isolation.
3. Build/test `ContentAnalyzer`'s `db_session` + dedup-check change, `ContentExtractor`'s 2 new fetches, `ContentSynthesizer`'s 2 prompts, `ContentAssembler`'s 2 content shapes.
4. Build/test the `drafts.py` on-approve dispatch.
5. Regenerate frontend types (`DraftOut.error_message`), build the frontend layer.

## Non-goals restated (from Phase 4's governing decisions, still binding)

- Nothing posts without an explicit human approval — this sub-project is the proof of that promise under real stakes (a real external write), not an exception to it.
- No n8n, no new service, no new deploy target, no new scheduler job, no new pipeline — this sub-project adds zero new moving parts to the running system beyond two new task kinds and the first (carefully gated) write path on an existing client.
