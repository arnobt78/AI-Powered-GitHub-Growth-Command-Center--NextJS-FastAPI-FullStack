import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// route-handler.ts imports backend-client.ts (for the BackendError class),
// which imports @/auth — next-auth doesn't resolve cleanly under vitest's
// jsdom environment without this mock, same as backend-client.test.ts.
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(null) }));

// Same ESM-import-ordering rationale as backend-client.test.ts /
// recording-auth.test.ts: dynamically import after stubbing envs.
async function freshModules() {
  vi.stubEnv("RECORDING_AUTH_SECRET", "test-only-recording-secret-do-not-use-in-prod");
  vi.resetModules();
  const routeHandler = await import("@/lib/route-handler");
  const recordingAuth = await import("@/lib/recording-auth");
  const requestIdentity = await import("@/lib/request-identity");
  return { ...routeHandler, ...recordingAuth, ...requestIdentity };
}

describe("proxyRoute recording-token scope", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the recording identity for a GET request carrying a valid token", async () => {
    const { proxyRoute, mintRecordingToken, getRecordingIdentity } = await freshModules();
    const token = mintRecordingToken(1, 1, "recording-user");
    const request = new Request(`http://localhost/api/repos/1?recording_token=${token}`, { method: "GET" });

    let seenDuringCall: string | null = null;
    await proxyRoute(request, async () => {
      seenDuringCall = getRecordingIdentity();
      return { ok: true };
    });

    expect(seenDuringCall).toBe("recording-user");
  });

  it("resolves the recording identity for a GET request carrying the token as a header", async () => {
    const { proxyRoute, mintRecordingToken, getRecordingIdentity } = await freshModules();
    const token = mintRecordingToken(1, 1, "recording-user");
    const request = new Request("http://localhost/api/repos/1", {
      method: "GET",
      headers: { "X-Recording-Token": token },
    });

    let seenDuringCall: string | null = null;
    await proxyRoute(request, async () => {
      seenDuringCall = getRecordingIdentity();
      return { ok: true };
    });

    expect(seenDuringCall).toBe("recording-user");
  });

  it("ignores a valid recording token on a POST request (I-1: reads only, never a write credential)", async () => {
    const { proxyRoute, mintRecordingToken, getRecordingIdentity } = await freshModules();
    const token = mintRecordingToken(1, 1, "recording-user");
    const request = new Request(`http://localhost/api/repos?recording_token=${token}`, { method: "POST" });

    let seenDuringCall: string | null = "unset";
    await proxyRoute(request, async () => {
      seenDuringCall = getRecordingIdentity();
      return { ok: true };
    });

    expect(seenDuringCall).toBeNull();
  });

  it("ignores a valid recording token on a DELETE request", async () => {
    const { proxyRoute, mintRecordingToken, getRecordingIdentity } = await freshModules();
    const token = mintRecordingToken(1, 1, "recording-user");
    const request = new Request(`http://localhost/api/repos/1?recording_token=${token}`, { method: "DELETE" });

    let seenDuringCall: string | null = "unset";
    await proxyRoute(request, async () => {
      seenDuringCall = getRecordingIdentity();
      return { ok: true };
    });

    expect(seenDuringCall).toBeNull();
  });
});
