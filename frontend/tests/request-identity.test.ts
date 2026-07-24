import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshModules(secret: string) {
  vi.stubEnv("RECORDING_AUTH_SECRET", secret);
  vi.resetModules();
  const recordingAuth = await import("@/lib/recording-auth");
  const requestIdentity = await import("@/lib/request-identity");
  return { ...recordingAuth, ...requestIdentity };
}

describe("runWithRecordingToken / getRecordingIdentity", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the token's github_id inside the callback", async () => {
    const { mintRecordingToken, runWithRecordingToken, getRecordingIdentity } = await freshModules(
      "test-only-recording-secret-do-not-use-in-prod",
    );
    const token = mintRecordingToken(42, 7, "12345");

    const result = runWithRecordingToken(token, () => getRecordingIdentity());
    expect(result).toBe("12345");
  });

  it("returns null outside any runWithRecordingToken call", async () => {
    const { getRecordingIdentity } = await freshModules("test-only-recording-secret-do-not-use-in-prod");
    expect(getRecordingIdentity()).toBeNull();
  });

  it("runs the callback directly (no context) when the token is null/undefined", async () => {
    const { runWithRecordingToken, getRecordingIdentity } = await freshModules("test-only-recording-secret-do-not-use-in-prod");

    expect(runWithRecordingToken(null, () => getRecordingIdentity())).toBeNull();
    expect(runWithRecordingToken(undefined, () => getRecordingIdentity())).toBeNull();
  });

  it("resolves to null inside the callback when the token is invalid", async () => {
    const { runWithRecordingToken, getRecordingIdentity } = await freshModules("test-only-recording-secret-do-not-use-in-prod");
    const result = runWithRecordingToken("not-a-real-token", () => getRecordingIdentity());
    expect(result).toBeNull();
  });

  it("does not leak identity across nested calls with different tokens", async () => {
    const { mintRecordingToken, runWithRecordingToken, getRecordingIdentity } = await freshModules(
      "test-only-recording-secret-do-not-use-in-prod",
    );
    const tokenA = mintRecordingToken(1, 1, "user-a");
    const tokenB = mintRecordingToken(2, 2, "user-b");

    const outer = runWithRecordingToken(tokenA, () => {
      const inner = runWithRecordingToken(tokenB, () => getRecordingIdentity());
      return { inner, afterInner: getRecordingIdentity() };
    });

    expect(outer.inner).toBe("user-b");
    expect(outer.afterInner).toBe("user-a");
  });
});
