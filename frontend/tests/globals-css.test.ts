import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwindPostcss from "@tailwindcss/postcss";
import { describe, expect, it } from "vitest";

// Regression test for a bug that shipped twice: a prose comment in
// globals.css spelling out a literal "*/" (CSS's unescapable comment
// terminator) closed the comment early, silently turning the
// .glass/.glass-interactive rules into part of a dead selector — every
// glass surface in the app rendered as a no-op, in every build, and
// eslint/tsc/vitest/next-build all stayed green because none of them parse
// compiled CSS. This test does the one thing that actually catches it:
// compile the real stylesheet and assert the rules exist where expected.
describe("app/globals.css compiles the glass utility classes correctly", () => {
  it("produces .glass and .glass-interactive as real rules inside @layer components", async () => {
    const cssPath = path.resolve(__dirname, "../app/globals.css");
    const css = readFileSync(cssPath, "utf8");

    const result = await postcss([tailwindPostcss()]).process(css, { from: cssPath });
    const compiled = result.css;

    const layerMatch = compiled.match(/@layer components \{([\s\S]*?)\n\}\n/);
    expect(layerMatch, "expected a top-level @layer components block in the compiled CSS").not.toBeNull();
    const layerBody = layerMatch![1];

    // A regex anchored on "\n  .glass {" (not ".glass-interactive {") so the
    // bug's actual failure mode — .glass ending up nested inside a garbage
    // :is(...) selector instead of a real top-level rule — is what this
    // assertion structurally rejects, not just string-contains "background-color".
    expect(layerBody).toMatch(/\n {2}\.glass \{[^}]*background-color: var\(--glass-bg\)/);
    expect(layerBody).toMatch(/\n {2}\.glass-interactive \{[^}]*background-color: var\(--glass-bg\)/);
    expect(layerBody).toContain("border-color: var(--glass-border)");
    expect(layerBody).toContain("box-shadow: var(--glass-shadow)");
  });
});
