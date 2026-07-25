# Phase 3: Visual & Portfolio Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole frontend a consistent, modern glassmorphic look (self-hosted fonts, glass-styled shared primitives, staggered entrance animations, dynamic semantic coloring), adopt TanStack Table with search/filter for the 4 existing data tables, overhaul Sonner toasts to a title+description shape with welcome/goodbye lifecycle toasts, and add a live per-stage pipeline visualization to the existing Runs page accordion.

**Architecture:** Every change is additive on top of this codebase's existing conventions — nothing here changes SSR-in-`page.tsx`, TanStack Query cache-invalidation, or the SSE/`EVENT_QUERY_MAP` pattern. New shared primitives (`.glass` CSS utility, `DataTable`, `Select`, `lib/stagger.ts`, `lib/semantic-color.ts`) go in the same shared layer (`components/ui/`, `lib/`) every prior phase used, so every page/component picks up the new look by consuming shared code, not by 20 one-off edits.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4 (`@theme inline` + OKLCH color tokens already in `app/globals.css`), `@base-ui/react` (this codebase's headless component library — see `components/ui/dialog.tsx`/`button.tsx`/`input.tsx` for the established pattern), `@tanstack/react-table` (new dependency), `next/font/local` (new usage, not `next/font/google`), `geist` npm package (source of the actual font files), `sonner` (already installed), `tw-animate-css` (already installed, powers the stagger animations — no new animation dependency).

## Global Constraints

- No `next/font/google` anywhere — fonts load via `next/font/local` pointing at real files this plan downloads into `frontend/public/fonts/`.
- TanStack Table scope is exactly 4 tables: `provider-status-table.tsx`, `popular-paths-table.tsx`, `referrers-table.tsx`, `benchmark-table.tsx`. Nothing else (Drafts/Opportunities/Recommendations/Runs stay as Card lists) converts.
- Sonner `Toaster` position is `bottom-right`.
- The `stage_completed` SSE event is broadcast-only — zero new DB columns, zero schema migration.
- Every list-mount stagger animation must respect `prefers-reduced-motion` (via Tailwind's `motion-reduce:` variant).
- The semantic-color helper reuses the existing convention already used by `DeltaBadge`/`STATUS_META` across this codebase: emerald = good/increase/ready/ok, red = bad/error/decrease/failed, amber = warning/degraded, sky = neutral/info/running. Do not invent a new palette.
- Do not delete any existing working code — only replace/refactor what each task below explicitly touches.
- Every new/changed file gets a comment explaining non-obvious WHY, not WHAT, matching this codebase's existing comment style (see e.g. `frontend/hooks/use-live-events.ts`'s inline comments).
- Before any task is marked done: backend `.venv/bin/python -m pytest -q` and frontend `npx eslint . --ext .ts,.tsx`, `npx tsc --noEmit`, `npm test`, `npm run build` all clean.
- `frontend/public/fonts/` and any other genuinely new static assets are real files this plan creates — never placeholder/empty files.

---

## Task 1: Self-hosted fonts (Geist Sans + Geist Mono)

**Files:**
- Modify: `frontend/package.json` (add `geist` dependency)
- Create: `frontend/public/fonts/geist-sans/Geist-Regular.woff2`, `Geist-Medium.woff2`, `Geist-SemiBold.woff2`, `Geist-Bold.woff2`
- Create: `frontend/public/fonts/geist-mono/GeistMono-Regular.woff2`, `GeistMono-Medium.woff2`
- Create: `frontend/lib/fonts.ts`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css:1-12` (fix the dangling `--font-geist-mono` reference, add `--font-geist-sans`)

**Interfaces:**
- Produces: `geistSans`, `geistMono` (both `next/font/local` return objects with a `.variable` string property) exported from `frontend/lib/fonts.ts`, consumed by `app/layout.tsx`.

- [ ] **Step 1: Install `geist` and extract the real font files**

```bash
cd frontend
npm install geist
mkdir -p public/fonts/geist-sans public/fonts/geist-mono
cp node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2 public/fonts/geist-sans/
cp node_modules/geist/dist/fonts/geist-sans/Geist-Medium.woff2 public/fonts/geist-sans/
cp node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.woff2 public/fonts/geist-sans/
cp node_modules/geist/dist/fonts/geist-sans/Geist-Bold.woff2 public/fonts/geist-sans/
cp node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2 public/fonts/geist-mono/
cp node_modules/geist/dist/fonts/geist-mono/GeistMono-Medium.woff2 public/fonts/geist-mono/
ls -la public/fonts/geist-sans public/fonts/geist-mono
```

Expected: 4 files listed under `geist-sans/`, 2 under `geist-mono/`, all with real non-zero byte sizes (these are the actual OFL-licensed Geist font files, verified present in the `geist@1.7.2` npm package at this exact path during plan-writing — if `npm install geist` resolves a different version and these paths 404, run `find node_modules/geist -name "*.woff2"` to find the actual paths and adjust).

- [ ] **Step 2: Create the font loader**

```ts
// frontend/lib/fonts.ts
import localFont from "next/font/local";

// next/font/local (not next/font/google, which flashes an external network
// request) inlines these files at build time and injects a preload <link>
// automatically — this is what actually prevents FOUT/FOIT on first paint,
// not just self-hosting the files.
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

- [ ] **Step 3: Wire the font variables into the theme**

In `frontend/app/globals.css`, the `@theme inline` block currently has a dangling reference (line 11: `--font-mono: var(--font-geist-mono);` with no `--font-geist-mono` ever actually defined anywhere — it silently falls back to the browser default). Fix both lines:

```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
```

(This replaces the existing `--font-sans: var(--font-sans);` self-reference on line 10, which was also a no-op placeholder from the shadcn CLI scaffold.)

- [ ] **Step 4: Apply the font classes in the root layout**

In `frontend/app/layout.tsx`, import the fonts and add both `.variable` classes to `<html>`:

```tsx
import { geistSans, geistMono } from "@/lib/fonts";
```

```tsx
<html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${geistSans.variable} ${geistMono.variable}`}>
```

- [ ] **Step 5: Verify no flash and correct rendering**

```bash
npm run build && npm run start &
sleep 3
curl -s http://localhost:3000/sign-in | grep -o 'font-geist-sans[^"]*' | head -3
```

Expected: the built HTML's `<link rel="preload">` tags include the Geist font files (confirms `next/font/local` inlined and preloaded them, not deferred/network-loaded). Stop the server after checking (`kill %1`).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/public/fonts frontend/lib/fonts.ts frontend/app/layout.tsx frontend/app/globals.css
git commit -m "feat(phase3): self-host Geist Sans/Mono via next/font/local"
```

