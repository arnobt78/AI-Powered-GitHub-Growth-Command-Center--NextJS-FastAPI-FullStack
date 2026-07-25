# Phase 3: Visual & Portfolio Polish — Design Spec

`docs/PROJECT_PLAN.md`'s Phase 3, never previously started (sequenced after Phase 2 in the original roadmap; Phase 4 was built first per the Product Owner's own priority call). Kicked off now that Phase 4 (4A–4G) is code-complete and Gate 2-accepted. No dependency on any deferred/account-gated Phase 4 scope (cross-posting, Reddit, cloud storage) — this is purely frontend visual/UX work plus one small backend SSE addition for the live pipeline view.

## Scope

Eight workstreams, all additive to the existing architecture (no rewrite of SSR/TanStack Query/SSE conventions — this phase's whole point is applying a consistent look on top of what's already correct):

1. Self-hosted fonts (Geist Sans + Geist Mono)
2. Glassmorphism design system (CSS variables + shared utility class)
3. Icon/color consistency pass (glass-surface contrast pass)
4. TanStack Table adoption (4 existing tables only)
5. Sonner toast overhaul (dynamic title/subtitle, bottom-right, welcome/goodbye)
6. Live pipeline visualization (upgrade the existing Runs accordion)
7. Staggered entrance animations (list/card mount)
8. Dynamic semantic text coloring (extend the existing delta/status color convention)

## 1. Fonts: Geist Sans + Geist Mono, self-hosted, zero-flash

Real `.woff2` files (OFL-licensed, from Vercel's `geist` npm package's bundled font files) copied into `frontend/public/fonts/geist-sans/` and `frontend/public/fonts/geist-mono/`. Loaded via `next/font/local` (explicitly not `next/font/google`, per requirement) in a new `frontend/lib/fonts.ts`:

```ts
import localFont from "next/font/local";

export const geistSans = localFont({
  src: [
    { path: "../public/fonts/geist-sans/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-mono/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});
```

Applied as `className` on `<html>` in `app/layout.tsx`; `globals.css`'s `@theme inline` block maps `--font-sans`/`--font-mono` to these variables. `next/font/local` inlines the font at build time and injects a preload `<link>` automatically — this (not a hand-written `@font-face` + manual preload) is what actually prevents the flash-of-unstyled-text the requirement calls out, since the browser never has to make a second round-trip to discover which font file it needs.

