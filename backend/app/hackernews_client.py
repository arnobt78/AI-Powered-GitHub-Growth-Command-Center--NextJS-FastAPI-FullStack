import httpx


class HackerNewsClient:
    """Thin wrapper around Algolia's public HN Search API. No auth required.
    Mirrors GitHubClient's DI-testable httpx.Client shape for consistency,
    even though it holds no credentials."""

    def __init__(self, http_client: httpx.Client | None = None):
        self._http = http_client or httpx.Client(base_url="https://hn.algolia.com/api/v1", timeout=15.0)

    def search(self, query: str, limit: int = 5) -> list[dict]:
        resp = self._http.get("/search", params={"query": query, "tags": "story", "hitsPerPage": limit})
        resp.raise_for_status()
        return resp.json().get("hits", [])
