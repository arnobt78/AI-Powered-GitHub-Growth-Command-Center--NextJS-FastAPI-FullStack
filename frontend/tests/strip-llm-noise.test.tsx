import { describe, expect, it } from "vitest";
import { stripLlmNoise } from "@/lib/strip-llm-noise";
import { suggestedTextForCopy } from "@/lib/draft-copy";

describe("stripLlmNoise", () => {
  it("removes think blocks and trims leftover blank lines", () => {
    const raw = "<think>\nsecret plan\n</think>\n\n\n# Title\n\nBody";
    expect(stripLlmNoise(raw)).toBe("# Title\n\nBody");
  });
});

describe("suggestedTextForCopy", () => {
  it("returns suggested markdown for readme_suggestion", () => {
    expect(
      suggestedTextForCopy("readme_suggestion", { current: "# Old", suggested: "# New", reason: null }),
    ).toBe("# New");
  });

  it("strips think blocks from copied suggested text", () => {
    expect(
      suggestedTextForCopy("missing_doc_suggestion", {
        suggested: "<think>plan</think>\n# Doc",
        reason: null,
      }),
    ).toBe("# Doc");
  });

  it("joins topic suggestions with commas", () => {
    expect(suggestedTextForCopy("topic_suggestion", { current: [], suggested: ["a", "b"], reason: null })).toBe(
      "a, b",
    );
  });

  it("returns null when shape is unknown", () => {
    expect(suggestedTextForCopy("readme_suggestion", { foo: 1 })).toBeNull();
  });
});