The exact filenames above are illustrative — the implementation task downloads the real `.woff2` files (from the `geist` npm package's bundled font files, OFL-licensed) and adjusts the `src` paths to match whatever the actual bundled filenames turn out to be; the weight/style structure (400/500/600/700 for Sans, 400/500 for Mono) is the real requirement, not the literal strings above.

Geist Mono applies to numeric/tabular data specifically (star counts, dates, durations, pipeline-run timestamps) via a small `font-mono tabular-nums` utility combo wherever those values render, so columns of numbers align — a real readability win, not decoration.

## 2. Glassmorphism design system

New CSS custom properties in `globals.css`, defined once per theme inside the existing `:root` / `.dark` blocks (not hardcoded per-component):

```css
:root {
  --glass-bg: color-mix(in oklch, var(--card) 72%, transparent);
  --glass-border: color-mix(in oklch, var(--border) 60%, transparent);
  --glass-shadow: 0 8px 32px 0 color-mix(in oklch, var(--foreground) 8%, transparent);
  --glass-glow: 0 0 0 1px color-mix(in oklch, var(--primary) 15%, transparent);
}
.dark {
  --glass-bg: color-mix(in oklch, var(--card) 55%, transparent);
  --glass-border: color-mix(in oklch, var(--border) 40%, transparent);
  --glass-shadow: 0 8px 32px 0 color-mix(in oklch, black 40%, transparent);
  --glass-glow: 0 0 0 1px color-mix(in oklch, var(--primary) 25%, transparent);
}
```

One shared `.glass` utility class (`backdrop-blur-md bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-[var(--glass-shadow)]`) plus a `.glass-interactive` variant adding `hover:shadow-[var(--glass-glow)] transition-shadow` for anything clickable. Applied at the shared-primitive level — `components/ui/card.tsx`, `badge`-equivalents (`Chip`, `StatBadge`, `DeltaBadge`), `button.tsx`, `input.tsx`, and the dropdown/select primitives — so every card/badge/button/input/dropdown across every page picks it up automatically with zero per-page changes. `color-mix(in oklch, ...)` keeps this working correctly against the existing OKLCH-based theme tokens already in `globals.css` rather than fighting them with hardcoded rgba values.

## 3. Icon/color consistency pass

Final sweep (the whole-codebase audit two turns ago already closed the 6 missing-icon gaps) specifically re-checked against glass surfaces: semantic icon colors (`text-amber-500`, `text-emerald-500`, etc.) get verified for sufficient contrast against the new translucent `--glass-bg`, in both themes. Any color that reads poorly on glass gets adjusted at its single source (the icon-color prop at the call site) — no new color system invented.

## 4. TanStack Table — 4 existing tables only

`@tanstack/react-table` added as a dependency. New shared `frontend/components/ui/data-table.tsx`:

```ts
export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder, filters,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder: string;
  filters?: { columnId: string; label: string; options: { label: string; value: string }[] }[];
}) { /* useReactTable + getFilteredRowModel/getSortedRowModel, toolbar row (search Input + per-filter Select dropdowns) above the table, glass-styled */ }
```

`provider-status-table.tsx`, `popular-paths-table.tsx`, `referrers-table.tsx`, `benchmark-table.tsx` each define a `columns: ColumnDef<T>[]` (reusing their existing row-shape types from `lib/api-types.ts`) and render `<DataTable columns={...} data={...} />` instead of hand-rolled `<Table>`/`<TableRow>` JSX. Search is a simple text filter across visible columns; filter dropdowns are column-appropriate (e.g. status for provider-status, path-prefix bucket for popular-paths) — exact filter columns finalized per-table during implementation since they depend on each table's actual data shape, not a product decision needing sign-off.

## 5. Sonner toast overhaul

`components/ui/sonner.tsx`'s `<Sonner>` gets `position="bottom-right"`. All 16 existing `toast.success(...)`/`toast.error(...)` call sites move from a single string to Sonner's native `(title, { description })` shape — e.g. `toast.success("Repo removed", { description: \`${owner}/${name} is no longer tracked.\` })` — titles stay short and active-voice, descriptions carry the specific detail (repo name, count, etc.) that's currently baked into the one-line string. No new toast wrapper/abstraction; this is Sonner's own supported API, just used consistently instead of ad hoc per call site.

Two new lifecycle toasts:

- **Sign-in**, fired once per session from `LiveEventsProvider` (already the client boundary that knows `useSession()` status) the first time `status === "authenticated"` is observed: `toast.success(\`Welcome back, ${name} 👋\`, { description: "Enjoy browsing your dashboard..." })`.
- **Sign-out**, fired from the existing sign-out button handler (`components/sign-in-button.tsx` or wherever `signOut()` is currently called) before the redirect completes: `toast.success(\`Goodbye, ${name} 👋\`, { description: "Hope to see you again soon — happy coding!" })`.

## 6. Live pipeline visualization

**Backend** (`backend/app/pipeline/runner.py`): one new broadcast call added immediately after the existing per-stage `self.db.commit()` inside `run_for_repo`'s loop:

```python
broadcaster.publish(
    "stage_completed",
    {"run_id": run_row.id, "stage_name": stage.name, "status": status},
    user_id=repo.user_id,
)
```

No new "stage started" event, no new DB column, no change to the pipeline's own timing — this is the same commit that already happens today, just also announced over SSE. Stages already run strictly in the order `PipelineRunner` was constructed with (`build_stages`/`build_content_stages`/the opportunities stage list), so the frontend can derive "which stage is active right now" without the backend needing to say so explicitly.

**Frontend**: `frontend/hooks/use-live-events.ts`'s `EVENT_QUERY_MAP` gains a `stage_completed: [queryKeys.runs.stages(run_id)]`-shaped entry — except `run_id` is data-dependent (payload-keyed, not a static key), so this event is handled by a small dedicated effect inside `use-run-stages.ts` (parallel to the existing generic map, same pattern as `use-live-events.ts` already establishes) rather than forcing a static-key shape it doesn't fit: on `stage_completed`, if the payload's `run_id` matches the currently-expanded run, invalidate that run's `queryKeys.runs.stages(run_id)` query directly.

`components/runs/run-row.tsx`'s existing accordion (already built on `use-run-stages`, gated on expansion) renders, per known stage name for that `pipeline_kind` (a small static ordering map, mirroring `KIND_META`'s existing per-kind lookup pattern): completed stages get a checkmark + glass-glow; the first not-yet-completed stage (while the parent run's `status === "running"`) pulses as "active"; stages after that stay dimmed as "pending." No new page, no polling — reuses the exact SSR+SSE+TanStack-Query-invalidation shape already proven throughout this codebase.

## 7. Staggered entrance animations

Uses the already-installed `tw-animate-css` (no new dependency). A small shared helper, `frontend/lib/stagger.ts`:

```ts
export function staggerDelay(index: number, stepMs = 60, capMs = 480): React.CSSProperties {
  return { animationDelay: `${Math.min(index * stepMs, capMs)}ms` };
}
```

Applied via `className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards"` plus `style={staggerDelay(index)}` on each item in every mapped list (repo cards, table rows via `DataTable`, draft/opportunity/recommendation cards, run rows) — a consistent "stair-step wave" mount, capped so a 50-item list doesn't take 3 seconds to finish animating. Respects `prefers-reduced-motion` (Tailwind's `motion-reduce:animate-none` on the same elements) — a real accessibility requirement, not scope creep, and near-zero cost to include.

