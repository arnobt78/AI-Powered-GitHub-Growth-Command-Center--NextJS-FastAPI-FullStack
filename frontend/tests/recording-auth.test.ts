import { beforeEach, describe, expect, it, vi } from "vitest";

// Static imports are evaluated before this file's own top-level statements
// run (ESM module-evaluation order), so a `vi.stubEnv` call written above a
// static `import` does NOT actually run before that module's top-level
// `const SECRET = process.env.X` executes — the module always sees whatever
// was in process.env before this file loaded. Every test below instead
// stubs the env var and then dynamically re-imports the module inside the
// test itself (or a shared beforeEach), which genuinely re-evaluates
// lib/recording-auth.ts's top-level code against the freshly stubbed value.
async function freshModule(secret: string) {
  vi.stubEnv("RECORDING_AUTH_SECRET", secret);
  vi.resetModules();
  return import("@/lib/recording-auth");
}

describe("mintRecordingToken / verifyRecordingToken", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a valid token", async () => {
    const { mintRecordingToken, verifyRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    expect(verifyRecordingToken(token)).toEqual({ repoId: 42, userId: 7 });
  });

  it("rejects a tampered signature (short)", async () => {
    const { mintRecordingToken, verifyRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const [payloadB64] = token.split(".");
    expect(verifyRecordingToken(`${payloadB64}.deadbeef`)).toBeNull();
  });

  it("rejects a tampered signature that's the right length (exercises the constant-time compare, not just the length check)", async () => {
    const { mintRecordingToken, verifyRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const [payloadB64, signature] = token.split(".");
    const wrongSameLength = signature.slice(0, -2) + (signature.slice(-2) === "00" ? "11" : "00");
    expect(verifyRecordingToken(`${payloadB64}.${wrongSameLength}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { mintRecordingToken, verifyRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    vi.useFakeTimers();
    const token = mintRecordingToken(42, 7);
    vi.advanceTimersByTime(61_000);
    expect(verifyRecordingToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects a malformed token", async () => {
    const { verifyRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    expect(verifyRecordingToken("not-a-real-token")).toBeNull();
  });

  it("fails closed (rejects every token) when the secret is unset, rather than verifying against a predictable empty key", async () => {
    const { mintRecordingToken } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);

    const { verifyRecordingToken: verifyWithNoSecret } = await freshModule("");
    expect(verifyWithNoSecret(token)).toBeNull();
  });

  it("produces a different signature for a different secret", async () => {
    const { mintRecordingToken: mintA } = await freshModule("secret-a");
    const tokenA = mintA(42, 7);

    const { mintRecordingToken: mintB } = await freshModule("secret-b");
    const tokenB = mintB(42, 7);

    const [, signatureA] = tokenA.split(".");
    const [, signatureB] = tokenB.split(".");
    expect(signatureA).not.toBe(signatureB);
  });
});

describe("isAuthorizedRecordingRequest", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  function requestFor(url: string) {
    return { nextUrl: new URL(url, "http://localhost") };
  }

  it("authorizes a request whose token repo_id matches the requested repo page", async () => {
    const { mintRecordingToken, isAuthorizedRecordingRequest } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/repos/42?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(true);
  });

  it("rejects a token minted for a different repo than the one requested", async () => {
    const { mintRecordingToken, isAuthorizedRecordingRequest } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/repos/99?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });

  it("rejects a request with no recording_token at all", async () => {
    const { isAuthorizedRecordingRequest } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const request = requestFor("/repos/42");
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });

  it("rejects a valid token used against a non-repo-detail path", async () => {
    const { mintRecordingToken, isAuthorizedRecordingRequest } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/settings?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });

  it("rejects a valid token used against a descendant path of the repo it's scoped to", async () => {
    const { mintRecordingToken, isAuthorizedRecordingRequest } = await freshModule("test-only-recording-secret-do-not-use-in-prod");
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/repos/42/settings?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });
});
