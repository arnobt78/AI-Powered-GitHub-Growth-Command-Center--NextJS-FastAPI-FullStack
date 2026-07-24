import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { recordingIdentityFromToken } from "@/lib/recording-auth";

// Bridges a recording_token's resolved identity to backendFetch, which has
// no direct access to the incoming request (it's called deep inside lib/
// api.ts's methods). Each entry point that legitimately has the request —
// app/repos/[id]/page.tsx for SSR, lib/route-handler.ts's proxyRoute for
// every /api/* Route Handler — wraps its work in runWithRecordingToken so
// nested backendFetch calls can fall back to this instead of a real
// session, without threading a token parameter through 25+ api.ts methods.
const storage = new AsyncLocalStorage<string | null>();

export function getRecordingIdentity(): string | null {
  return storage.getStore() ?? null;
}

export function runWithRecordingToken<T>(token: string | null | undefined, fn: () => T): T {
  if (!token) {
    return fn();
  }
  return storage.run(recordingIdentityFromToken(token), fn);
}
