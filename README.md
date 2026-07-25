# AI-Powered GitHub Growth Command Center — Next.js, TypeScript, FastAPI, PostgreSQL, Tailwind CSS, Multi-LLM Full-Stack Project (Insights, Benchmarks, Recommendations, Draft-and-Approve Automation, Opportunities Inbox, SSE Live Sync)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.12-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.140-009688)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-316192)](https://www.postgresql.org/)
[![Launch with Diploi](https://diploi.com/launch.svg)](https://diploi.com/launch/arnobt78/github-growth-bot)

A personal / multi-tenant **GitHub growth command center**: track stars, forks, watchers, and traffic over time, benchmark against similar public repos, surface LLM-checked recommendations, generate human-approved drafts (content, release notes, issue replies), monitor community opportunities (HN + Discussions), send optional alert emails, and record dashboard demo videos — with a hard rule against ever artificially inflating any GitHub metric.

This repository is **actively developed**. Phases 1–2 and the full Phase 4 build sequence (4A–4G) are Gate-2 accepted; **production Coolify/Vercel deployment is still open**. See [`.agile-v/STATE.md`](.agile-v/STATE.md) for live status.

---

## Table of contents

1. [Features](#features)
2. [Non-goals](#non-goals)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Project structure](#project-structure)
6. [How it works](#how-it-works)
7. [Frontend routes and UI](#frontend-routes-and-ui)
8. [API reference](#api-reference)
9. [Environment variables](#environment-variables)
10. [Local development](#local-development)
11. [Tests](#tests)
12. [Reusing patterns in other projects](#reusing-patterns-in-other-projects)
13. [Keywords glossary](#keywords-glossary)
14. [Further documentation](#further-documentation)
15. [Contributing / status](#contributing--status)
16. [Security](#security)
17. [License](#license)

---

## Features

| Area                              | What you get                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| **Repo tracking**                 | Add/remove repos scoped to your signed-in GitHub user.                  |
| **Snapshots & insights**          | Historical stars/forks/watchers and derived insight summaries.          |
| **Benchmarks**                    | Compare your repo against similar public repos.                         |
| **Traffic**                       | Referrers and popular paths (when the OAuth token has access).          |
| **Recommendations**               | LLM-written, validator-checked growth suggestions; dismiss from the UI. |
| **Analytics runs**                | On-demand + daily scheduled 7-stage pipeline per repo.                  |
| **Content drafts (4B)**           | Generate draft posts/topics for human approve/reject.                   |
| **Release-notes drafts (4C)**     | Folded into the content pipeline when a new tag appears.                |
| **Opportunities inbox (4D)**      | HN + GitHub Discussions matches — dismissable, **not** draft-gated.     |
| **Notifications (4E)**            | Optional Resend emails for degraded runs / reauth needs.                |
| **Issue/discussion replies (4F)** | Approved drafts can post a real GitHub comment (first external write).  |
| **Demo assets (4G)**              | Headless Playwright + ffmpeg walkthrough videos of a repo dashboard.    |
| **Live UI**                       | SSE invalidates TanStack Query so open tabs update without refresh.     |
| **Multi-provider LLM**            | Groq → Gemini → OpenRouter → HF → Cloudflare → Vercel AI Gateway.       |
| **Auth**                          | Auth.js GitHub OAuth; browser never holds the backend service API key.  |

---

## Non-goals

This project will **never**:

- Auto-star, auto-fork, or auto-follow
- Otherwise programmatically inflate GitHub metrics

Suggestions stay organic (docs, discoverability, community). External actions that _do_ touch GitHub (e.g. posting a comment) only happen after **explicit human draft approval**.

---

## Architecture

```text
GitHub API  (+ HN for opportunities)
    │
    ▼
Pipeline stages (analytics | content | opportunities) — each stage isolated
                                                              │
                                              LLMRouter (multi-provider fallback)
                                                              │
                                                         Postgres
                                                              │
                         FastAPI (REST + SSE + optional Resend + demo video files)
                                                              │
                         Next.js Route Handlers (BFF)  ←── API_KEY + internal user token
                                                              │
                                                    Browser (no backend API key)
```

**Analytics pipeline:** `extractor` → `preprocessor` → `analyzer` → `optimizer` → `synthesizer` → `validator` → `assembler`

**Content pipeline:** parallel seven-stage path that writes `Draft` rows (`pipeline_kind="content"`) for approve/reject. Release-notes and issue-reply draft kinds reuse this path.

**Opportunities pipeline:** separate `pipeline_kind`; writes dismissable `Opportunity` rows (no approval gate).

**Demo assets:** background job records the frontend with a short-lived **recording token** (headless browser has no user session), composites mp4 with ffmpeg, serves via authenticated API.

```mermaid
flowchart LR
  Browser --> NextBFF[Next_Route_Handlers]
  NextBFF --> FastAPI
  FastAPI --> Postgres
  FastAPI --> GitHubAPI[GitHub_API]
  FastAPI --> LLMRouter
  FastAPI -->|SSE| NextBFF
  FastAPI -->|optional| Resend
```

---

## Tech stack

### Backend

| Piece                     | Role (beginner view)                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| **Python 3.12 + FastAPI** | HTTP API; interactive OpenAPI at `/docs`.                                     |
| **SQLAlchemy + Alembic**  | ORM + database migrations (`alembic upgrade head`).                           |
| **PostgreSQL**            | Source of truth for users, repos, runs, drafts, opportunities, demo assets, … |
| **httpx**                 | Calls GitHub, HN, and LLM providers.                                          |
| **APScheduler**           | Daily analytics / content / opportunities jobs (and demo retention cleanup).  |
| **sse-starlette**         | Server-Sent Events to the frontend.                                           |
| **cryptography (Fernet)** | Encrypts GitHub OAuth tokens at rest.                                         |
| **slowapi**               | Rate limits sensitive POSTs.                                                  |
| **Playwright + ffmpeg**   | Phase 4G headless recording + video encode (system packages on deploy host).  |

### Frontend

| Piece                                 | Role (beginner view)                                      |
| ------------------------------------- | --------------------------------------------------------- |
| **Next.js 16 App Router**             | RSC pages + Route Handlers (BFF).                         |
| **React 19 + TypeScript**             | UI + static typing.                                       |
| **Auth.js (next-auth v5)**            | GitHub OAuth + session cookies.                           |
| **TanStack Query**                    | Client cache; mutations + SSE-driven invalidation.        |
| **TanStack Table**                    | Rich tables where used.                                   |
| **Tailwind CSS 4 + shadcn / Base UI** | Styling and accessible primitives.                        |
| **lucide-react + Geist**              | Icons and typography.                                     |
| **Recharts**                          | Trend charts / sparklines.                                |
| **Sonner**                            | Toasts.                                                   |
| **openapi-typescript**                | Generates `frontend/types/api.d.ts` from backend OpenAPI. |

### Deployment targets (planned, not assumed live)

- Backend → Coolify on a VPS + managed Postgres
- Frontend → Vercel

---

## Project structure

```text
github-bot/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry, health, scheduler lifespan
│   │   ├── api/                    # repos, insights, runs, drafts, opportunities, …
│   │   ├── pipeline/               # analytics + content + opportunities stages
│   │   ├── models.py               # SQLAlchemy tables
│   │   ├── llm_router.py           # Multi-provider LLM fallback
│   │   ├── demo_asset_jobs.py      # 4G recording pipeline
│   │   ├── recording_auth.py       # Mint/verify recording tokens
│   │   └── deps.py                 # API key + per-user scoping
│   ├── alembic/                    # Migrations
│   ├── tests/                      # pytest (200+ tests)
│   ├── .env.example
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                        # Pages + Route Handlers
│   ├── components/                 # Feature UI + components/ui
│   ├── hooks/                      # TanStack Query + SSE
│   ├── providers/                  # Query, theme, live events
│   ├── lib/                        # API client, query keys, auth helpers
│   ├── types/                      # OpenAPI-generated types
│   ├── auth.ts / proxy.ts          # Auth.js + gate (incl. recording token)
│   ├── .env.local.example
│   └── package.json
├── docs/                           # Plans, walkthrough, engineering playbook
├── .agile-v/                       # Requirements, gates, decisions
├── CLAUDE.md
├── SECURITY.md
├── LICENSE
└── README.md
```

---

## How it works

### 1. Sign-in

1. User opens `/sign-in` and authenticates with GitHub (OAuth App).
2. Auth.js keeps a session cookie on the frontend.
3. First login provisions the user via `POST /users/upsert` (API key only).
4. Later calls include an **HMAC-signed internal user token** so the backend scopes every query by `user_id`.

### 2. Track repos and run analytics

1. Add a repo in Settings / Overview.
2. `POST /runs` (or the daily scheduler) starts the analytics pipeline.
3. Stages run in isolation; results land in Postgres.
4. SSE `run_completed` (and related events) invalidate React Query keys in open tabs.

### 3. Drafts — approve before acting

Content, release notes, and issue/discussion replies become **Draft** rows. Humans `PATCH` to `approved` or `rejected`. Only then may the backend perform an external write (e.g. `create_issue_comment`).

### 4. Opportunities (no approval gate)

HN + Discussions matches appear in `/opportunities`. Dismiss like a recommendation — nothing is posted for you automatically.

### 5. Notifications (optional)

If `RESEND_API_KEY` + `EMAIL_FROM` are set, alert emails can fire for degraded runs / reauth. Unset → silent no-op (no crash).

### 6. Demo videos

`POST /repos/{id}/demo-assets` starts a background recording. The backend mints a short-lived **recording token** so headless Chromium can open the repo page without a real login. Requires matching `RECORDING_AUTH_SECRET`, `FRONTEND_BASE_URL`, Playwright Chromium, and ffmpeg on the machine that runs the backend.

### 7. Instant UI updates

```text
Mutation or pipeline event
  → backend publishes SSE
  → useLiveEvents invalidates query keys
  → lists / detail / badges refetch
  → no full page reload
```

Engineering standards: [`docs/PROJECT_IDEA.md`](docs/PROJECT_IDEA.md).

### Pipeline stage sketch

```python
class Stage:
    name: str
    def run(self, ctx: PipelineContext) -> PipelineContext:
        ...
```

---

## Frontend routes and UI

| Route              | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `/`                | Overview: tracked repos, deltas, sparklines                       |
| `/repos/[id]`      | Detail: trends, benchmarks, traffic, recommendations, demo assets |
| `/recommendations` | Growth-suggestion inbox                                           |
| `/opportunities`   | HN / Discussions opportunity inbox                                |
| `/drafts`          | Draft-and-approve inbox (content, release notes, replies, …)      |
| `/runs`            | Pipeline history + trigger analytics / content / opportunities    |
| `/settings`        | Repos, notification prefs, LLM provider status                    |
| `/sign-in`         | GitHub OAuth                                                      |

**Reuse inside this app**

- Thin Server Component `page.tsx` files prefetch + `HydrationBoundary`.
- `"use client"` only for interaction (forms, charts, live tables).
- Data: `hooks/use-*.ts` + `lib/query-keys.ts` + `lib/api.ts`.
- Primitives: `components/ui/`.
- Live sync: `providers/live-events-provider.tsx` → `hooks/use-live-events.ts`.

**Adding a new list feature**

1. Backend endpoint + Pydantic `response_model`
2. OpenAPI types (`npm run generate:types`)
3. Extend `queryKeys` + `lib/api` + Route Handler
4. Prefetch with `await Promise.all` when independent
5. Skeleton **data slots only**; keep titles visible
6. Invalidate related keys on mutation; map new SSE events

---

## API reference

Base URL (local): `http://localhost:8000`

**Auth**

- Almost every route: `Authorization: Bearer <API_KEY>`
- User-scoped routes also need the internal user token (minted by the Next.js BFF)
- `GET /api/health` — no API key
- `POST /users/upsert` — API key only (sign-in provisioning)

**Naming:** use `insights` / `snapshots` / `benchmarks` / `runs` — **not** `analytics` / `metrics` (ad-blocker filters).

| Method   | Path                        | Notes                               |
| -------- | --------------------------- | ----------------------------------- |
| `GET`    | `/api/health`               | Liveness                            |
| `GET`    | `/repos`                    | List tracked repos                  |
| `POST`   | `/repos`                    | Add repo (rate limited)             |
| `GET`    | `/repos/{id}`               | Detail                              |
| `DELETE` | `/repos/{id}`               | Remove                              |
| `GET`    | `/repos/{id}/snapshots`     | Time series                         |
| `GET`    | `/repos/{id}/insights`      | Derived insights                    |
| `GET`    | `/repos/{id}/benchmarks`    | Peer comparison                     |
| `GET`    | `/repos/{id}/referrers`     | Traffic referrers                   |
| `GET`    | `/repos/{id}/popular-paths` | Popular paths                       |
| `GET`    | `/repos/{id}/demo-assets`   | List demo videos                    |
| `POST`   | `/repos/{id}/demo-assets`   | Trigger recording (202)             |
| `GET`    | `/demo-assets/{id}/video`   | Stream mp4 (auth’d)                 |
| `GET`    | `/recommendations`          | List                                |
| `PATCH`  | `/recommendations/{id}`     | Update / dismiss                    |
| `GET`    | `/opportunities`            | List                                |
| `PATCH`  | `/opportunities/{id}`       | Dismiss / update                    |
| `GET`    | `/drafts`                   | List drafts                         |
| `PATCH`  | `/drafts/{id}`              | `approved` \| `rejected`            |
| `GET`    | `/runs`                     | List runs                           |
| `POST`   | `/runs`                     | Start analytics (202)               |
| `POST`   | `/runs/content`             | Start content (202)                 |
| `POST`   | `/runs/opportunities`       | Start opportunities (202)           |
| `GET`    | `/runs/{id}/stages`         | Per-stage status                    |
| `GET`    | `/providers/status`         | LLM provider readiness              |
| `POST`   | `/users/upsert`             | Provision user                      |
| `GET`    | `/users/me`                 | Current user (+ notification prefs) |
| `PATCH`  | `/users/me`                 | Update prefs                        |
| `GET`    | `/events`                   | SSE stream                          |

Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs)

```bash
curl -s http://localhost:8000/api/health
```

---

## Environment variables

You **do need** env files for a full local product run (Postgres, API key, OAuth, Fernet, HMAC).  
**LLM keys are optional** — metrics still work; AI features degrade gracefully.  
**Resend / email vars are optional** — alerts simply never send.  
**Demo recording** needs `RECORDING_AUTH_SECRET` + `FRONTEND_BASE_URL` (+ ffmpeg/Playwright on the host).

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Never commit real `.env` / `.env.local` files.

### Backend — `backend/.env`

| Variable                                                                                                                    | Required?                                | How to get / set                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                              | **Yes**                                  | e.g. `postgresql+psycopg://user:password@localhost:5432/github_growth_bot`. Create DB: `createdb github_growth_bot`. |
| `API_KEY`                                                                                                                   | **Yes**                                  | `openssl rand -base64 32`. **Must match** frontend `BACKEND_API_KEY`.                                                |
| `TOKEN_ENCRYPTION_KEY`                                                                                                      | **Yes**                                  | Fernet key: `.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`    |
| `INTERNAL_AUTH_SECRET`                                                                                                      | **Yes**                                  | `openssl rand -base64 32`. **Must match** frontend.                                                                  |
| `CORS_ORIGINS`                                                                                                              | **Yes** for browser                      | JSON array, e.g. `["http://localhost:3000"]`.                                                                        |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `HUGGINGFACE_API_KEY` / `CLOUDFLARE_*` / `VERCEL_AI_GATEWAY_KEY` | Optional                                 | Provider consoles — see comments in `.env.example`.                                                                  |
| `RESEND_API_KEY`                                                                                                            | Optional                                 | [Resend API keys](https://resend.com/api-keys)                                                                       |
| `EMAIL_FROM`                                                                                                                | Optional                                 | Verified sender, e.g. `GitHub Growth <alerts@yourdomain.com>`                                                        |
| `FRONTEND_BASE_URL`                                                                                                         | Needed for emails + demo recording links | e.g. `http://localhost:3000` (no trailing slash)                                                                     |
| `DEMO_ASSETS_DIR`                                                                                                           | Optional                                 | Default `demo_assets`                                                                                                |
| `DEMO_ASSET_RETENTION_DAYS`                                                                                                 | Optional                                 | Default `3`                                                                                                          |
| `RECORDING_AUTH_SECRET`                                                                                                     | **Yes for 4G demos**                     | `openssl rand -base64 32`. **Must match** frontend.                                                                  |

System installs for demo recording (deploy/dev host, not env vars):

```bash
# Debian/Ubuntu example
sudo apt-get install -y ffmpeg
cd backend && .venv/bin/playwright install chromium --with-deps
```

### Frontend — `frontend/.env.local`

| Variable                | Required?           | How to get / set                                                        |
| ----------------------- | ------------------- | ----------------------------------------------------------------------- |
| `BACKEND_URL`           | **Yes**             | `http://localhost:8000`                                                 |
| `BACKEND_API_KEY`       | **Yes**             | Same as backend `API_KEY`                                               |
| `AUTH_SECRET`           | **Yes**             | Auth.js cookie secret: `openssl rand -base64 32` (frontend-only)        |
| `AUTH_GITHUB_ID`        | **Yes** for sign-in | [GitHub OAuth Apps](https://github.com/settings/developers) → Client ID |
| `AUTH_GITHUB_SECRET`    | **Yes** for sign-in | Generate client secret once — copy immediately                          |
| `INTERNAL_AUTH_SECRET`  | **Yes**             | Same as backend                                                         |
| `RECORDING_AUTH_SECRET` | **Yes for 4G**      | Same as backend                                                         |

**GitHub OAuth App (local)**

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`

One callback URL per OAuth App — use a **separate** app for production.

Shared secret checklist:

```text
backend API_KEY                 ==  frontend BACKEND_API_KEY
backend INTERNAL_AUTH_SECRET    ==  frontend INTERNAL_AUTH_SECRET
backend RECORDING_AUTH_SECRET   ==  frontend RECORDING_AUTH_SECRET
```

A mismatch usually appears as silent **401**s or (for recording) videos of the sign-in page.

---

## Local development

### Prerequisites

- Python 3.12+
- Node.js 20+ (recommended)
- PostgreSQL
- GitHub OAuth App credentials
- (Optional) ffmpeg + Playwright Chromium for demo assets
- (Optional) Resend account for email alerts
- (Optional) at least one LLM provider key for AI drafts/recommendations

### Terminal 1 — backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill required vars
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Check: [http://localhost:8000/api/health](http://localhost:8000/api/health) · [http://localhost:8000/docs](http://localhost:8000/docs)

### Terminal 2 — frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill required vars
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

### Suggested smoke path

1. Health OK
2. Sign in with GitHub
3. Add a repo
4. Trigger analytics on `/runs`
5. Optionally trigger content / opportunities runs
6. Review `/recommendations`, `/drafts`, `/opportunities`
7. Confirm SSE updates without refresh

Regenerate types after API changes:

```bash
cd frontend && npm run generate:types   # backend must be on :8000
```

---

## Tests

```bash
# Backend
cd backend
.venv/bin/python -m pytest -v

# Frontend
cd frontend
npm test
npm run lint
npx tsc --noEmit
```

Recent Gate-2 baselines (see STATE.md): backend **219+** tests, frontend vitest **88+**, with `pip-audit` clean for runtime deps.

---

## Reusing patterns in other projects

| Pattern                               | Where to look                                 | Why reuse it                                       |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| BFF proxy (no service key in browser) | `frontend/app/api/*`, `lib/backend-client.ts` | Safer private API access                           |
| Stable query keys                     | `frontend/lib/query-keys.ts`                  | One place to invalidate after CRUD                 |
| SSE → cache invalidation              | `hooks/use-live-events.ts`                    | Multi-tab freshness                                |
| Shell-first SSR pages                 | `frontend/app/**/page.tsx`                    | Instant chrome + data skeletons                    |
| Isolated pipeline stages              | `backend/app/pipeline/`                       | Failure isolation                                  |
| LLM provider fallback                 | `backend/app/llm_router.py`                   | Survive outages / rate limits                      |
| Draft-and-approve                     | `backend/app/api/drafts.py`                   | Human gate before external side effects            |
| Recording auth for headless UI        | `recording_auth.py`, `auth.ts` / `proxy.ts`   | Capture authenticated pages without a real session |

Portable engineering rules (Next **and** Vite SPA): [`docs/PROJECT_IDEA.md`](docs/PROJECT_IDEA.md).

```ts
await queryClient.invalidateQueries({ queryKey: queryKeys.repos.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.drafts.all });
// SSE may invalidate the same keys in other open tabs
```

---

## Keywords glossary

| Term                      | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| **BFF**                   | Backend-for-frontend — Next Route Handlers calling FastAPI server-side.        |
| **SSR / RSC**             | Server-rendered HTML / React Server Components.                                |
| **Hydration**             | Attaching client React to SSR HTML; TanStack `dehydrate` seeds the cache.      |
| **SSE**                   | Server-Sent Events — one-way live stream.                                      |
| **OpenAPI**               | API contract used to generate TypeScript types.                                |
| **Alembic**               | DB migrations for SQLAlchemy.                                                  |
| **Fernet**                | Symmetric encryption for tokens at rest.                                       |
| **Draft-and-approve**     | Write a proposal first; human approves before external action.                 |
| **Opportunity**           | Dismissable community match (HN/Discussions) — not a Draft.                    |
| **LLMRouter**             | Tries AI providers in order until one succeeds.                                |
| **Recording token**       | Short-lived, repo-scoped proof so headless Chromium can view a dashboard page. |
| **Ad-blocker-safe paths** | Avoid URL segments blockers filter (`analytics`, `metrics`, …).                |

---

## Further documentation

| Doc                                                          | Contents                                  |
| ------------------------------------------------------------ | ----------------------------------------- |
| [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)               | Phased roadmap                            |
| [`docs/PROJECT_WALKTHROUGH.md`](docs/PROJECT_WALKTHROUGH.md) | End-to-end product walkthrough            |
| [`docs/PROJECT_IDEA.md`](docs/PROJECT_IDEA.md)               | Global engineering playbook for agents    |
| [`CLAUDE.md`](CLAUDE.md)                                     | Conventions for AI coding agents          |
| [`docs/superpowers/specs/`](docs/superpowers/specs/)         | Design specs                              |
| [`docs/superpowers/plans/`](docs/superpowers/plans/)         | Implementation plans                      |
| [`.agile-v/`](.agile-v/)                                     | Requirements, approvals, risks, decisions |
| [`SECURITY.md`](SECURITY.md)                                 | Private vulnerability reporting           |

---

## Contributing / status

- Treat this as a **work-in-progress** learning and production-bound codebase.
- Phase 4 (4A–4G) is Gate-2 accepted; **deploy is not**. Live smoke tests (email, GitHub comment, demo recording) and `alembic upgrade head` on real Postgres are deferred to the Product Owner.
- Read [`.agile-v/STATE.md`](.agile-v/STATE.md) before large changes.
- Keep secrets out of git; follow `CLAUDE.md` hard constraints.

---

## Security

Please **do not** open public GitHub issues for security vulnerabilities.

See [`SECURITY.md`](SECURITY.md) for how to report privately to **<contact@arnobmahmud.com>**.

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). Feel free to use, modify, and distribute the code as per the terms of the license.

---

## Happy Coding! 🎉

This is an **open-source project** — feel free to use, enhance, and extend it further!

If you have any questions or want to share your work, reach out via GitHub or my portfolio at [https://www.arnobmahmud.com](https://www.arnobmahmud.com).
