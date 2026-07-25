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
