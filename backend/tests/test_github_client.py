import httpx
import pytest

from app.github_client import GitHubAuthError, GitHubClient


@pytest.fixture
def mock_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/octocat/hello-world":
            return httpx.Response(200, json={"stargazers_count": 42, "forks_count": 7, "watchers_count": 42, "open_issues_count": 3})
        if request.url.path == "/repos/octocat/hello-world/traffic/views":
            return httpx.Response(200, json={"count": 100, "uniques": 50})
        if request.url.path == "/repos/octocat/hello-world/traffic/clones":
            return httpx.Response(200, json={"count": 20, "uniques": 10})
        if request.url.path == "/repos/octocat/hello-world/traffic/popular/referrers":
            return httpx.Response(200, json=[{"referrer": "google.com", "count": 5, "uniques": 3}])
        if request.url.path == "/repos/octocat/hello-world/traffic/popular/paths":
            return httpx.Response(200, json=[{"path": "/", "count": 10, "uniques": 8}])
        if request.url.path == "/repos/octocat/hello-world/readme":
            return httpx.Response(200, json={"content": "SGVsbG8="})
        if request.url.path == "/repos/octocat/hello-world/contents/LICENSE":
            return httpx.Response(200, json={})
        if request.url.path == "/search/repositories":
            return httpx.Response(200, json={"items": [{"full_name": "similar/repo", "stargazers_count": 100, "forks_count": 20, "topics": ["python"]}]})
        if request.url.path == "/repos/octocat/hello-world/releases":
            return httpx.Response(200, json=[
                {"tag_name": "v1.2.0", "body": "- Added dark mode\n- Fixed crash on startup", "published_at": "2026-07-20T00:00:00Z"},
                {"tag_name": "v1.1.0", "body": "- Initial release", "published_at": "2026-06-01T00:00:00Z"},
            ])
        if request.url.path == "/repos/octocat/hello-world/issues":
            return httpx.Response(200, json=[
                {"number": 42, "title": "Bug: crashes on startup", "body": "It crashes."},
                {"number": 41, "title": "PR: fix typo", "body": "Fixes a typo.", "pull_request": {"url": "https://api.github.com/..."}},
            ])
        if request.url.path == "/graphql" and request.method == "POST":
            body = request.read()
            import json as json_module
            payload = json_module.loads(body)
            if "discussions(" in payload["query"]:
                return httpx.Response(200, json={
                    "data": {"repository": {"discussions": {"nodes": [
                        {"id": "D_kwDOABCD1", "number": 7, "title": "How do I configure X?", "body": "Trying to set up X.", "url": "https://github.com/octocat/hello-world/discussions/7"},
                    ]}}}
                })
            if "hello-world" in payload["variables"]["searchQuery"]:
                return httpx.Response(200, json={
                    "data": {
                        "search": {
                            "nodes": [
                                {"id": "D_kwABC123", "title": "hello-world usage question", "url": "https://github.com/someone/other/discussions/5"}
                            ]
                        }
                    }
                })
            return httpx.Response(200, json={"data": {"search": {"nodes": []}}})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def gh_client(mock_transport):
    http = httpx.Client(base_url="https://api.github.com", transport=mock_transport)
    return GitHubClient(token="fake-token", http_client=http)


def test_get_repo(gh_client):
    data = gh_client.get_repo("octocat", "hello-world")
    assert data["stargazers_count"] == 42


def test_get_traffic_views(gh_client):
    data = gh_client.get_traffic_views("octocat", "hello-world")
    assert data["count"] == 100


def test_get_readme_decodes_base64(gh_client):
    text = gh_client.get_readme("octocat", "hello-world")
    assert text == "Hello"


def test_has_file_true(gh_client):
    assert gh_client.has_file("octocat", "hello-world", "LICENSE") is True


def test_has_file_false(gh_client):
    assert gh_client.has_file("octocat", "hello-world", "CONTRIBUTING.md") is False


def test_search_similar_repos(gh_client):
    results = gh_client.search_similar_repos(language="python", topic="cli", limit=5)
    assert results[0]["full_name"] == "similar/repo"


def test_get_repo_raises_github_auth_error_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "Bad credentials"})

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport, base_url="https://api.github.com")
    client = GitHubClient(token="expired-token", http_client=http_client)

    with pytest.raises(GitHubAuthError):
        client.get_repo("octocat", "hello-world")


