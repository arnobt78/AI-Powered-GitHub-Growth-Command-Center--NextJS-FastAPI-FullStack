from app.github_client import GitHubClient
from app.hackernews_client import HackerNewsClient
from app.pipeline.base import Stage
from app.pipeline.opportunity_base import OpportunityPipelineContext


class OpportunityExtractor(Stage):
    name = "opportunity_extractor"

    def __init__(self, hn_client: HackerNewsClient, gh_client: GitHubClient):
        self.hn_client = hn_client
        self.gh_client = gh_client

    def run(self, ctx: OpportunityPipelineContext) -> OpportunityPipelineContext:
        keyword = ctx.repo.name

        for hit in self.hn_client.search(keyword):
            ctx.opportunities.append({
                "source": "hacker_news",
                "external_id": hit["objectID"],
                "title": hit.get("title") or hit.get("story_title") or keyword,
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}",
            })

        for node in self.gh_client.search_discussions(keyword):
            ctx.opportunities.append({
                "source": "github_discussions",
                "external_id": node["id"],
                "title": node["title"],
                "url": node["url"],
            })

        return ctx
