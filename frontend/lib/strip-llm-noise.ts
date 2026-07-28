/**
 * Strip model-internal reasoning / chain-of-thought blocks from display text.
 *
 * WHY display-only: stored Draft.content stays raw for debugging; we only
 * sanitize what the user sees in the inbox. Covers common provider tags
 * (e.g. ``<think>…</think>``) that otherwise leak into README/doc drafts.
 */

const REASONING_BLOCK =
  /<\s*(?:think|thinking|reasoning|redacted_reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*(?:think|thinking|reasoning|redacted_reasoning)\s*>/gi;

export function stripLlmNoise(text: string): string {
  return text.replace(REASONING_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Recursively clean string fields in a draft content payload for display. */
export function stripLlmNoiseDeep(value: unknown): unknown {
  if (typeof value === "string") return stripLlmNoise(value);
  if (Array.isArray(value)) return value.map(stripLlmNoiseDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripLlmNoiseDeep(v);
    }
    return out;
  }
  return value;
}