---

## Task 2: Glassmorphism CSS variables + utility classes

**Files:**
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Produces: `.glass` and `.glass-interactive` Tailwind-composable utility classes, `--glass-bg`/`--glass-border`/`--glass-shadow`/`--glass-glow` CSS variables (light + dark), consumed by Task 3.

- [ ] **Step 1: Add the glass CSS variables**

In `frontend/app/globals.css`, inside the existing `:root { ... }` block (after `--sidebar-ring: oklch(0.708 0 0);`), add:

```css
  --glass-bg: color-mix(in oklch, var(--card) 72%, transparent);
  --glass-border: color-mix(in oklch, var(--border) 60%, transparent);
  --glass-shadow: 0 8px 32px 0 color-mix(in oklch, var(--foreground) 8%, transparent);
  --glass-glow: 0 0 0 1px color-mix(in oklch, var(--primary) 15%, transparent);
```

Inside the existing `.dark { ... }` block (after `--sidebar-ring: oklch(0.556 0 0);`), add:

```css
  --glass-bg: color-mix(in oklch, var(--card) 55%, transparent);
  --glass-border: color-mix(in oklch, var(--border) 40%, transparent);
  --glass-shadow: 0 8px 32px 0 color-mix(in oklch, black 40%, transparent);
  --glass-glow: 0 0 0 1px color-mix(in oklch, var(--primary) 25%, transparent);
```

