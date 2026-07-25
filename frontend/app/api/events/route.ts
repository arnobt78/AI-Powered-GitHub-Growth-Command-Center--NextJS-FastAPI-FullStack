/**
 * BFF proxy for the backend SSE stream.
 *
 * Educational walkthrough: the browser connects to `/api/events` (same origin).
 * This handler attaches API key + internal user token and pipes the FastAPI
 * EventSource response through — secrets never leave the server.
 */

import { auth } from "@/auth";
import { mintInternalUserToken } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const githubId = session?.user?.id;
  if (!githubId) {
    return new Response(null, { status: 401 });
  }

  const baseUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const apiKey = process.env.BACKEND_API_KEY ?? "";

  // Stream from FastAPI; do not buffer the whole response in memory.
  const backendResponse = await fetch(`${baseUrl}/events`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Internal-User-Token": mintInternalUserToken(githubId),
    },
    cache: "no-store",
  });

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
