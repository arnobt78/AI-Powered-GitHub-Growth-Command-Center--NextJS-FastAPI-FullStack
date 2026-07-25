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
