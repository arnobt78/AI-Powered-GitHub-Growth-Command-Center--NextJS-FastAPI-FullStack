import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Static imports are evaluated before this file's own top-level statements
// run (ESM module-evaluation order) — vi.stubEnv doesn't retroactively
// affect a module that already loaded with the real process.env value. Every
// test below dynamically imports the affected modules after stubbing, which
// genuinely re-evaluates their top-level `const SECRET = process.env.X`
// against the freshly stubbed value (same pattern as recording-auth.test.ts).
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

async function freshBackendClient() {
  vi.stubEnv("RECORDING_AUTH_SECRET", "test-only-recording-secret-do-not-use-in-prod");
  vi.stubEnv("INTERNAL_AUTH_SECRET", "test-only-internal-secret-do-not-use-in-prod");
  vi.resetModules();
  const backendClient = await import("@/lib/backend-client");
  const recordingAuth = await import("@/lib/recording-auth");
  const requestIdentity = await import("@/lib/request-identity");
  return { ...backendClient, ...recordingAuth, ...requestIdentity };
}

describe("backendFetch identity precedence", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mockAuth.mockReset();
  });

  it("uses the real session's githubId when one exists, even inside a recording context", async () => {
    const { backendFetch, mintRecordingToken, runWithRecordingToken } = await freshBackendClient();
    mockAuth.mockResolvedValue({ user: { id: "real-session-user" } });
    const token = mintRecordingToken(1, 1, "recording-user");

    await runWithRecordingToken(token, () => backendFetch("/repos/1"));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // mintInternalUserToken's payload embeds the sub — decode it to confirm
    // which identity actually won, rather than just asserting "a token exists".
    const payloadB64 = init.headers["X-Internal-User-Token"].split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    expect(payload.sub).toBe("real-session-user");
  });

  it("falls back to the recording identity when there is no real session", async () => {
    const { backendFetch, mintRecordingToken, runWithRecordingToken } = await freshBackendClient();
    mockAuth.mockResolvedValue(null);
    const token = mintRecordingToken(1, 1, "recording-user");

    await runWithRecordingToken(token, () => backendFetch("/repos/1"));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const payloadB64 = init.headers["X-Internal-User-Token"].split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    expect(payload.sub).toBe("recording-user");
  });

  it("throws 401 when there is neither a real session nor a recording context", async () => {
    const { backendFetch } = await freshBackendClient();
    mockAuth.mockResolvedValue(null);

    await expect(backendFetch("/repos/1")).rejects.toMatchObject({ status: 401 });
  });
});
