from unittest.mock import MagicMock

from app.models import Repo
from app.pipeline.opportunities.extractor import OpportunityExtractor
from app.pipeline.opportunity_base import OpportunityPipelineContext


def _fake_hn_client():
    hn = MagicMock()
    hn.search.return_value = [
        {"objectID": "111", "title": "Show HN: hello-world", "url": "https://example.com/hello-world"},
    ]
    return hn


def _fake_gh_client():
    gh = MagicMock()
    gh.search_discussions.return_value = [
        {"id": "D_kwABC123", "title": "hello-world usage question", "url": "https://github.com/someone/other/discussions/5"},
    ]
    return gh


def test_extractor_combines_hn_and_discussion_hits():
    repo = Repo(owner="octocat", name="hello-world")
    ctx = OpportunityPipelineContext(repo=repo)
    hn = _fake_hn_client()
    gh = _fake_gh_client()

    ctx = OpportunityExtractor(hn_client=hn, gh_client=gh).run(ctx)

    assert len(ctx.opportunities) == 2
    hn_item = next(o for o in ctx.opportunities if o["source"] == "hacker_news")
    assert hn_item["external_id"] == "111"
    assert hn_item["title"] == "Show HN: hello-world"
    assert hn_item["url"] == "https://example.com/hello-world"

    gh_item = next(o for o in ctx.opportunities if o["source"] == "github_discussions")
    assert gh_item["external_id"] == "D_kwABC123"
    assert gh_item["title"] == "hello-world usage question"

    hn.search.assert_called_once_with("hello-world")
    gh.search_discussions.assert_called_once_with("hello-world")


def test_extractor_falls_back_to_hn_permalink_when_no_url():
    repo = Repo(owner="octocat", name="hello-world")
    ctx = OpportunityPipelineContext(repo=repo)
    hn = MagicMock()
    hn.search.return_value = [{"objectID": "222", "title": None, "story_title": "hello-world discussion", "url": None}]
    gh = MagicMock()
    gh.search_discussions.return_value = []

    ctx = OpportunityExtractor(hn_client=hn, gh_client=gh).run(ctx)

    assert ctx.opportunities[0]["title"] == "hello-world discussion"
    assert ctx.opportunities[0]["url"] == "https://news.ycombinator.com/item?id=222"