## 8. Dynamic semantic text coloring

Extends the existing `DeltaBadge`/`StatBadge` color convention (already used for star/fork/watcher deltas) to other numeric/status text that currently renders in the plain foreground color: recommendation-count text, pipeline run status text, LLM provider call-count-vs-limit text. Same semantic mapping already established elsewhere in this codebase (emerald = good/increase/ready, red = bad/error/decrease, amber = warning/degraded, sky = neutral/info) applied via a small shared `lib/semantic-color.ts` helper (`semanticColor(kind: "positive" | "negative" | "warning" | "neutral") => string`) rather than new one-off Tailwind classes invented per call site.

## Testing

Frontend: `DataTable` gets unit tests (search filters rows, column filter dropdowns filter rows, empty-state renders); `staggerDelay` gets a unit test (delay caps correctly); the new `stage_completed` SSE-driven invalidation gets a test mirroring the existing `use-live-events.test.ts` pattern. Backend: one new test asserting `run_for_repo` calls `broadcaster.publish("stage_completed", ...)` once per stage with the right `run_id`/`stage_name`/`status`, mirroring the existing `test_runner.py` assertions.

No visual/screenshot testing is added — this project has no existing visual-regression tooling, and introducing one is out of scope for a styling pass (YAGNI; `eslint`/`tsc`/unit tests/manual browser check are how every prior visual change in this codebase was verified).

## Out of scope (explicitly deferred, not part of this build)

- Any Phase 4 deferred scope (4C/4D cross-posting/Reddit, 4G cloud storage) — separate, account-gated, per `docs/PROJECT_PLAN.md`'s Status Summary.
- VPS/Vercel deployment.
- Visual regression/screenshot testing infrastructure.