def test_search_similar_repos_caches_across_instances():
    from app.github_client import GitHubClient

    GitHubClient._benchmark_cache.clear()
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        call_count["n"] += 1
        return httpx.Response(200, json={"items": [{"full_name": "torvalds/linux"}]})

    transport = httpx.MockTransport(handler)

    client_a = GitHubClient(token="token-a", http_client=httpx.Client(transport=transport, base_url="https://api.github.com"))
    client_b = GitHubClient(token="token-b", http_client=httpx.Client(transport=transport, base_url="https://api.github.com"))

    client_a.search_similar_repos(language="python", topic="cli", limit=5)
    client_b.search_similar_repos(language="python", topic="cli", limit=5)

    assert call_count["n"] == 1


def test_list_releases_returns_latest_first(gh_client):
    releases = gh_client.list_releases("octocat", "hello-world", limit=1)
    assert releases[0]["tag_name"] == "v1.2.0"


def test_list_releases_returns_empty_list_for_repo_with_no_releases():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    assert client.list_releases("octocat", "empty-repo") == []


def test_search_discussions_returns_nodes(gh_client):
    nodes = gh_client.search_discussions("hello-world")
    assert nodes[0]["id"] == "D_kwABC123"
    assert nodes[0]["title"] == "hello-world usage question"


def test_search_discussions_returns_empty_list_when_no_matches(gh_client):
    nodes = gh_client.search_discussions("no-such-repo-xyz")
    assert nodes == []


def test_search_discussions_raises_needs_reauth_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    with pytest.raises(GitHubAuthError):
        client.search_discussions("hello-world")


def test_search_discussions_handles_null_search_from_graphql_partial_error():
    """Test that explicit null values in GraphQL response (from resolver errors)
    don't crash with AttributeError but gracefully return empty list."""
    def handler(request: httpx.Request) -> httpx.Response:
        # GitHub's GraphQL API can return {"data": {"search": null}} for
        # certain partial errors (e.g. resolver timeouts) instead of omitting the key
        return httpx.Response(200, json={"data": {"search": None}})

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    nodes = client.search_discussions("test-query")
    assert nodes == []


def test_list_repo_issues_excludes_pull_requests(gh_client):
    issues = gh_client.list_repo_issues("octocat", "hello-world")
    assert len(issues) == 1
    assert issues[0]["number"] == 42
    assert issues[0]["title"] == "Bug: crashes on startup"


def test_list_repo_discussions_returns_nodes(gh_client):
    discussions = gh_client.list_repo_discussions("octocat", "hello-world")
    assert discussions[0]["number"] == 7
    assert discussions[0]["id"] == "D_kwDOABCD1"


def test_list_repo_discussions_null_safe_on_partial_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"repository": None}})

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    assert client.list_repo_discussions("octocat", "hello-world") == []


def test_list_repo_discussions_raises_needs_reauth_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    with pytest.raises(GitHubAuthError):
        client.list_repo_discussions("octocat", "hello-world")


def test_create_issue_comment_posts_body():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/octocat/hello-world/issues/42/comments":
            import json as json_module
            captured["body"] = json_module.loads(request.read())
            return httpx.Response(201, json={"id": 999, "body": captured["body"]["body"]})
        return httpx.Response(404)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    result = client.create_issue_comment("octocat", "hello-world", 42, "Thanks for the report!")

    assert captured["body"] == {"body": "Thanks for the report!"}
    assert result["id"] == 999


def test_create_issue_comment_raises_needs_reauth_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    with pytest.raises(GitHubAuthError):
        client.create_issue_comment("octocat", "hello-world", 42, "reply")


def test_create_discussion_comment_posts_mutation():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/graphql" and request.method == "POST":
            import json as json_module
            payload = json_module.loads(request.read())
            captured["variables"] = payload["variables"]
            return httpx.Response(200, json={"data": {"addDiscussionComment": {"comment": {"id": "DC_123"}}}})
        return httpx.Response(404)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    result = client.create_discussion_comment("D_kwDOABCD1", "Great question!")

    assert captured["variables"] == {"discussionId": "D_kwDOABCD1", "body": "Great question!"}
    assert result["data"]["addDiscussionComment"]["comment"]["id"] == "DC_123"


def test_create_discussion_comment_raises_needs_reauth_on_401():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    http = httpx.Client(base_url="https://api.github.com", transport=httpx.MockTransport(handler))
    client = GitHubClient(token="fake-token", http_client=http)

    with pytest.raises(GitHubAuthError):
        client.create_discussion_comment("D_kwDOABCD1", "reply")
