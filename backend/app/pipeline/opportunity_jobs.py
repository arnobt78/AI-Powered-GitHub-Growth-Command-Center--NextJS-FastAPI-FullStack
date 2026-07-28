"""Wire opportunities stages; daily/on-demand community scan entrypoints."""

from sqlalchemy.orm import Session

from app.events import broadcaster
from app.github_client import GitHubClient
from app.hackernews_client import HackerNewsClient
from app.models import Repo, User
from app.pipeline.opportunities.assembler import OpportunityAssembler
from app.pipeline.opportunities.extractor import OpportunityExtractor
from app.pipeline.opportunity_base import OpportunityPipelineContext
from app.pipeline.runner import PipelineRunner
from app.token_crypto import decrypt_token


def run_opportunities_pipeline_for_all_repos(db: Session, user_id: int | None = None) -> None:
    hn_client = HackerNewsClient()

    query = db.query(Repo)
    if user_id is not None:
        query = query.filter(Repo.user_id == user_id)
    repos = query.all()

    failed_auth_user_ids: set[int] = set()
    processed_user_ids: set[int] = set()

    for repo in repos:
        if repo.user_id in failed_auth_user_ids:
            continue

        # Captured before the try — see app.pipeline.jobs.run_pipeline_for_all_repos
        # for why: db.rollback() below expires every session-tracked object, so a
        # post-rollback `repo.user_id` access could itself raise.
        repo_user_id = repo.user_id
        try:
            owner = db.get(User, repo_user_id)
            gh_client = GitHubClient(token=decrypt_token(owner.access_token_encrypted))
        except Exception:
            # Same CAPA-0001 rationale as app.pipeline.jobs.run_pipeline_for_all_repos:
            # this shares PipelineRunner's db session, so roll back before the loop
            # reuses it for the next repo.
            db.rollback()
            failed_auth_user_ids.add(repo_user_id)
            continue

        runner = PipelineRunner(
            stages=[
                OpportunityExtractor(hn_client=hn_client, gh_client=gh_client),
                OpportunityAssembler(db_session=db),
            ],
            db_session=db,
            context_factory=OpportunityPipelineContext,
            pipeline_kind="opportunities",
        )
        ctx = runner.run_for_repo(repo)

        if any("needs_reauth" in error for error in ctx.errors):
            failed_auth_user_ids.add(repo.user_id)
            continue

        processed_user_ids.add(repo.user_id)

    # On-demand: always signal the requester (closes loading toast even if
    # every repo was skipped). Scheduled: only users who processed a repo.
    if user_id is not None:
        broadcaster.publish("opportunities_generated", {}, user_id=user_id)
    else:
        for uid in processed_user_ids:
            broadcaster.publish("opportunities_generated", {}, user_id=uid)
