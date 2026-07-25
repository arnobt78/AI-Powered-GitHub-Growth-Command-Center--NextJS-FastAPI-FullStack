// Stub for Task 6 (ProviderStatusTable needs a "neutral" tone before the
// full semantic-color system lands in Task 13). Signature must not narrow —
// Task 13 expands usage elsewhere against this same contract.
export function semanticColor(kind: "positive" | "negative" | "warning" | "neutral"): string {
  return { positive: "text-emerald-500", negative: "text-red-500", warning: "text-amber-500", neutral: "text-sky-500" }[kind];
}
