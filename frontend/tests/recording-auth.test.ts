import { describe, expect, it, vi } from "vitest";

vi.stubEnv("RECORDING_AUTH_SECRET", "test-only-recording-secret-do-not-use-in-prod");

import { isAuthorizedRecordingRequest, mintRecordingToken, verifyRecordingToken } from "@/lib/recording-auth";

describe("mintRecordingToken / verifyRecordingToken", () => {
  it("round-trips a valid token", () => {
    const token = mintRecordingToken(42, 7);
    expect(verifyRecordingToken(token)).toEqual({ repoId: 42, userId: 7 });
  });

  it("rejects a tampered signature", () => {
    const token = mintRecordingToken(42, 7);
    const [payloadB64] = token.split(".");
    expect(verifyRecordingToken(`${payloadB64}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const token = mintRecordingToken(42, 7);
    vi.advanceTimersByTime(301_000);
    expect(verifyRecordingToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects a malformed token", () => {
    expect(verifyRecordingToken("not-a-real-token")).toBeNull();
  });

  it("produces a different signature for a different secret", async () => {
    const tokenA = mintRecordingToken(42, 7);

    vi.stubEnv("RECORDING_AUTH_SECRET", "a-different-secret");
    vi.resetModules();
    const { mintRecordingToken: mintWithDifferentSecret } = await import("@/lib/recording-auth");
    const tokenB = mintWithDifferentSecret(42, 7);

    const [, signatureA] = tokenA.split(".");
    const [, signatureB] = tokenB.split(".");
    expect(signatureA).not.toBe(signatureB);
  });
});

describe("isAuthorizedRecordingRequest", () => {
  function requestFor(url: string) {
    return { nextUrl: new URL(url, "http://localhost") };
  }

  it("authorizes a request whose token repo_id matches the requested repo page", () => {
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/repos/42?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(true);
  });

  it("rejects a token minted for a different repo than the one requested", () => {
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/repos/99?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });

  it("rejects a request with no recording_token at all", () => {
    const request = requestFor("/repos/42");
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });

  it("rejects a valid token used against a non-repo-detail path", () => {
    const token = mintRecordingToken(42, 7);
    const request = requestFor(`/settings?recording_token=${token}`);
    expect(isAuthorizedRecordingRequest(request)).toBe(false);
  });
});
