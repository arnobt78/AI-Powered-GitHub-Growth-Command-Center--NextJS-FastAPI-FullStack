/**
 * BFF proxy for the backend SSE stream.
 *
 * Educational walkthrough: the browser connects to `/api/events` (same origin).
 * This handler attaches API key + internal user token and pipes the FastAPI
 * EventSource response through — secrets never leave the server.
 *
 * WHY expected disconnects are swallowed: when the FastAPI process restarts
 * (or the peer closes the socket), undici/Node raises SocketError ("other
 * side closed") while Next is piping the body. That is normal for long-lived
 * SSE — browser EventSource auto-reconnects. Without swallowing, Next wraps
 * it as "failed to pipe response" and Sentry's onRequestError treats it as
 * a High production error.
 */

import { auth } from "@/auth";
import { mintInternalUserToken } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/** Peer-close / reset while piping SSE — not an app bug. */
function isExpectedSseDisconnect(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; cause?: unknown; name?: string };
  const msg = String(e.message ?? "").toLowerCase();
  const code = String(e.code ?? "");
  if (
    msg.includes("other side closed") ||
    msg.includes("aborted") ||
    msg.includes("socket") ||
    code === "ECONNRESET" ||
    code === "UND_ERR_SOCKET" ||
    e.name === "AbortError"
  ) {
    return true;
  }
  if (e.cause) return isExpectedSseDisconnect(e.cause);
  return false;
}

/**
 * Re-emit the backend SSE body but end cleanly on expected peer disconnect
 * so Next's pipeToNodeResponse never rejects into captureRequestError.
 */
function resilientSseBody(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        if (isExpectedSseDisconnect(err)) {
          try {
            controller.close();
          } catch {
            // already closed
          }
          return;
        }
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export async function GET() {
  const session = await auth();
  const githubId = session?.user?.id;
  if (!githubId) {
    return new Response(null, { status: 401 });
  }

  const baseUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const apiKey = process.env.BACKEND_API_KEY ?? "";

  let backendResponse: Response;
  try {
    // Stream from FastAPI; do not buffer the whole response in memory.
    backendResponse = await fetch(`${baseUrl}/events`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Internal-User-Token": mintInternalUserToken(githubId),
      },
      cache: "no-store",
    });
  } catch {
    // Backend down / connection refused — EventSource will retry automatically.
    return new Response(null, { status: 503 });
  }

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response(null, {
      status: backendResponse.status || 502,
    });
  }

  return new Response(resilientSseBody(backendResponse.body), {
    status: backendResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
