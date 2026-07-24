import base64
import time

import httpx


class GitHubAuthError(Exception):
    """Raised when GitHub rejects the current token (expired/revoked) — lets
    the pipeline runner (app/pipeline/jobs.py) stop retrying that user's
    repos for the rest of the run instead of hammering a dead token."""


class GitHubClient:
    # Process-wide, shared across every GitHubClient instance/user — search
    # results for a given language+topic are the same public data regardless
    # of who's asking, so sharing this cache is a real efficiency win, not a
    # data leak. 1-hour TTL: benchmark data doesn't need to be fresher than that.
    _benchmark_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}
    _BENCHMARK_CACHE_TTL_SECONDS = 3600

    def __init__(self, token: str, http_client: httpx.Client | None = None):
        self._http = http_client or httpx.Client(
            base_url="https://api.github.com",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=15.0,
        )

    def _get(self, path: str, **kwargs) -> httpx.Response:
        resp = self._http.get(path, **kwargs)
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected for {path}")
        resp.raise_for_status()
        return resp

    def get_repo(self, owner: str, name: str) -> dict:
        return self._get(f"/repos/{owner}/{name}").json()

    def get_traffic_views(self, owner: str, name: str) -> dict:
        return self._get(f"/repos/{owner}/{name}/traffic/views").json()

    def get_traffic_clones(self, owner: str, name: str) -> dict:
        return self._get(f"/repos/{owner}/{name}/traffic/clones").json()

    def get_referrers(self, owner: str, name: str) -> list[dict]:
        return self._get(f"/repos/{owner}/{name}/traffic/popular/referrers").json()

    def get_popular_paths(self, owner: str, name: str) -> list[dict]:
        return self._get(f"/repos/{owner}/{name}/traffic/popular/paths").json()

    def get_readme(self, owner: str, name: str) -> str | None:
        resp = self._http.get(f"/repos/{owner}/{name}/readme")
        if resp.status_code == 404:
            return None
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected for /repos/{owner}/{name}/readme")
        resp.raise_for_status()
        content = resp.json().get("content", "")
        return base64.b64decode(content).decode("utf-8", errors="replace")

    def has_file(self, owner: str, name: str, path: str) -> bool:
        resp = self._http.get(f"/repos/{owner}/{name}/contents/{path}")
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected for /repos/{owner}/{name}/contents/{path}")
        return resp.status_code == 200

    def search_similar_repos(self, language: str, topic: str, limit: int = 5) -> list[dict]:
        cache_key = (language, topic)
        cached = GitHubClient._benchmark_cache.get(cache_key)
        if cached and (time.time() - cached[0]) < self._BENCHMARK_CACHE_TTL_SECONDS:
            return cached[1][:limit]

        query = f"language:{language} topic:{topic}"
        items = self._get("/search/repositories", params={"q": query, "sort": "stars", "per_page": limit}).json().get("items", [])
        GitHubClient._benchmark_cache[cache_key] = (time.time(), items)
        return items

    def list_releases(self, owner: str, name: str, limit: int = 2) -> list[dict]:
        return self._get(f"/repos/{owner}/{name}/releases", params={"per_page": limit}).json()

    def list_repo_issues(self, owner: str, name: str, limit: int = 20) -> list[dict]:
        """Open issues only, newest first, PRs excluded — GitHub's issues
        endpoint returns PRs as a subtype (each carries a 'pull_request' key)."""
        resp = self._get(
            f"/repos/{owner}/{name}/issues",
            params={"state": "open", "sort": "created", "direction": "desc", "per_page": limit},
        )
        return [issue for issue in resp.json() if "pull_request" not in issue]

    def list_repo_discussions(self, owner: str, name: str, limit: int = 10) -> list[dict]:
        graphql_query = """
        query($owner: String!, $name: String!, $limit: Int!) {
          repository(owner: $owner, name: $name) {
            discussions(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
              nodes { id number title body url }
            }
          }
        }
        """
        resp = self._http.post(
            "/graphql",
            json={"query": graphql_query, "variables": {"owner": owner, "name": name, "limit": limit}},
        )
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected listing discussions for {owner}/{name}")
        resp.raise_for_status()
        data = resp.json().get("data") or {}
        repo = data.get("repository") or {}
        discussions = repo.get("discussions") or {}
        return discussions.get("nodes") or []

    def search_discussions(self, query: str, limit: int = 5) -> list[dict]:
        graphql_query = """
        query($searchQuery: String!, $limit: Int!) {
          search(query: $searchQuery, type: DISCUSSION, first: $limit) {
            nodes {
              ... on Discussion {
                id
                title
                url
              }
            }
          }
        }
        """
        resp = self._http.post(
            "/graphql", json={"query": graphql_query, "variables": {"searchQuery": query, "limit": limit}}
        )
        if resp.status_code == 401:
            raise GitHubAuthError(f"needs_reauth: GitHub token rejected for GraphQL search '{query}'")
        resp.raise_for_status()
        data = resp.json().get("data") or {}
        search = data.get("search") or {}
        return search.get("nodes") or []
