import { auth } from "@/auth";
import { mintInternalUserToken } from "@/lib/internal-auth";

const BASE_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const API_KEY = process.env.BACKEND_API_KEY ?? "";

// Streams the raw video bytes through to the browser — unlike every other
// Route Handler in this codebase (which proxies JSON via proxyRoute), this
// bypasses backendFetch/proxyRoute entirely so the response body is piped
// straight from the backend without buffering or JSON parsing.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const githubId = session?.user?.id;
  if (!githubId) {
    return new Response("Not authenticated", { status: 401 });
  }

  const range = request.headers.get("range");

  const res = await fetch(`${BASE_URL}/demo-assets/${id}/video`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "X-Internal-User-Token": mintInternalUserToken(githubId),
      ...(range ? { Range: range } : {}),
    },
  });

  // Forward the backend's range-response headers too (FastAPI's FileResponse
  // supports Range and replies 206 + these) — without them the browser sees
  // a body of unknown length and can't seek; Safari commonly refuses <video>
  // playback outright without byte-range support.
  const headers: Record<string, string> = { "Content-Type": res.headers.get("content-type") ?? "video/mp4" };
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = res.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return new Response(res.body, { status: res.status, headers });
}
