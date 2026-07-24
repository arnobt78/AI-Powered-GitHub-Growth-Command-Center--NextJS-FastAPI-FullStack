import httpx
import pytest

from app.hackernews_client import HackerNewsClient


@pytest.fixture
def mock_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/search":
            assert request.url.params["query"] == "hello-world"
            return httpx.Response(200, json={
                "hits": [
                    {"objectID": "111", "title": "Show HN: hello-world", "url": "https://example.com/hello-world"},
                    {"objectID": "222", "title": None, "story_title": "hello-world discussion", "url": None},
                ]
            })
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def hn_client(mock_transport):
    http = httpx.Client(base_url="https://hn.algolia.com/api/v1", transport=mock_transport)
    return HackerNewsClient(http_client=http)


def test_search_returns_hits(hn_client):
    hits = hn_client.search("hello-world")
    assert hits[0]["objectID"] == "111"
    assert hits[0]["title"] == "Show HN: hello-world"


def test_search_raises_on_http_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    http = httpx.Client(base_url="https://hn.algolia.com/api/v1", transport=httpx.MockTransport(handler))
    client = HackerNewsClient(http_client=http)

    with pytest.raises(httpx.HTTPStatusError):
        client.search("hello-world")
