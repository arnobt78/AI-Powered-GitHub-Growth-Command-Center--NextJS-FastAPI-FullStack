// Single source of truth for this app's semantic text-color convention
// (positive/negative/warning/neutral), reusing the exact emerald/red/amber/sky
// palette already established by DeltaBadge and run status UIs — every other
// call site should read a color off this function rather than re-deciding.
export function semanticColor(kind: "positive" | "negative" | "warning" | "neutral"): string {
  return {
    positive: "text-emerald-500",
    negative: "text-red-500",
    warning: "text-amber-500",
    neutral: "text-sky-500",
  }[kind];
}

/**
 * Hex strokes for Recharts (CSS classnames can't be passed to SVG stroke).
 * Aligned with sky / amber / violet badge accents used on repo cards.
 */
export const CHART_STROKE = {
  sky: "#0ea5e9",
  amber: "#f59e0b",
  violet: "#8b5cf6",
} as const;
