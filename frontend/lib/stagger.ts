import type { CSSProperties } from "react";

// A shared timing curve so every mapped list in the app staggers consistently
// instead of each component picking its own magic numbers. Capped so a
// 50-item list doesn't take seconds to finish its entrance animation.
export function staggerDelay(index: number, stepMs = 60, capMs = 480): CSSProperties {
  return { animationDelay: `${Math.min(index * stepMs, capMs)}ms` };
}