(`color-mix(in oklch, ...)` keeps this consistent with the theme's existing OKLCH color tokens instead of introducing hardcoded rgba values that would drift from theme changes.)

- [ ] **Step 2: Add the shared utility classes**

At the end of `frontend/app/globals.css` (after the existing `@layer base { ... }` block), add:

```css
@layer components {
  .glass {
    @apply backdrop-blur-md border;
    background-color: var(--glass-bg);
    border-color: var(--glass-border);
    box-shadow: var(--glass-shadow);
  }
  .glass-interactive {
    @apply glass transition-shadow duration-200;
  }
  .glass-interactive:hover {
    box-shadow: var(--glass-shadow), var(--glass-glow);
  }
}
```

- [ ] **Step 3: Verify the build picks up the new utilities**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds (Tailwind v4's `@layer components` + `color-mix()` are both supported by the already-installed Tailwind v4 — no new dependency needed).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(phase3): add glassmorphism CSS variables and .glass utility classes"
```

---

## Task 3: Apply glass styling to shared UI primitives + new Select primitive

**Files:**
- Modify: `frontend/components/ui/card.tsx:11-19`
- Modify: `frontend/components/ui/chip.tsx`
- Modify: `frontend/components/ui/button.tsx:10-21` (default/outline/secondary variants only — `ghost`/`destructive`/`link` stay transparent/text-only by design, glass doesn't apply to them)
- Modify: `frontend/components/ui/input.tsx:11-14`
- Create: `frontend/components/ui/select.tsx`

**Interfaces:**
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (from the new `select.tsx`), consumed by `DataTable` in Task 5.

- [ ] **Step 1: Apply `.glass` to Card**

In `frontend/components/ui/card.tsx`, add `"glass"` to the `cn(...)` call in the `Card` function (line 14-17), right before the existing className string:

```tsx
      className={cn(
        "glass group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
```

(Note: `bg-card` and `ring-1 ring-foreground/10` are removed from this string — `.glass` already sets background + border, so keeping the old opaque `bg-card`/ring would visually cancel the glass translucency.)

- [ ] **Step 2: Apply glass to Chip**

```tsx
// frontend/components/ui/chip.tsx
import type { ReactNode } from "react";

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="glass inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Apply glass-interactive to Button's default/outline/secondary variants**

In `frontend/components/ui/button.tsx`, inside `buttonVariants`'s `variant` object (lines 10-21), change these three entries:

```tsx
        default: "glass-interactive bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "glass-interactive bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "glass-interactive bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
```

(`border-border`/`dark:border-input` are dropped from `outline`'s string since `.glass-interactive` already sets a border color; `ghost`/`destructive`/`link` are left untouched — those are intentionally flat/text-style variants, not surfaces.)

- [ ] **Step 4: Apply glass to Input**

In `frontend/components/ui/input.tsx`, add `"glass"` to the `cn(...)` call (line 11-14):

```tsx
      className={cn(
        "glass h-8 w-full min-w-0 rounded-lg px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
```

(`border border-input`/`bg-transparent`/`dark:bg-input/30`/`disabled:bg-input/50`/`dark:disabled:bg-input/80` are dropped since `.glass` already provides background + border.)

- [ ] **Step 5: Write the new Select primitive**

No `Select`/dropdown primitive exists yet in this codebase — `@base-ui/react/select` is already a transitive dependency of the already-installed `@base-ui/react` package, so no new dependency is needed. This mirrors `dialog.tsx`'s exact construction pattern (`data-slot` attributes, `cn()` merging, Portal+Backdrop+Positioner+Popup structure):

```tsx
// frontend/components/ui/select.tsx
"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Select({ ...props }: SelectPrimitive.Root.Props<string>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "glass-interactive flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDownIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({ className, children, ...props }: SelectPrimitive.Popup.Props) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Backdrop />
      <SelectPrimitive.Positioner sideOffset={4}>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "glass z-50 max-h-64 min-w-[8rem] overflow-auto rounded-lg p-1 text-sm text-popover-foreground shadow-lg outline-none",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 outline-none data-highlighted:bg-muted",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
```

- [ ] **Step 6: Verify existing component tests still pass**

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: all existing tests pass unchanged (this task only adds classNames and one new file — no behavioral change to any existing component's props/exports).

- [ ] **Step 7: Commit**

```bash
git add frontend/components/ui/card.tsx frontend/components/ui/chip.tsx frontend/components/ui/button.tsx frontend/components/ui/input.tsx frontend/components/ui/select.tsx
git commit -m "feat(phase3): apply glassmorphism to Card/Chip/Button/Input, add Select primitive"
```

---

## Task 4: Icon/color contrast pass against glass surfaces

**Files:**
- Modify: any file where a manual browser check (Step 1) finds insufficient contrast — cannot be enumerated in advance since it depends on Task 3's actual rendered output.

**Interfaces:**
- Consumes: the `.glass`/`.glass-interactive` classes from Task 2/3.

- [ ] **Step 1: Manual visual check**

```bash
cd frontend && npm run dev &
sleep 3
```

Open `http://localhost:3000` in a browser (both light and dark mode, via the existing theme toggle). Check every page (`/`, `/recommendations`, `/drafts`, `/runs`, `/opportunities`, `/settings`, a `/repos/[id]` detail page) for any icon/text color that reads poorly against the new translucent glass background — this is a visual judgment call, not a mechanical check, so there's no single expected output; the bar is "every icon and label is clearly legible in both themes."

- [ ] **Step 2: Fix any real contrast issue found**

If Step 1 finds a genuine problem, fix it at its single source (the `color` prop passed to `StatBadge`/`DeltaBadge`, or the Tailwind color class at the icon's call site) — do not invent a new color system, reuse the existing semantic Tailwind color scale (`text-{color}-500`) already used everywhere else in this codebase.

- [ ] **Step 3: Stop the dev server and verify the full suite**

```bash
kill %1
npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean. If Step 1 found zero issues, this task still ends here — "found zero issues" is itself a valid, verified outcome, not a task to skip.

- [ ] **Step 4: Commit (only if Step 2 made changes)**

```bash
git add -A
git commit -m "fix(phase3): adjust icon/text contrast against glass surfaces"
```

If Step 2 made no changes, skip this step — do not create an empty commit.

---

## Task 5: Shared `DataTable` component (TanStack Table wrapper)

**Files:**
- Modify: `frontend/package.json` (add `@tanstack/react-table`)
- Create: `frontend/components/ui/data-table.tsx`
- Test: `frontend/tests/data-table.test.tsx`

**Interfaces:**
- Consumes: `Input` (`components/ui/input.tsx`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (`components/ui/select.tsx`, Task 3), `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` (`components/ui/table.tsx`, unchanged).
- Produces: `DataTable<TData, TValue>({ columns, data, searchColumnId, searchPlaceholder, filters })` — a generic component. `filters` is `{ columnId: string; label: string; options: { label: string; value: string }[] }[] | undefined`. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Install the dependency**

```bash
cd frontend && npm install @tanstack/react-table
```

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/tests/data-table.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

type Row = { name: string; status: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
];

const data: Row[] = [
  { name: "groq", status: "active" },
  { name: "gemini", status: "idle" },
];

describe("DataTable", () => {
  it("renders every row by default", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
  });

  it("filters rows by the search input", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "groq" } });
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.queryByText("gemini")).not.toBeInTheDocument();
  });

  it("renders an empty state when no rows match", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "nonexistent" } });
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/data-table.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ui/data-table'" (file doesn't exist yet).

- [ ] **Step 4: Implement `DataTable`**

```tsx
// frontend/components/ui/data-table.tsx
"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Shared table shell for every list-of-rows view in this app (provider
// status, popular paths, referrers, benchmarks) — one search input + zero or
// more filter dropdowns above a TanStack-Table-driven <table>, instead of
// each table hand-rolling its own toolbar.
export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumnId,
  searchPlaceholder,
  filters,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchColumnId: string;
  searchPlaceholder: string;
  filters?: { columnId: string; label: string; options: { label: string; value: string }[] }[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-8"
            value={(table.getColumn(searchColumnId)?.getFilterValue() as string) ?? ""}
            onChange={(e) => table.getColumn(searchColumnId)?.setFilterValue(e.target.value)}
          />
        </div>
        {filters?.map((filter) => (
          <Select
            key={filter.columnId}
            value={(table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all"}
            onValueChange={(value) =>
              table.getColumn(filter.columnId)?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-6 text-center text-sm text-muted-foreground">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/data-table.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/components/ui/data-table.tsx frontend/tests/data-table.test.tsx
git commit -m "feat(phase3): add shared DataTable (TanStack Table + search/filter)"
```

---

## Task 6: Convert `ProviderStatusTable` to `DataTable`

**Files:**
- Modify: `frontend/components/settings/provider-status-table.tsx`

**Interfaces:**
- Consumes: `DataTable` (Task 5), `ProviderStatus` type (`lib/api-types.ts`, unchanged), `useProviderStatus` (unchanged).

- [ ] **Step 1: Rewrite the component**

```tsx
// frontend/components/settings/provider-status-table.tsx
"use client";

import { Cpu } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderStatus } from "@/hooks/use-provider-status";
import { semanticColor } from "@/lib/semantic-color";
import type { ProviderStatus } from "@/lib/api-types";

const columns: ColumnDef<ProviderStatus>[] = [
  { accessorKey: "provider", header: "Provider" },
  {
    accessorKey: "calls_today",
    header: "Calls today",
    // Zero calls today reads as neutral (provider simply hasn't been needed
    // yet, not a problem); any real usage is worth calling out as active.
    // filterFn maps the "Active"/"Idle" dropdown values (strings) onto the
    // underlying numeric calls_today column.
    filterFn: (row, columnId, filterValue) => {
      const calls = row.getValue<number>(columnId);
      return filterValue === "active" ? calls > 0 : calls === 0;
    },
    cell: ({ row }) => (
      <span className={row.original.calls_today > 0 ? semanticColor("neutral") : "text-muted-foreground"}>
        {row.original.calls_today}
      </span>
    ),
  },
];

export function ProviderStatusTable() {
  const { data: statuses, isPending } = useProviderStatus();

  return (
    <div className="space-y-3">
      <SectionHeading icon={Cpu} title="LLM provider usage" subtitle="Calls made today, per free-tier provider" iconColor="text-sky-500" />
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : statuses && statuses.length === 0 ? (
        <EmptyState icon={Cpu} title="No usage yet today" description="Provider usage resets daily." />
      ) : (
        <DataTable
          columns={columns}
          data={statuses ?? []}
          searchColumnId="provider"
          searchPlaceholder="Search providers..."
          filters={[
            {
              columnId: "calls_today",
              label: "usage",
              options: [
                { label: "Active", value: "active" },
                { label: "Idle", value: "idle" },
              ],
            },
          ]}
        />
      )}
    </div>
  );
}
```

Note: the `calls_today` column's raw values are numbers, but the filter dropdown compares against `"active"`/`"idle"` strings — add a `filterFn` to that column so the two match up:

```tsx
  {
    accessorKey: "calls_today",
    header: "Calls today",
    filterFn: (row, columnId, filterValue) => {
      const calls = row.getValue<number>(columnId);
      return filterValue === "active" ? calls > 0 : calls === 0;
    },
    cell: ({ row }) => (
      <span className={row.original.calls_today > 0 ? semanticColor("neutral") : "text-muted-foreground"}>
        {row.original.calls_today}
      </span>
    ),
  },
```

(Use this second version of the column definition — it supersedes the first one written above, which was missing `filterFn`.)

- [ ] **Step 2: Verify manually and run the suite**

This component has no dedicated test file today (confirmed via `ls frontend/tests/ | grep provider` returning nothing) — no test to update. Run the full check:

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean. `frontend/lib/semantic-color.ts` doesn't exist until Task 13 — if this task runs before Task 13 in execution order, stub it minimally here (see Task 13's Step 2 for the real implementation) so this task compiles:

```ts
// frontend/lib/semantic-color.ts
export function semanticColor(kind: "positive" | "negative" | "warning" | "neutral"): string {
  return { positive: "text-emerald-500", negative: "text-red-500", warning: "text-amber-500", neutral: "text-sky-500" }[kind];
}
```

Task 13 will expand this file's usage elsewhere but must not narrow this function's signature — it already matches what Task 13 needs.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/settings/provider-status-table.tsx frontend/lib/semantic-color.ts
git commit -m "feat(phase3): convert ProviderStatusTable to DataTable"
```

---

## Task 7: Convert the 3 repo-detail tables to `DataTable`

**Files:**
- Modify: `frontend/components/repo-detail/popular-paths-table.tsx`
- Modify: `frontend/components/repo-detail/referrers-table.tsx`
- Modify: `frontend/components/repo-detail/benchmark-table.tsx`

**Interfaces:**
- Consumes: `DataTable` (Task 5), `PopularPath`/`Referrer`/`Benchmark` types (unchanged).

- [ ] **Step 1: Convert `PopularPathsTable`**

```tsx
// frontend/components/repo-detail/popular-paths-table.tsx
"use client";

import { Route } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoPopularPaths } from "@/hooks/use-repo-popular-paths";
import type { PopularPath } from "@/lib/api-types";

const columns: ColumnDef<PopularPath>[] = [
  { accessorKey: "path", header: "Path", cell: ({ row }) => <span className="font-mono text-xs">{row.original.path}</span> },
  { accessorKey: "count", header: "Views" },
  { accessorKey: "uniques", header: "Uniques" },
];

export function PopularPathsTable({ repoId }: { repoId: number }) {
  const { data: paths, isPending } = useRepoPopularPaths(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Route} title="Popular content" subtitle="Most-viewed paths in this repo" iconColor="text-sky-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : paths && paths.length === 0 ? (
        <EmptyState icon={Route} title="No path data yet" description="GitHub's traffic API is a rolling 14-day window." />
      ) : (
        <DataTable columns={columns} data={paths ?? []} searchColumnId="path" searchPlaceholder="Search paths..." />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Convert `ReferrersTable`**

```tsx
// frontend/components/repo-detail/referrers-table.tsx
"use client";

import { Link2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoReferrers } from "@/hooks/use-repo-referrers";
import type { Referrer } from "@/lib/api-types";

const columns: ColumnDef<Referrer>[] = [
  { accessorKey: "referrer", header: "Source" },
  { accessorKey: "count", header: "Views" },
  { accessorKey: "uniques", header: "Uniques" },
];

export function ReferrersTable({ repoId }: { repoId: number }) {
  const { data: referrers, isPending } = useRepoReferrers(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Link2} title="Referrers" subtitle="Where traffic is coming from" iconColor="text-emerald-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : referrers && referrers.length === 0 ? (
        <EmptyState icon={Link2} title="No referrer data yet" description="GitHub's traffic API is a rolling 14-day window." />
      ) : (
        <DataTable columns={columns} data={referrers ?? []} searchColumnId="referrer" searchPlaceholder="Search referrers..." />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Convert `BenchmarkTable`**

```tsx
// frontend/components/repo-detail/benchmark-table.tsx
"use client";

import { Trophy } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoBenchmarks } from "@/hooks/use-repo-benchmarks";
import type { Benchmark } from "@/lib/api-types";

const columns: ColumnDef<Benchmark>[] = [
  { accessorKey: "full_name", header: "Repo" },
  { accessorKey: "stars", header: "Stars" },
  { accessorKey: "forks", header: "Forks" },
  { accessorKey: "topics", header: "Topics", cell: ({ row }) => row.original.topics.join(", ") },
];

export function BenchmarkTable({ repoId }: { repoId: number }) {
  const { data: benchmarks, isPending } = useRepoBenchmarks(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Trophy} title="Benchmark repos" subtitle="Similar public repos, for comparison" iconColor="text-amber-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : benchmarks && benchmarks.length === 0 ? (
        <EmptyState icon={Trophy} title="No benchmarks yet" description="These populate on the next pipeline run." />
      ) : (
        <DataTable columns={columns} data={benchmarks ?? []} searchColumnId="full_name" searchPlaceholder="Search repos..." />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean. (No dedicated test files exist for these 3 components today — confirmed via `ls frontend/tests/ | grep -E "popular-paths|referrers|benchmark"` returning nothing.)

- [ ] **Step 5: Commit**

```bash
git add frontend/components/repo-detail/popular-paths-table.tsx frontend/components/repo-detail/referrers-table.tsx frontend/components/repo-detail/benchmark-table.tsx
git commit -m "feat(phase3): convert repo-detail tables to DataTable"
```

---

## Task 8: Sonner toast overhaul (position + title/description shape)

**Files:**
- Modify: `frontend/components/ui/sonner.tsx`
- Modify: `frontend/components/opportunities/opportunities-client.tsx:61`
- Modify: `frontend/components/settings/notification-settings-card.tsx:23`
- Modify: `frontend/components/repo-detail/repo-recommendations.tsx:41`
- Modify: `frontend/components/drafts/drafts-client.tsx:50-51,90,92,95,110`
- Modify: `frontend/components/recommendations/recommendations-client.tsx:78`
- Modify: `frontend/components/repo-detail/demo-assets-section.tsx:28`
- Modify: `frontend/components/overview/add-repo-dialog.tsx:50,56`
- Modify: `frontend/components/overview/delete-repo-button.tsx:21`
- Modify: `frontend/components/runs/runs-client.tsx:22-23`
- Modify: `frontend/tests/drafts-client.test.tsx:60-73`

**Interfaces:**
- No new exports — every call site keeps calling `toast.success`/`toast.error`, just with a second `{ description }` argument.

- [ ] **Step 1: Position the Toaster bottom-right**

In `frontend/components/ui/sonner.tsx`, add `position="bottom-right"` to the `<Sonner>` element (alongside the existing `theme`/`className` props):

```tsx
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="bottom-right"
      className="toaster group"
```

- [ ] **Step 2: Convert every call site to `(title, { description })`**

Each conversion keeps the original message as the title (trimmed to the core action) and moves the specific detail into `description`. Exact before → after:

`frontend/components/opportunities/opportunities-client.tsx:61` — no detail available, description omitted:
```tsx
{ onError: () => toast.error("Could not dismiss opportunity", { description: "Please try again." }) },
```

`frontend/components/settings/notification-settings-card.tsx:23`:
```tsx
{ onError: () => toast.error("Could not update notification email", { description: "Please try again." }) },
```

`frontend/components/repo-detail/repo-recommendations.tsx:41`:
```tsx
{ onError: () => toast.error("Could not dismiss recommendation", { description: "Please try again." }) },
```

`frontend/components/drafts/drafts-client.tsx:50-51`:
```tsx
onSuccess: () => toast.success("Content generation started", { description: "Drafts will appear here shortly." }),
onError: () => toast.error("Could not start content generation", { description: "Please try again." }),
```

`frontend/components/drafts/drafts-client.tsx:88-96` (inside `onSuccess: (updated) => { ... }`):
```tsx
onSuccess: (updated) => {
  if (updated.status === "posted") {
    toast.success("Reply posted to GitHub", { description: "Your approved reply is now live." });
  } else if (updated.status === "failed") {
    toast.error("Could not post reply", { description: updated.error_message ?? "Unknown error." });
  }
},
onError: () => toast.error("Could not approve draft", { description: "Please try again." }),
```

`frontend/components/drafts/drafts-client.tsx:110`:
```tsx
{ onError: () => toast.error("Could not reject draft", { description: "Please try again." }) },
```

`frontend/components/recommendations/recommendations-client.tsx:78`:
```tsx
{ onError: () => toast.error("Could not dismiss recommendation", { description: "Please try again." }) },
```

`frontend/components/repo-detail/demo-assets-section.tsx:28`:
```tsx
trigger.mutate(undefined, { onError: () => toast.error("Could not start demo generation", { description: "Please try again." }) })
```

`frontend/components/overview/add-repo-dialog.tsx:50,56`:
```tsx
toast.success("Repo added", { description: `Now tracking ${owner}/${name}.` });
```
```tsx
onError: () => toast.error("Could not add repo", { description: "Check the owner/name and try again." }),
```

`frontend/components/overview/delete-repo-button.tsx:21`:
```tsx
onError: () => toast.error("Could not stop tracking repo", { description: `${repo.owner}/${repo.name} — please try again.` }),
```

`frontend/components/runs/runs-client.tsx:22-23`:
```tsx
onSuccess: () => toast.success("Pipeline run triggered", { description: "This may take a few minutes." }),
onError: () => toast.error("Could not trigger a run", { description: "Please try again." }),
```

- [ ] **Step 3: Update the existing test assertions that break from the new call shape**

`toast.success(title, { description })` now passes 2 arguments where the mocked fn previously received 1 — `frontend/tests/drafts-client.test.tsx`'s existing assertions (`toHaveBeenCalledWith(expect.stringMatching(...))` with a single argument) fail against a 2-argument call. Update:

```tsx
// frontend/tests/drafts-client.test.tsx, inside "shows a success toast when approving results in status posted"
expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/posted/i), expect.anything());
```

```tsx
// same file, inside "shows an error toast with the failure reason when approving results in status failed"
expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("Could not post"), { description: "GitHub API unavailable" });
```

- [ ] **Step 4: Run the full suite**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean, including the updated `drafts-client.test.tsx` assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/sonner.tsx frontend/components/opportunities/opportunities-client.tsx frontend/components/settings/notification-settings-card.tsx frontend/components/repo-detail/repo-recommendations.tsx frontend/components/drafts/drafts-client.tsx frontend/components/recommendations/recommendations-client.tsx frontend/components/repo-detail/demo-assets-section.tsx frontend/components/overview/add-repo-dialog.tsx frontend/components/overview/delete-repo-button.tsx frontend/components/runs/runs-client.tsx frontend/tests/drafts-client.test.tsx
git commit -m "feat(phase3): bottom-right toasts with title/description, update tests"
```

---

## Task 9: Welcome/goodbye lifecycle toasts

**Files:**
- Modify: `frontend/providers/live-events-provider.tsx`
- Modify: `frontend/components/nav-sidebar.tsx:53-60`
- Test: `frontend/tests/live-events-provider.test.tsx`

**Interfaces:**
- No new exports — both toasts fire as a side effect of existing session-state transitions.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/live-events-provider.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveEventsProvider } from "@/providers/live-events-provider";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@/hooks/use-live-events", () => ({ useLiveEvents: vi.fn() }));

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

describe("LiveEventsProvider welcome toast", () => {
  it("shows a welcome toast with the user's name once authenticated", () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: { name: "Arnob" } } });
    render(<LiveEventsProvider>{null}</LiveEventsProvider>);
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Arnob"),
      expect.objectContaining({ description: expect.stringContaining("Enjoy browsing") }),
    );
  });

  it("does not show a welcome toast while unauthenticated", () => {
    useSession.mockReturnValue({ status: "unauthenticated", data: null });
    render(<LiveEventsProvider>{null}</LiveEventsProvider>);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/live-events-provider.test.tsx`
Expected: FAIL (no welcome toast fires today).

- [ ] **Step 3: Implement the welcome toast**

```tsx
// frontend/providers/live-events-provider.tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useLiveEvents } from "@/hooks/use-live-events";

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  useLiveEvents();

  const { status, data } = useSession();
  // Fires once per browser session, not on every re-render while
  // authenticated (a ref, not state, since this shouldn't itself trigger a
  // re-render) — next-auth's session hook re-fires on focus/interval polling,
  // and repeating the welcome toast on every poll would be noisy, not welcoming.
  const welcomedRef = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !welcomedRef.current) {
      welcomedRef.current = true;
      const name = data?.user?.name ?? "there";
      toast.success(`Welcome back, ${name} 👋`, { description: "Enjoy browsing your dashboard..." });
    }
    if (status === "unauthenticated") {
      welcomedRef.current = false;
    }
  }, [status, data?.user?.name]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/live-events-provider.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Implement the goodbye toast**

In `frontend/components/nav-sidebar.tsx`, the sign-out button's `onClick` (line 55) currently calls `signOut({ callbackUrl: "/sign-in" })` directly. Fire the toast first, in a wrapper function:

```tsx
import { toast } from "sonner";
```

```tsx
function handleSignOut(name: string | null | undefined) {
  toast.success(`Goodbye, ${name ?? "there"} 👋`, { description: "Hope to see you again soon — happy coding!" });
  signOut({ callbackUrl: "/sign-in" });
}
```

(Place this function above the `NavSidebar` component, or inline as a closure inside it — either works since it only needs `session.user.name`, already in scope.) Replace the button's `onClick`:

```tsx
onClick={() => handleSignOut(session.user.name)}
```

- [ ] **Step 6: Verify the full suite**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/providers/live-events-provider.tsx frontend/components/nav-sidebar.tsx frontend/tests/live-events-provider.test.tsx
git commit -m "feat(phase3): welcome/goodbye lifecycle toasts"
```

---

## Task 10: Backend `stage_completed` SSE event

**Files:**
- Modify: `backend/app/pipeline/runner.py:38-55`
- Test: `backend/tests/test_runner.py`

**Interfaces:**
- Produces: a new `broadcaster.publish("stage_completed", {"run_id": int, "stage_name": str, "status": str}, user_id=int)` call, one per stage, consumed by Task 11's frontend work.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_runner.py`:

```python
from unittest.mock import patch


@patch("app.pipeline.runner.broadcaster.publish")
def test_runner_publishes_stage_completed_per_stage(mock_publish, seed_user):
    db, repo = _db(seed_user)
    runner = PipelineRunner(stages=[_BoomStage(), _SetsNormalizedStage()], db_session=db)

    runner.run_for_repo(repo)
    run_id = db.query(PipelineRun).first().id

    assert mock_publish.call_count == 2
    mock_publish.assert_any_call(
        "stage_completed", {"run_id": run_id, "stage_name": "boom", "status": "error"}, user_id=seed_user
    )
    mock_publish.assert_any_call(
        "stage_completed", {"run_id": run_id, "stage_name": "sets_normalized", "status": "ok"}, user_id=seed_user
    )
    db.close()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_runner.py::test_runner_publishes_stage_completed_per_stage -v`
Expected: FAIL — `mock_publish.call_count == 0` (no broadcast happens today).

- [ ] **Step 3: Add the broadcast call**

In `backend/app/pipeline/runner.py`, add the import and the publish call. First, the import (top of file):

```python
from app.events import broadcaster
```

Then, inside `run_for_repo`'s stage loop, immediately after the existing `self.db.commit()` that follows `self.db.add(StageRun(...))` (currently the last line of the loop body):

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_runner.py::test_runner_publishes_stage_completed_per_stage -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/bin/python -m pytest -q`
Expected: all pass (this change is additive — no existing test asserts an absence of `broadcaster.publish` calls from `runner.py`, confirmed by reading every existing test in `test_runner.py` during plan-writing).

- [ ] **Step 6: Commit**

```bash
git add backend/app/pipeline/runner.py backend/tests/test_runner.py
git commit -m "feat(phase3): broadcast stage_completed SSE event per pipeline stage"
```

---

## Task 11: Live per-stage visualization on the Runs accordion

**Files:**
- Modify: `frontend/hooks/use-run-stages.ts`
- Modify: `frontend/components/runs/run-row.tsx`
- Test: `frontend/tests/use-run-stages.test.tsx`

**Interfaces:**
- Consumes: the `stage_completed` SSE event from Task 10 (payload: `{run_id, stage_name, status}`).
- Modifies `useRunStages`'s existing signature-compatible behavior — no breaking change to its `(runId, enabled) => useQuery(...)` shape.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/use-run-stages.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useRunStages } from "@/hooks/use-run-stages";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler];
  }
  emit(type: string, data: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ type, data: JSON.stringify(data) } as MessageEvent);
    }
  }
  close() {}
}

function Harness({ runId }: { runId: number }) {
  useRunStages(runId, true);
  return null;
}

describe("useRunStages live invalidation", () => {
  it("invalidates this run's stages query when a matching stage_completed event arrives", () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={42} />
      </QueryClientProvider>,
    );

    // Note: this hook subscribes to the same "/api/events" EventSource opened
    // by useLiveEvents — in this isolated test there's no LiveEventsProvider,
    // so useRunStages must open its own subscription for run_id-keyed events
    // (a static EVENT_QUERY_MAP entry can't express "only if run_id matches").
    const source = FakeEventSource.instances[0];
    source.emit("stage_completed", { run_id: 42, stage_name: "extractor", status: "ok" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.runs.stages(42) });

    vi.unstubAllGlobals();
  });

  it("ignores stage_completed events for a different run", () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={42} />
      </QueryClientProvider>,
    );

    const source = FakeEventSource.instances[0];
    source.emit("stage_completed", { run_id: 999, stage_name: "extractor", status: "ok" });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.runs.stages(42) });

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/use-run-stages.test.tsx`
Expected: FAIL — no `EventSource` is opened by `useRunStages` today, so no invalidation ever fires.

- [ ] **Step 3: Implement the live subscription**

```ts
// frontend/hooks/use-run-stages.ts
"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { StageRun } from "@/lib/api-types";

export function useRunStages(runId: number, enabled: boolean) {
  const queryClient = useQueryClient();

  // Payload-keyed by run_id, not a static queryKey — the shared
  // EVENT_QUERY_MAP in use-live-events.ts can't express "only invalidate if
  // this event's run_id matches this specific hook instance's runId", so
  // this hook opens its own small, dedicated subscription instead, matching
  // the connection-per-consumer shape useLiveEvents already establishes.
  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource("/api/events");
    const handler = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as { run_id: number; stage_name: string; status: string };
      if (payload.run_id === runId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.runs.stages(runId) });
      }
    };
    source.addEventListener("stage_completed", handler);

    return () => source.close();
  }, [enabled, runId, queryClient]);

  return useQuery({
    queryKey: queryKeys.runs.stages(runId),
    queryFn: () => fetchJson<StageRun[]>(`/api/runs/${runId}/stages`),
    enabled,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/use-run-stages.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Upgrade `RunRow`'s accordion to show live per-stage status**

```tsx
// frontend/components/runs/run-row.tsx
"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, Radar, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunStages } from "@/hooks/use-run-stages";
import type { PipelineRun } from "@/lib/api-types";

const STATUS_META = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", label: "OK" },
  degraded: { icon: AlertTriangle, color: "text-amber-500", label: "Degraded" },
  running: { icon: Loader2, color: "text-sky-500", label: "Running" },
} as const;

const KIND_META = {
  analytics: { icon: BarChart3, color: "text-sky-500", label: "Analytics" },
  content: { icon: Sparkles, color: "text-fuchsia-500", label: "Content" },
  opportunities: { icon: Radar, color: "text-rose-500", label: "Opportunities" },
} as const;

// Stages run strictly in this declared order (mirrors the backend's
// build_stages / build_content_stages / opportunities stage list) — knowing
// the order lets the UI infer "which stage is active right now" from just
// the set of already-completed stage names, with no separate "started" event.
const STAGE_ORDER: Record<keyof typeof KIND_META, string[]> = {
  analytics: ["extractor", "preprocessor", "analyzer", "optimizer", "synthesizer", "validator", "assembler"],
  content: ["extractor", "analyzer", "preprocessor", "optimizer", "synthesizer", "validator", "assembler"],
  opportunities: ["extractor", "assembler"],
};

export function RunRow({ run }: { run: PipelineRun }) {
  const [expanded, setExpanded] = useState(false);
  const { data: stages, isPending } = useRunStages(run.id, expanded);
  const meta = STATUS_META[run.status as keyof typeof STATUS_META] ?? STATUS_META.running;
  const StatusIcon = meta.icon;
  const kindKey = (run.pipeline_kind as keyof typeof KIND_META) in KIND_META ? (run.pipeline_kind as keyof typeof KIND_META) : "analytics";
  const kindMeta = KIND_META[kindKey];
  const KindIcon = kindMeta.icon;

  const completedNames = new Set(stages?.map((s) => s.stage_name));
  const nextPendingIndex = STAGE_ORDER[kindKey].findIndex((name) => !completedNames.has(name));

  return (
    <Card>
      <CardContent className="py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={expanded}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            Run #{run.id}
            <span className={`flex items-center gap-1 text-xs ${kindMeta.color}`}>
              <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {kindMeta.label}
            </span>
          </span>
          <span className={`flex items-center gap-1 text-sm ${meta.color}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {meta.label}
          </span>
        </button>
        {expanded && (
          <div className="mt-3 space-y-1 border-t pt-3">
            {isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              STAGE_ORDER[kindKey].map((stageName, index) => {
                const stageRow = stages?.find((s) => s.stage_name === stageName);
                const isActive = run.status === "running" && index === nextPendingIndex;
                const isPendingStage = run.status === "running" && index > nextPendingIndex;

                if (stageRow) {
                  return (
                    <div key={stageName} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                          {stageRow.stage_name}
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {stageRow.duration_ms}ms
                          <span className={stageRow.status === "ok" ? "text-emerald-500" : "text-red-500"}>{stageRow.status}</span>
                        </span>
                      </div>
                      {stageRow.error && <p className="mt-0.5 text-xs text-red-500">{stageRow.error}</p>}
                    </div>
                  );
                }

                return (
                  <div key={stageName} className={`flex items-center gap-1.5 text-sm ${isPendingStage ? "text-muted-foreground/50" : ""}`}>
                    {isActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" aria-hidden="true" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40" aria-hidden="true" />
                    )}
                    <span className={isActive ? "font-medium text-sky-500" : ""}>{stageName}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Run the full suite**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/hooks/use-run-stages.ts frontend/components/runs/run-row.tsx frontend/tests/use-run-stages.test.tsx
git commit -m "feat(phase3): live per-stage pipeline visualization on Runs accordion"
```

---

## Task 12: Staggered entrance animations

**Files:**
- Create: `frontend/lib/stagger.ts`
- Test: `frontend/tests/stagger.test.ts`
- Modify: `frontend/components/overview/repo-card.tsx` (caller — the grid mapping it, i.e. wherever `<RepoCard>` is mapped over the repos array, likely `components/overview/overview-client.tsx`; verify by reading that file first)
- Modify: `frontend/components/ui/data-table.tsx:` the row-mapping loop
- Modify: `frontend/components/drafts/drafts-client.tsx`, `frontend/components/opportunities/opportunities-client.tsx`, `frontend/components/recommendations/recommendations-client.tsx` (each list-mapping loop)
- Modify: `frontend/components/runs/runs-client.tsx` (the `RunRow` mapping loop)

**Interfaces:**
- Produces: `staggerDelay(index: number, stepMs?: number, capMs?: number) => React.CSSProperties`, consumed by every list above.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/stagger.test.ts
import { describe, expect, it } from "vitest";
import { staggerDelay } from "@/lib/stagger";

describe("staggerDelay", () => {
  it("scales delay linearly with index using the default step", () => {
    expect(staggerDelay(0)).toEqual({ animationDelay: "0ms" });
    expect(staggerDelay(3)).toEqual({ animationDelay: "180ms" });
  });

  it("respects a custom step", () => {
    expect(staggerDelay(2, 100)).toEqual({ animationDelay: "200ms" });
  });

  it("caps the delay so long lists don't take forever to finish animating", () => {
    expect(staggerDelay(50, 60, 480)).toEqual({ animationDelay: "480ms" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run tests/stagger.test.ts`
Expected: FAIL — `@/lib/stagger` doesn't exist yet.

- [ ] **Step 3: Implement `staggerDelay`**

```ts
// frontend/lib/stagger.ts
import type { CSSProperties } from "react";

// A shared timing curve so every mapped list in the app staggers consistently
// instead of each component picking its own magic numbers. Capped so a
// 50-item list doesn't take seconds to finish its entrance animation.
export function staggerDelay(index: number, stepMs = 60, capMs = 480): CSSProperties {
  return { animationDelay: `${Math.min(index * stepMs, capMs)}ms` };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/stagger.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Apply to every list**

The shared class string every list item gets: `className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none"` plus `style={staggerDelay(index)}`. `motion-reduce:animate-none` is Tailwind's built-in `prefers-reduced-motion` variant — no custom media query needed.

**`frontend/components/overview/overview-client.tsx`** — the `RepoCard` grid (line 28):

```tsx
          {repos?.map((repo, index) => (
            <div key={repo.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none" style={staggerDelay(index)}>
              <RepoCard repo={repo} />
            </div>
          ))}
```

(Add `import { staggerDelay } from "@/lib/stagger";` to this file. `RepoCard` itself keeps taking only `repo` — the stagger wraps it from the outside rather than threading an extra prop through it, since `RepoCard` has no other reason to know its own list position.)

Apply the same wrap-in-a-staggered-`div`-with-index pattern (add the `staggerDelay` import, switch `.map((item) => ...)` to `.map((item, index) => ...)`, wrap the existing `<Card>`/`<TableRow>` in the animate-in classes + `style={staggerDelay(index)}`) to:

- `frontend/components/ui/data-table.tsx`: the `table.getRowModel().rows.map((row) => (<TableRow key={row.id}>...))` loop — use `row.index` (TanStack Table's row object already has this) instead of introducing a new index variable; apply the animate-in classes directly to the existing `<TableRow>` (no extra wrapper `<tr>` needed).
- `frontend/components/drafts/drafts-client.tsx`: the `pending?.map((draft) => (<Card key={draft.id}>...))` loop (line 65) — apply directly to the existing `<Card>`, no extra wrapper needed.
- `frontend/components/opportunities/opportunities-client.tsx`: the `visible?.map((opp) => (<Card key={opp.id}>...))` loop (line 40) — same, apply directly to `<Card>`.
- `frontend/components/recommendations/recommendations-client.tsx`: the `visible?.map((rec) => (<Card key={rec.id}>...))` loop — same, apply directly to `<Card>`.
- `frontend/components/runs/runs-client.tsx`: `runs?.map((run) => <RunRow key={run.id} run={run} />)` (line 35) — switch to `.map((run, index) => <RunRow key={run.id} run={run} index={index} />)`, and add an `index: number` prop to `RunRow` (`run-row.tsx`, from Task 11) that it applies via `style={staggerDelay(index)}` + the animate-in classes on its own top-level `<Card>`.

- [ ] **Step 6: Verify**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/stagger.ts frontend/tests/stagger.test.ts frontend/components/overview/overview-client.tsx frontend/components/ui/data-table.tsx frontend/components/drafts/drafts-client.tsx frontend/components/opportunities/opportunities-client.tsx frontend/components/recommendations/recommendations-client.tsx frontend/components/runs/runs-client.tsx frontend/components/runs/run-row.tsx
git commit -m "feat(phase3): staggered entrance animations across every list"
```

---

## Task 13: Dynamic semantic text coloring

**Files:**
- Modify: `frontend/lib/semantic-color.ts` (created as a stub in Task 6 — this task is its real home; if Task 6 already ran, this task expands the same file instead of recreating it)
- Test: `frontend/tests/semantic-color.test.ts`
- Modify: `frontend/components/overview/repo-card.tsx:73-79`

**Interfaces:**
- Produces/confirms: `semanticColor(kind: "positive" | "negative" | "warning" | "neutral") => string`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/semantic-color.test.ts
import { describe, expect, it } from "vitest";
import { semanticColor } from "@/lib/semantic-color";

describe("semanticColor", () => {
  it("maps each kind to this app's existing color convention", () => {
    expect(semanticColor("positive")).toBe("text-emerald-500");
    expect(semanticColor("negative")).toBe("text-red-500");
    expect(semanticColor("warning")).toBe("text-amber-500");
    expect(semanticColor("neutral")).toBe("text-sky-500");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd frontend && npx vitest run tests/semantic-color.test.ts`
Expected: PASS already if Task 6 ran first and created the stub with matching values — if this task runs before Task 6, FAIL first (file doesn't exist), then implement:

```ts
// frontend/lib/semantic-color.ts
// Reuses the exact color convention already established by DeltaBadge
// (components/ui/delta-badge.tsx) and STATUS_META (components/runs/run-row.tsx)
// — one shared source instead of every component re-deciding which shade of
// green/red/amber/sky means what.
export function semanticColor(kind: "positive" | "negative" | "warning" | "neutral"): string {
  return {
    positive: "text-emerald-500",
    negative: "text-red-500",
    warning: "text-amber-500",
    neutral: "text-sky-500",
  }[kind];
}
```

- [ ] **Step 3: Apply a real threshold-based dynamic color to the recommendation-count badge**

In `frontend/components/overview/repo-card.tsx`, the `StatBadge` showing `insights.recommendation_count` (lines 73-79) currently hardcodes `color="text-amber-500"` regardless of the actual count. Make it genuinely data-driven — few open recommendations reads as a mild warning, many reads as needing attention:

```tsx
import { semanticColor } from "@/lib/semantic-color";
```

```tsx
        {insights && insights.recommendation_count > 0 && (
          <StatBadge
            icon={Lightbulb}
            label="Open recommendations"
            value={`${insights.recommendation_count} open recommendation${insights.recommendation_count === 1 ? "" : "s"}`}
            color={insights.recommendation_count >= 3 ? semanticColor("negative") : semanticColor("warning")}
          />
        )}
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: all clean. (`STATUS_META` in `run-row.tsx` and `demo-assets-section.tsx`, and `DeltaBadge`, already implement per-value dynamic coloring — confirmed during plan-writing by reading both files — so no change needed there; this task's only real gap was the two spots identified above.)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/semantic-color.ts frontend/tests/semantic-color.test.ts frontend/components/overview/repo-card.tsx
git commit -m "feat(phase3): threshold-based dynamic coloring for recommendation-count badge"
```

---

## Final Step: Whole-branch verification

After all 13 tasks are complete, before handing off to the final whole-branch review:

```bash
cd backend && .venv/bin/python -m pytest -q
cd ../frontend && npx eslint . --ext .ts,.tsx && npx tsc --noEmit && npm test && npm run build
```

Expected: backend tests pass, frontend lint/typecheck/tests/build all clean, matching every prior phase's Gate 2 bar in this project.
