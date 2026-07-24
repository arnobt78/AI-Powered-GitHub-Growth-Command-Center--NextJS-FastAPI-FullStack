import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: "12345" } }) }));

import { GET } from "@/app/api/demo-assets/[id]/video/route";

function backendResponse(init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response("fake video bytes", {
    status: init.status ?? 200,
    headers: { "content-type": "video/mp4", ...init.headers },
  });
}

type FetchCall = [string, { headers: Record<string, string> }];

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(...args: FetchCall) => Promise<Response>>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/demo-assets/[id]/video — Range forwarding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards an inbound Range header to the backend", async () => {
    const fetchMock = stubFetch(backendResponse());

    const request = new Request("http://localhost/api/demo-assets/1/video", {
      headers: { Range: "bytes=0-1023" },
    });
    await GET(request, { params: Promise.resolve({ id: "1" }) });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Range).toBe("bytes=0-1023");
  });

  it("does not send a Range header to the backend when the browser didn't send one", async () => {
    const fetchMock = stubFetch(backendResponse());

    const request = new Request("http://localhost/api/demo-assets/1/video");
    await GET(request, { params: Promise.resolve({ id: "1" }) });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Range).toBeUndefined();
  });

  it("forwards the backend's 206 status and range-response headers back to the browser", async () => {
    stubFetch(
      backendResponse({
        status: 206,
        headers: { "content-range": "bytes 0-1023/2048", "content-length": "1024", "accept-ranges": "bytes" },
      }),
    );

    const request = new Request("http://localhost/api/demo-assets/1/video", { headers: { Range: "bytes=0-1023" } });
    const response = await GET(request, { params: Promise.resolve({ id: "1" }) });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1023/2048");
    expect(response.headers.get("content-length")).toBe("1024");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });
});
