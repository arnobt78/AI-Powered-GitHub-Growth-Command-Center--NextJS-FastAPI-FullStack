from app.db import SessionLocal
from app.models import Opportunity, Repo
from app.pipeline.opportunities.assembler import OpportunityAssembler
from app.pipeline.opportunity_base import OpportunityPipelineContext


def _db_and_repo(user_id: int):
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    return db, repo


def test_assembler_writes_new_opportunities(seed_user):
    db, repo = _db_and_repo(seed_user)
    ctx = OpportunityPipelineContext(repo=repo)
    ctx.opportunities = [
        {"source": "hacker_news", "external_id": "111", "title": "Show HN: hello-world", "url": "https://example.com/1"},
        {"source": "github_discussions", "external_id": "D_kwABC123", "title": "usage question", "url": "https://example.com/2"},
    ]

    ctx = OpportunityAssembler(db_session=db).run(ctx)

    written = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(written) == 2
    assert {o.external_id for o in written} == {"111", "D_kwABC123"}
    db.close()


def test_assembler_skips_already_seen_external_ids(seed_user):
    db, repo = _db_and_repo(seed_user)
    db.add(Opportunity(
        user_id=seed_user, repo_id=repo.id, source="hacker_news", external_id="111",
        title="Show HN: hello-world", url="https://example.com/1",
    ))
    db.commit()

    ctx = OpportunityPipelineContext(repo=repo)
    ctx.opportunities = [
        {"source": "hacker_news", "external_id": "111", "title": "Show HN: hello-world", "url": "https://example.com/1"},
        {"source": "github_discussions", "external_id": "D_kwABC123", "title": "usage question", "url": "https://example.com/2"},
    ]

    ctx = OpportunityAssembler(db_session=db).run(ctx)

    written = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(written) == 2  # 1 pre-existing + 1 genuinely new; the duplicate "111" was not re-inserted
    assert {o.external_id for o in written} == {"111", "D_kwABC123"}
    db.close()
