import { NextResponse } from "next/server";
import { BackendError } from "@/lib/backend-client";
import { runWithRecordingToken } from "@/lib/request-identity";

// `request` is required (not optional) so every Route Handler that proxies
// to the backend genuinely supports being called during a demo-asset
// recording session — see lib/request-identity.ts. Extracts recording_token
// from either the query string (client-side TanStack Query fetches append
// it there, see lib/fetch-json.ts) or an X-Recording-Token header.
//
// GET only: the recorder (backend/app/demo_recorder.py) only ever navigates
// and reads, never submits anything, so the token only needs to unlock
// reads. recordingIdentityFromToken deliberately isn't repo-scoped (unlike
// the page gate in auth.ts) — the backend's per-user query filtering is
// what actually authorizes each read. Honoring it on POST/PATCH/DELETE too
// would turn a token meant for one read-only page into a general-purpose,
// if short-lived, write credential for the whole account.
export async function proxyRoute<T>(request: Request, fn: () => Promise<T>, successStatus = 200) {
  const recordingToken =
    request.method === "GET"
      ? (new URL(request.url).searchParams.get("recording_token") ?? request.headers.get("x-recording-token"))
      : null;

  return runWithRecordingToken(recordingToken, async () => {
    try {
      const data = await fn();
      if (data === undefined) {
        return new NextResponse(null, { status: 204 });
      }
      return NextResponse.json(data, { status: successStatus });
    } catch (error) {
      if (error instanceof BackendError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  });
}
