/**
 * Extract plain text suitable for clipboard from a draft's content payload.
 * Returns null when there is nothing useful to copy for that kind/shape.
 * Applies the same display-side LLM-noise strip so clipboard matches the UI.
 */

import { stripLlmNoise } from "@/lib/strip-llm-noise";

export function suggestedTextForCopy(kind: string, content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;

  if (
    kind === "readme_suggestion" ||
    kind === "missing_doc_suggestion" ||
    kind === "release_notes" ||
    kind === "issue_reply" ||
    kind === "discussion_reply"
  ) {
    return typeof c.suggested === "string" ? stripLlmNoise(c.suggested) : null;
  }

  if (kind === "seo_suggestion" && typeof c.suggested_description === "string") {
    const keywords = Array.isArray(c.keywords)
      ? (c.keywords as unknown[]).filter((k): k is string => typeof k === "string")
      : [];
    const desc = stripLlmNoise(c.suggested_description);
    return keywords.length > 0
      ? `${desc}\n\nKeywords: ${keywords.join(", ")}`
      : desc;
  }

  if (kind === "topic_suggestion" && Array.isArray(c.suggested)) {
    const topics = (c.suggested as unknown[]).filter((t): t is string => typeof t === "string");
    return topics.length > 0 ? topics.join(", ") : null;
  }

  return null;
}
