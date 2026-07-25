# Project Plan — GitHub Growth Bot

Living roadmap. Requirement-level detail and status: `.agile-v/REQUIREMENTS.md`. This file is the human-readable narrative version.

## Status Summary (read this first)

| Phase | Status |
|---|---|
| Phase 1: Repo Health & Analytics | ✅ Done — code-complete, reviewed, Gate 2-accepted |
| Phase 2: Multi-Tenant SaaS Foundation | ✅ Done — code-complete, reviewed, Gate 2-accepted, live E2E OAuth-verified |
| Phase 3: Visual & Portfolio Polish | ✅ Done (2026-07-25) — code-complete, reviewed, ready to merge |
| Phase 4A–4G: Professional Automation & Growth Platform | ✅ Done — all 7 sub-projects code-complete, reviewed, Gate 2-accepted (4C/4D shipped with a narrower scope than originally sketched; see their rows below) |
| Deployment (VPS + Vercel) | ❌ Not started — requires Product Owner action (server/dashboard access this agent doesn't have) |
| 4C/4D cross-posting, Reddit monitoring, 4G cloud storage | ❌ Not started — each requires registering a developer account/API key first (see the "New external dependencies" table below) |

All four buildable phases (1, 2, 3, 4A–4G) are now code-complete. The only work left in this whole plan is Product-Owner-side: deployment itself, and the account-gated cross-posting/monitoring/storage scope above.

## Phase 1: Repo Health & Analytics

The foundation everything else builds on — track repo metrics over time, benchmark against similar projects, surface AI-synthesized (and fact-checked) recommendations, in a fast personal dashboard.

### Backend — ✅ Done (2026-07-20)

- 7-stage analytics pipeline (Extractor → Preprocessor → Analyzer → Optimizer → Synthesizer → Validator → Assembler), running daily per tracked repo, resilient to any single stage failing.
- GitHub data extraction: stars/forks/watchers/open-issues, 14-day traffic, referrers, popular paths, README/LICENSE/CONTRIBUTING presence, benchmark repos.
- 6-provider LLM fallback router (Groq → Gemini → OpenRouter → Hugging Face → Cloudflare Workers AI → Vercel AI Gateway) so no single free-tier rate limit ever blocks a run.
- Hallucination-guarding Validator — every AI-written recommendation gets its cited numbers cross-checked against real data before it's shown to anyone.
- REST + SSE API (ad-blocker-safe endpoint naming), API-key authentication on every route.
- Daily automated trigger (APScheduler) + real-time event push for instant UI updates.
- Postgres schema + Alembic migrations, ready for the existing Coolify/Hetzner VPS deployment pattern.
- 30/30 tests passing. 11 implementation tasks + 1 final whole-branch review, each independently reviewed by a fresh subagent — 5 real defects caught and fixed along the way (see `.agile-v/CAPA_LOG.md` and `.agile-v/DECISION_LOG.md` for the two most significant: a DB-session-poisoning bug that would've crashed the daily pipeline run, and a dead `/benchmarks` endpoint that silently never got real data written to it).

**Not yet done for backend:** actual VPS deployment (DNS, Coolify app, Postgres provisioning, `alembic upgrade head`) — code is ready, deploy is a manual step tracked as an open item.

### Frontend — ✅ Done (2026-07-21)

Next.js 16 App Router dashboard consuming the backend API:

- Overview page (tracked repos, sparklines, delta badges), repo detail page (trend charts, benchmark comparison, referrers, popular paths, recommendations), recommendations inbox, pipeline run history, settings (manage tracked repos)
- Instant updates everywhere on any CRUD action (dismiss, add/remove repo, manual run) — no page refresh, current tab and every other open tab, via TanStack Query mutations + the backend's SSE stream
- SSR-first rendering: every page is `force-dynamic` with parallel (`Promise.all`) server-side prefetch directly in `page.tsx`; page shell appears instantly, only data regions show inline skeletons, no `loading.tsx` anywhere
- Strict TypeScript throughout, types generated from the backend's live OpenAPI schema, shared `lib/`/`hooks/`/`providers/`/`components/ui/` layer, icon+color conventions on every title/label/button
- API key never reaches the browser — Next.js Route Handlers proxy every backend call server-side
- Production guardrails configured for Vercel (bot protection, security headers, no-crawl robots policy) — actual deployment still pending, tracked separately

**Status:** built via 20-task subagent-driven plan (`docs/superpowers/plans/2026-07-20-github-growth-bot-frontend.md`), each task independently reviewed, plus a final whole-branch review. One backend bug found along the way (no cascade-delete on repo foreign keys, causing a 500 on deleting a repo with history) — root-caused and fixed with a proper migration + regression test. A post-plan deep audit then found and closed one more gap: 6 starlette CVEs + 1 pytest CVE reached transitively via a pinned `fastapi` version, fixed by bumping dependencies. Gate 2-accepted (`GATE-0002`).

## Phase 2: Multi-Tenant SaaS Foundation — ✅ Done (2026-07-22)

Everything from here on depends on this landing first: today the app is single-tenant (one shared static API key, one global set of tracked repos). This phase turns it into a real multi-tenant SaaS — anyone can sign in with their own GitHub account and track their own repos, fully isolated from every other user's data.

- **Auth:** Auth.js (NextAuth v5), GitHub OAuth provider only, JWT session (no DB adapter — Next.js still never touches Postgres directly, matching the existing "backend owns the DB" rule). Public-repo scope only for v1 (lower liability; growth metrics are inherently public-facing signals anyway).
- **Data isolation:** new `User` table; every existing table (`Repo`, `Snapshot`, `BenchmarkRepo`, `Referrer`, `PopularPath`, `Recommendation`, `PipelineRun`, `StageRun`) gains a `user_id` FK (`ondelete="CASCADE"`). Existing historical data backfills to the Product Owner's own account on first login — no data lost.
- **Security, defense-in-depth:** Auth.js session check → Route Handler mints a short-lived HMAC-signed internal token (closes the "what if the backend port is ever reachable directly" gap that a plain trusted header wouldn't) → existing `require_api_key` → new `require_user` dependency → every query filtered by `user_id` at the DB layer. OAuth tokens encrypted at rest (Fernet), never logged, never returned by any API response.
- **Billing:** free-for-everyone in v1 — no Stripe yet — but `plan` (default `"free"`) and `max_tracked_repos` (default `5`) columns ship now so a future plans/billing phase is a config change, not a schema migration.

### Applicable architecture concepts (from `docs/PROJECT_IDEA.md`'s 12) — reviewed against this project's actual scale

| # | Concept | Applied how | Why (or why not yet) |
|---|---|---|---|
| 2 | Caching | New in-memory TTL cache in the backend for expensive/rate-limited GitHub calls (benchmark/similar-repo search); TanStack Query client cache + SSR prefetch already cover the frontend side | Real, immediate payoff — GitHub search calls are the most rate-limit-sensitive part of the pipeline |
| 4 | Message Queue | Manual `POST /runs` moves off the synchronous request path onto FastAPI `BackgroundTasks` (immediate 202, run happens in background) | With multiple users able to trigger runs concurrently, blocking a web request on a multi-minute LLM-backed pipeline run is a real bug, not a hypothetical one |
| 5 | Publish–Subscribe | Existing SSE `EventBroadcaster` gets scoped per-user — a user's `/events` stream only ever receives events for their own data | Multi-tenant makes the current "broadcast to everyone" behavior an actual data-leak (User B would see User A's repo-added/run-completed events) |
| 6 | API Gateway | Formalizing what already exists: Next.js Route Handlers are the single entry point for auth, routing, and now internal-token minting; rate limiting added at this layer too | Already the architecture — this phase just adds the auth check that was missing |
| 7 | Circuit Breaker | Extends the existing per-stage pipeline isolation and `LLMRouter` provider fallback: a user's expired/revoked GitHub token now stops that user's run early (marked "needs reauth") instead of retry-hammering a dead token | One user's bad token must never affect another user's run or waste retry budget |
| 10 | Rate Limiting | `slowapi`, per-user and per-IP, on `POST /repos` and `POST /runs`; in-memory store (single-container deploy) | Public sign-up means public abuse surface for the first time — this wasn't a concern in the single-tenant version |
| 1 | Load Balancing | Not added | Vercel already load-balances the frontend at the edge; backend is one Coolify container serving personal-SaaS-scale traffic — revisit only if real load ever demands horizontal scaling |
| 3 | CDN | Not added (already satisfied) | Vercel's edge network already CDNs every static asset; nothing to build |
| 8 | Service Discovery | Not added | Exactly two services (frontend, backend) at fixed, env-configured URLs — a service mesh would be solving a problem this architecture doesn't have |
| 9 | Sharding | Not added | Single Postgres instance is nowhere near the row-count/throughput where sharding pays for itself; revisit only if a specific table's growth actually demands it |
| 11 | Consistent Hashing | Not added | No distributed cache or sharded store exists yet to need it — would be solving for infrastructure this project doesn't have |
| 12 | Auto Scaling | Not added | Vercel auto-scales the frontend inherently; Coolify can scale backend replicas later if traffic ever requires it — premature today |

The six left "not added" aren't skipped out of laziness — building them now would be solving problems this project doesn't have yet at personal-SaaS scale, which is its own kind of technical debt (complexity with no payoff). Each has a stated trigger for revisiting it later.

Full design: `docs/superpowers/specs/2026-07-21-multi-tenant-saas-design.md`.

**Status:** built via 18-task subagent-driven plan (`docs/superpowers/plans/2026-07-21-github-growth-bot-multi-tenant-saas.md`), each task independently reviewed, plus a whole-backend review (after the 10 backend tasks) and a final whole-branch review (after all 18). Real gaps found and fixed along the way: a `needs_reauth` circuit-breaker marker missing from the plan's own reference code (Task 8); a scheduler blast-radius bug where one tenant's corrupted OAuth token could have aborted the entire nightly run for every user (whole-backend review); and, at final review, two deploy-time hazards — undocumented shared-secret requirements between the frontend/backend `.env` files, and a silent sign-in failure mode if the backend's user-provisioning call ever 500s. All fixed and re-verified. Backend: 69/69 tests, `pip-audit` clean. Frontend: `tsc`/`eslint`/`build` clean, 8/8 tests. **Not yet done:** live end-to-end verification with a real GitHub OAuth App (needs the Product Owner to register one) — everything else is code-complete and reviewed.

## Phase 3: Visual & Portfolio Polish — ✅ Done (2026-07-25)

Sequenced after Phase 2 in the original plan; Phase 4 was built first instead (Product Owner's own priority call). Picked back up once Phase 4 closed, via `docs/superpowers/specs/2026-07-25-phase3-visual-portfolio-polish-design.md` → `docs/superpowers/plans/2026-07-25-phase3-visual-portfolio-polish.md` (13 tasks).

- Self-hosted Geist Sans/Mono (`next/font/local`, zero flash-of-unstyled-text), `font-mono tabular-nums` applied to numeric/tabular data (stat counts, durations, table numeric columns) for column alignment.
- Glassmorphism design system: `.glass`/`.glass-interactive` CSS utility classes (light+dark, OKLCH-derived tokens) applied to Card/Chip/Button/Input, plus a new headless `Select` primitive (`@base-ui/react/select`) — the app's first dropdown component.
- TanStack Table adopted for all 4 data tables (provider status, popular paths, referrers, benchmarks) via a shared `DataTable` wrapper: search input, filter dropdowns, and sortable columns.
- Sonner toasts moved to a `(title, description)` shape, repositioned bottom-right, plus new welcome/goodbye lifecycle toasts on sign-in/sign-out.
- Live per-stage pipeline visualization on the Runs page accordion — a new backend `stage_completed` SSE broadcast (no schema change) drives real-time stage-by-stage progress instead of only post-hoc results.
- Staggered list-mount entrance animations (`tw-animate-css`, respects `prefers-reduced-motion`) and threshold-based dynamic semantic text coloring, both reusing the app's existing color/animation conventions rather than introducing new ones.
- The "agentic pipeline" visualization from the original Phase 3 scope shipped as the live per-stage accordion above rather than a separate dedicated view (Product-Owner-confirmed scope decision during brainstorming).

**Notable mid-build finding:** the final whole-branch review caught a real, pre-existing bug that had shipped silently through every prior task's review — an unterminated CSS comment in `globals.css` (a literal comment-close sequence embedded in the prose) was swallowing the `.glass`/`.glass-interactive` rules into a dead selector, so the entire glassmorphism system had been visually a no-op in every build since Task 2, undetected by eslint/tsc/vitest/build (none of which parse compiled CSS). The first fix attempt ironically reintroduced the identical bug in its own warning text about it; the second fix was verified correct three independent ways (a character-level comment lexer, a standalone compile through the real Tailwind CSS engine, and the actual production build's output CSS), and a permanent compile-time regression test was added so this class of bug can't silently recur again.

## Phase 4: Professional Automation & Growth Platform — ✅ Done (2026-07-24, all 7 sub-projects)

Turns the product from "tracks your repo's numbers" into "an agentic co-pilot that grows your repo for you" — the full feature set originally sketched in `docs/PROJECT_IDEA.md`, now scoped into concrete, independently buildable sub-projects. Every sub-project below still goes through its own `superpowers:brainstorming` → design spec → `superpowers:writing-plans` → `superpowers:subagent-driven-development` cycle before implementation starts — this section is the architecture that governs those specs, not a substitute for them.

### Four governing decisions (made before any of this was written)

1. **Automation engine is native, not n8n.** Every "automation" below is expressed as a `Stage`/`PipelineRunner` pipeline — the same load-bearing contract from Phase 1 (`backend/app/pipeline/base.py`: `Stage.run(ctx: PipelineContext) -> PipelineContext`, per-stage exception isolation) — scheduled via APScheduler jobs, not a second workflow-automation service. Reasoning: one Coolify container instead of two, no new secrets/attack surface/DB to secure, and it reuses infrastructure (rate limiting, circuit breaker, per-user scoping, SSE) that's already built and tested rather than re-solving the same problems inside a separate tool. n8n is not ruled out permanently — if a specific future integration turns out to be genuinely visual/workflow-editor-shaped, it can be added later as an optional add-on service without touching this core.
2. **Every external-facing action is draft-and-approve.** Nothing posts to GitHub, LinkedIn, X, Reddit, Dev.to, or an Awesome list, and no issue/discussion reply goes out, without the Product Owner (or, later, the signed-in tenant) explicitly approving it first in the dashboard. This generalizes the existing Recommendations-inbox pattern (dismissable cards backed by a status column) rather than inventing a new UI. Reasoning: autonomous posting on a real account risks platform ToS violations, spam flags, and reputational damage from a low-quality auto-reply — none of which is worth the saved click.
3. **"Demo videos" means real screen recordings, not synthetic AI video.** Playwright drives the actual deployed dashboard; `ffmpeg` composites the recording into a GIF/MP4. Ollama and LlamaIndex are text/retrieval tools — neither generates video — so they play no role in this sub-project. AI-generated synthetic/avatar video is an explicit non-goal for now (cost-per-generation, external API dependency, no clear payoff over an accurate real walkthrough).
4. **Local Ollama is an optional dev-time provider, not assumed in the production `LLMRouter` chain.** The existing 6-provider free-tier fallback (Groq → Gemini → OpenRouter → Hugging Face → Cloudflare Workers AI → Vercel AI Gateway) already solves "never blocked by one rate limit" at zero infra cost. Adding a 7th, self-hosted Ollama provider would mean running an LLM runtime alongside Postgres and the backend on the same Hetzner VPS — real RAM/CPU contention with no clear benefit over the existing free-tier chain. Revisit only if a specific feature needs a model none of the 6 providers offer.

### The Agentic Content Pipeline (the engine every content-generating feature below shares)

Phase 1 already proved this 7-stage shape works (`Extractor → Preprocessor → Analyzer → Optimizer → Synthesizer → Validator → Assembler`, `backend/app/pipeline/*.py`). Phase 4 does not reinvent multi-agent orchestration — it defines a **second pipeline template** using the identical `Stage` contract, purpose-built for generating content (not just analyzing metrics):

| Stage | Responsibility | Reuses from Phase 1 |
|---|---|---|
| Extractor | Pull the raw material for the task — repo README/LICENSE/topics, commit/PR history since last release, a candidate HN/Reddit/Discussions thread, etc. | `GitHubClient` |
| Analyzer | Filter out low-quality or duplicate source material before it burns LLM budget | New — content-specific quality/duplicate heuristics |
| Preprocessor | Clean and normalize text (strip markdown noise, truncate to relevant sections) | Pattern from `preprocessor.py` |
| Optimizer | Trim/reorder the assembled context to fit the target LLM's token budget | Pattern from `optimizer.py` |
| Synthesizer | Generate **N candidate outputs in parallel** — via `LLMRouter`'s multiple providers and/or prompt variants — instead of one shot | Extends `LLMRouter`; new N-way fan-out |
| Validator | Score and fact-check every candidate the same way the existing hallucination-guard cross-checks cited numbers today; reject or down-rank any candidate that invents facts | `validator.py`'s existing cross-check logic, extended to multi-candidate judging |
| Assembler | Package the winning (or best-merged) candidate as a `Draft` row, not a final answer — nothing this pipeline produces is shown externally until a human approves it | Pattern from `assembler.py`; new `Draft` target instead of `Recommendation` |

This is the "parallel agents racing, judge picks the winner" pattern you described — implemented as best-of-N sampling at the Synthesizer stage plus an LLM-as-judge Validator, not a new framework. It directly powers README/SEO-doc suggestions, release notes, topic/tag recommendations, and issue/discussion reply drafts (sub-projects 4B/4C/4D/4F below) — one pipeline template, several `PipelineContext` inputs.

### New shared data model: the Draft Queue

One new table backs every draft-and-approve feature, instead of a bespoke table per feature:

```text
Draft
  id: int
  user_id: int (FK → users.id, CASCADE)
  repo_id: int | null (FK → repos.id, CASCADE — null for account-level drafts e.g. a community-monitoring digest)
  kind: str   # "readme_suggestion" | "topic_suggestion" | "release_notes" | "social_post" | "issue_reply" | "demo_asset"
  target: str  # e.g. "linkedin" | "x" | "reddit" | "devto" | "github_issue:123" | "readme"
  content: JSON  # the generated payload (text, diff, or asset URL)
  status: str  # "pending" | "approved" | "rejected" | "posted" | "failed"
  created_at: datetime
  reviewed_at: datetime | null
```

The dashboard gets one new "Drafts" inbox reusing the exact card/dismiss interaction already built for Recommendations — approve triggers the actual external action (GitHub PR, social API call, email), reject just marks it dead, no retry.

### Sub-projects, in recommended build order

| # | Sub-project | What it ships | Depends on |
|---|---|---|---|
| 4A | **Automation engine core** — ✅ Done (2026-07-22) | `Draft` table + API (`/drafts`, approve/reject) + real-time SSE + dashboard inbox, mirroring the `Recommendation` pattern byte-for-byte. The generalized `PipelineRunner`-template invocation and per-feature APScheduler jobs originally sketched here were deliberately deferred to 4B (YAGNI — no second pipeline exists yet to generalize against; see the design spec's "Scope" section). REQ-0020, `docs/superpowers/specs/2026-07-22-phase4a-automation-engine-core-design.md`, `docs/superpowers/plans/2026-07-22-phase4a-automation-engine-core.md`. | Existing `PipelineRunner`, `Recommendation` UI pattern |
| 4B | **Content generation pipeline** — ✅ Done (2026-07-23) | README improvement suggestions, missing-documentation detection, topic/tag recommendations, SEO-friendly doc generation — all land as `Draft` rows via the Agentic Content Pipeline above. Best-of-3 candidate generation per task (forced onto different LLM providers), LLM-as-judge Validator, both manual (`POST /runs/content`) and staggered-daily-scheduled triggers. REQ-0021, `docs/superpowers/specs/2026-07-23-phase4b-content-generation-pipeline-design.md`, `docs/superpowers/plans/2026-07-23-phase4b-content-generation-pipeline.md`. | 4A |
| 4E | **Notifications & alerting** — ✅ Done (2026-07-24) | Resend sends an alert on scheduled (not manual) pipeline-run degradation, `needs_reauth` circuit-breaker trips (rate-limited to once per 24h per user), and new Drafts ready for review. Recipient resolves to `User.notification_email` (new Settings-page fallback field) or `User.email` (nullable — OAuth scope is `read:user public_repo`, not `user:email`), silent no-op if neither exists. REQ-0022, `docs/superpowers/specs/2026-07-23-phase4e-notifications-alerting-design.md`, `docs/superpowers/plans/2026-07-23-phase4e-notifications-alerting.md`. | 4A |
| 4C | **Release automation** — ✅ Release-notes scope done (2026-07-24), cross-posting deferred | On a new GitHub release/tag (scheduled poll folded into the existing daily content pipeline — no webhook, since this project has no deployed public URL yet), auto-generate release notes as a Draft, skipping releases with no real notes to work from (anti-fabrication). Cross-posting Drafts to LinkedIn/X/Reddit/Dev.to remains deferred pending external platform app registrations; 4G shipped on-demand-only, with no auto-trigger hook into this flow. REQ-0023, `docs/superpowers/specs/2026-07-24-phase4c-release-notes-design.md`, `docs/superpowers/plans/2026-07-24-phase4c-release-notes.md`. | 4A, 4B |
| 4D | **Community & trend monitoring** — ✅ HN + GitHub Discussions scope done (2026-07-24), Reddit deferred | Scheduled jobs (or manual trigger) poll HN (Algolia HN Search API, public, no auth) and GitHub Discussions (new GraphQL search capability) by repo name for mentions of tracked repos; surfaced as a dismissable "Opportunities" inbox (mirrors `Recommendation`, not `Draft` — informational only, nothing to approve). Reddit monitoring remains deferred pending a registered Reddit API app. REQ-0024, `docs/superpowers/specs/2026-07-24-phase4d-community-monitoring-design.md`, `docs/superpowers/plans/2026-07-24-phase4d-community-monitoring.md`. | 4A |
| 4F | **Issue/discussion auto-response** — ✅ Done (2026-07-24) | Drafts a suggested reply (via the Agentic Content Pipeline) to new issues/discussions on tracked repos; always draft-and-approve before posting via the GitHub API. Confirmed via investigation to have no real data dependency on 4D (different GitHub surface — activity on owned repos vs. external mentions elsewhere); the first sub-project where an approved Draft triggers a real external action and the first write capability `GitHubClient` has ever had. REQ-0025, `docs/superpowers/specs/2026-07-24-phase4f-issue-discussion-auto-response-design.md`, `docs/superpowers/plans/2026-07-24-phase4f-issue-discussion-auto-response.md`. | 4A, 4B |
| 4G | **Demo asset generation** — ✅ Done (2026-07-24), the final sub-project | Playwright drives the live dashboard, `ffmpeg` composites the recording to mp4, on-demand only (no auto-trigger on release — confirmed via investigation that 4C never built that hook); stored on VPS local disk with a 3-day-retention daily cleanup job (cloud storage explicitly deferred pending a provider decision); deliberately Draft-free, mirroring 4D's standalone-table pattern rather than 4C/4F's approval pattern. Required designing and building a purpose-built recorder-authentication mechanism (the headless recorder has no browser session) under two independent adversarial security reviews before the feature actually worked end-to-end. REQ-0026, `docs/superpowers/specs/2026-07-24-phase4g-demo-asset-generation-design.md`, `docs/superpowers/plans/2026-07-24-phase4g-demo-asset-generation.md`. | 4A |

Each row's "depends on" column is the build order — 4A is the prerequisite for everything else, 4B/4E can build in either order once 4A lands, and 4C/4D/4F each need at least one earlier sub-project's output. 4G ended up needing only 4A in practice, since its originally-assumed 4C dependency (auto-trigger on release) was investigated and confirmed unbuilt, and the Product Owner chose to keep 4G on-demand-only.

### New external dependencies (documented in `.env.example` when each sub-project actually lands, not upfront)

| Sub-project | Service | Auth model | Notes |
|---|---|---|---|
| 4E | Resend | API key | Single provider is enough for transactional email — this isn't the free-tier-exhaustion problem `LLMRouter` solves for LLM calls |
| 4C | LinkedIn, X, Reddit, Dev.to | Each needs its own developer app registration (OAuth for LinkedIn/X/Reddit; a simple API key for Dev.to) | Same one-app-per-environment friction as the GitHub OAuth App set up in Phase 2 — each platform's app is a separate Change Request when built |
| 4D | HN (Algolia), GitHub Discussions | None (HN) / existing GitHub OAuth token (Discussions) | No new credentials needed |
| 4D | Reddit | OAuth app (client id/secret) | Needed even for read-only search past small rate limits |
| 4F | GitHub Issues/Discussions write | Existing per-user GitHub OAuth token | Requires re-checking whether `public_repo` scope covers issue/discussion comments on repos the user doesn't own — likely needs the broader `public_repo` write already granted, but confirm against a real repo before this sub-project's own spec is finalized |

## Explicit Non-Goal (permanent, not a phase)

No auto-starring, auto-forking, auto-following, or any other artificial engagement inflation, ever. This was explicitly refused at project kickoff (see `.agile-v/DECISION_LOG.md` DEC-0001) and is enforced as a standing code-review policy (`.agile-v/POLICY.yaml` POL-0001).

## Timeline

| Date | Milestone |
|---|---|
| 2026-07-20 | Project kickoff, design brainstorm, backend spec + plan approved |
| 2026-07-20 | Backend built (11 tasks), reviewed, 30/30 tests passing |
| 2026-07-20 | Agile-V governance adopted, C1 retroactively traceable |
| 2026-07-20 | Gate 2 approved for backend sub-scope (GATE-0001) |
| 2026-07-21 | Frontend built (20 tasks), reviewed, one backend cascade-delete bug found + fixed, one dependency-CVE gap found + fixed |
| 2026-07-21 | Gate 2 approved for frontend sub-scope (GATE-0002) |
| 2026-07-21/22 | Multi-tenant SaaS foundation designed and built (18 tasks: 11 backend, 7 frontend), whole-backend review + final whole-branch review, both clean after fix rounds |
| 2026-07-22 | Live E2E OAuth verification completed against a real registered GitHub OAuth App; Gate 2 approved for the multi-tenant sub-scope (GATE-0003) |
| 2026-07-22 | Phase 4 (Professional Automation & Growth Platform) architecture documented; four governing decisions made (native automation engine, draft-and-approve publishing, real screen-recording demos, Ollama as dev-time-only) |
| 2026-07-22 | Pre-Phase-4 codebase audit: fixed a Next.js build-warning (redundant Cache-Control header), migrated `on_event` to `lifespan` (RISK-0003 resolved), fixed a flaky network-coupled backend test, added `force-dynamic` to `/sign-in` for consistency |
| 2026-07-22 | Phase 4A (Automation engine core) designed, planned, and built (3 tasks), final whole-branch review clean — REQ-0020 |
| 2026-07-23 | Phase 4B (Content generation pipeline) designed, planned (14 tasks), and built; final whole-branch review (opus) found and fixed one real Important production bug (Validator's number-check over-rejecting real content) plus 3 Minor items, re-reviewed clean — REQ-0021 |
| 2026-07-23 | Whole-codebase audit (not phase-scoped): 8 dead imports removed (backend), 4 real cache-invalidation gaps fixed + 5 unused template SVGs removed (frontend), independently re-reviewed clean |
| 2026-07-24 | Phase 4E (Notifications & alerting) designed, planned (8 tasks), and built; 1 task-scoped fix round (cross-repo double-notification gap); final whole-branch review (opus) ready to merge, 0 Critical/Important — REQ-0022 |
| 2026-07-24 | Phase 4C (Release notes generation, scoped down from the full "release automation" row) designed, planned (8 tasks), and built entirely inside the existing content pipeline; 0 task-scoped fix rounds, 1 out-of-scope regression independently found and fixed (unstubbed mock in a Phase 4E test file); final whole-branch review (opus) ready to merge, 0 Critical/Important — REQ-0023 |
| 2026-07-24 | Phase 4D (Community & trend monitoring, scoped to HN + GitHub Discussions) designed, planned (9 tasks), and built as a new Draft-free dismissable Opportunities inbox; 1 task-scoped fix round (GraphQL null-safety gap); final whole-branch review (opus) found and fixed 1 Important cross-task gap (Runs page didn't recognize the new pipeline_kind) plus 1 Minor, re-reviewed clean — REQ-0024 |
| 2026-07-24 | Phase 4F (Issue/discussion auto-response) designed, planned (10 tasks), and built — the project's first Draft-triggered external action and first GitHubClient write capability; 0 fix rounds needed on any task, extra reviewer scrutiny on the write methods and on-approve dispatch; final whole-branch review (opus) independently re-verified write-method isolation and Draft field-shape parity, ready to merge, 0 Critical/Important — REQ-0025 |
| 2026-07-24 | Phase 4G (Demo asset generation, the final Phase 4 sub-project) designed, planned (9 tasks), and built — Playwright + ffmpeg, on-demand only, Draft-free, VPS-disk storage with a 3-day cleanup job; 1 task-scoped fix round (frontend cache-key/SSE bug); final whole-branch review surfaced an unscoped gap (recorder had no browser session) requiring a purpose-built AsyncLocalStorage-based identity-propagation mechanism, built and hardened across 3 further fix rounds under two independent adversarial security reviews (including empirical concurrency testing); ready to merge, 0 Critical/Important — REQ-0026. **Closes the entire authorized Phase 4 build sequence.** |
| 2026-07-25 | Whole-codebase audit (not phase-scoped), post-Phase-4: 4 independent read-only audits (SSR/prefetch boundary compliance, TanStack Query cache-invalidation + SSE completeness, dead-code/duplication, backend gaps vs. CLAUDE.md's hard constraints) found and fixed — a real correctness gap (CAPA-0001's DB-session-rollback discipline hadn't propagated from `PipelineRunner` to the 3 job-orchestrator loops sharing its session), 2 cache-invalidation gaps (repo deletion not invalidating that repo's opportunities; the demo-asset cleanup job never publishing an SSE event, so expired assets lingered in the UI), a dead/never-populated query key now wired into a parallelized SSR prefetch, a duplicated per-user-scoped-404 pattern collapsed into one `get_owned_or_404` helper across 7 endpoint files, 6 missing title/button/label icons, confirmed-dead code removed (`api.upsertUser`/`backendFetchSystem`), and a duplicated delete-repo button extracted into a shared component. Independently re-reviewed by a fresh subagent (Red Team Protocol); backend 217/217 tests, frontend `eslint`/`tsc`/69 vitest tests/production build all clean. |
| 2026-07-25 | Local dev environment brought fully current ahead of deploy: `RECORDING_AUTH_SECRET` generated and set identically in `backend/.env`/`frontend/.env.local`; `ffmpeg` and the Python `playwright` package's chromium build installed and verified launching; local dev Postgres found 2 migrations drifted from its own `alembic_version` stamp (schema had columns from migrations the version table didn't record — reconciled via `alembic stamp` then brought to head, 5 migrations applied clean) |
| 2026-07-25 | Phase 3 (Visual & Portfolio Polish) designed (`docs/superpowers/specs/2026-07-25-phase3-visual-portfolio-polish-design.md`), planned (13 tasks, `docs/superpowers/plans/2026-07-25-phase3-visual-portfolio-polish.md`), and built via subagent-driven-development: self-hosted Geist fonts, glassmorphism design system + new Select primitive, TanStack Table adoption (search/filter/sort) across all 4 tables, Sonner toast overhaul + welcome/goodbye toasts, live per-stage pipeline visualization (new backend `stage_completed` SSE event), staggered entrance animations, dynamic semantic coloring. 2 task-scoped fix rounds (a `STAGE_ORDER` stage-name-prefix bug in Task 11; missing threshold-behavior test coverage in Task 13). Final whole-branch review (opus) found 6 Important/~10 Minor issues, fixed in one consolidated pass — then re-review of that pass caught a Critical pre-existing bug an earlier task had shipped undetected through every review: an unterminated CSS comment silently disabling the entire glassmorphism system in every build since Task 2 (invisible to eslint/tsc/vitest/build, none of which parse compiled CSS). First fix attempt reintroduced the identical bug in its own explanatory text; second fix verified correct 3 independent ways plus a new permanent compile-time regression test. Ready to merge (opus: "Yes"). Backend 219/219 tests, frontend eslint/tsc/88 vitest tests/production build all clean. **Closes every currently-buildable phase in this plan (1, 2, 3, 4A–4G).** |
| TBD | VPS + Vercel deployment — `RECORDING_AUTH_SECRET` value, `ffmpeg`, and Playwright chromium (`--with-deps` for the Linux container) still need installing on the actual deploy target, and `alembic upgrade head` still needs running against production Postgres — none of this is reachable from a local dev machine |
| TBD | 4C/4D's deferred cross-posting/Reddit scope + 4G's deferred cloud-storage scope, once the relevant developer apps/provider accounts are registered |
