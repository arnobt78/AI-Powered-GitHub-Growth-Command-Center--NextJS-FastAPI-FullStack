// Single source of truth for this app's semantic text-color convention
// (positive/negative/warning/neutral), reusing the exact emerald/red/amber/sky
// palette already established by DeltaBadge (components/ui/delta-badge.tsx)
// and STATUS_META (components/runs/run-row.tsx) — every other call site
// should read a color off this function rather than re-deciding its own
// shade. Permanent home as of Task 13; no further expansion planned.
export function semanticColor(kind: "positive" | "negative" | "warning" | "neutral"): string {
  return { positive: "text-emerald-500", negative: "text-red-500", warning: "text-amber-500", neutral: "text-sky-500" }[kind];
}
