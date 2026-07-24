export class ClientFetchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The page DemoRecorder navigates to carries ?recording_token=... in its own
// URL (see app/repos/[id]/page.tsx). Client-side hooks fire further fetches
// to /api/* after hydration — this forwards that same token as a header so
// lib/route-handler.ts's proxyRoute can resolve a backend identity for
// those too, without every hook needing its own awareness of recording.
function recordingTokenHeader(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  const token = new URLSearchParams(window.location.search).get("recording_token");
  return token ? { "X-Recording-Token": token } : {};
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...recordingTokenHeader(), ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ClientFetchError(res.status, body.error ?? res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
