from app.db import SessionLocal
from app.models import Draft, Repo
from app.pipeline.content.analyzer import ContentAnalyzer
from app.pipeline.content_base import ContentPipelineContext


def _ctx(user_id: int, **raw_overrides) -> ContentPipelineContext:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    ctx = ContentPipelineContext(repo=repo)
    ctx.raw = {
        "readme": "# Hello",
        "topics": ["cli"],
        "description": "A tool",
        "missing_docs": ["SECURITY.md"],
        "open_issues": [],
        "discussions": [],
    }
    ctx.raw.update(raw_overrides)
    return ctx, db


def test_analyzer_always_builds_readme_and_seo_tasks(seed_user):
    ctx, db = _ctx(seed_user)
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    kinds = [t.kind for t in ctx.tasks]
    assert "readme_suggestion" in kinds
    assert "seo_suggestion" in kinds
    db.close()


def test_analyzer_builds_one_task_per_missing_doc(seed_user):
    ctx, db = _ctx(seed_user, missing_docs=["SECURITY.md", "CODE_OF_CONDUCT.md"])
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    doc_tasks = [t for t in ctx.tasks if t.kind == "missing_doc_suggestion"]
    assert {t.target for t in doc_tasks} == {"SECURITY.md", "CODE_OF_CONDUCT.md"}
    assert all(t.current is None and t.structured is False for t in doc_tasks)
    db.close()


def test_analyzer_skips_topic_task_when_already_well_tagged(seed_user):
    ctx, db = _ctx(seed_user, topics=["a", "b", "c", "d", "e"])
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    assert not any(t.kind == "topic_suggestion" for t in ctx.tasks)
    db.close()


def test_analyzer_builds_topic_task_when_under_tagged(seed_user):
    ctx, db = _ctx(seed_user, topics=["cli"])
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    topic_task = next(t for t in ctx.tasks if t.kind == "topic_suggestion")
    assert topic_task.current == ["cli"]
    assert topic_task.structured is True
    db.close()


def test_analyzer_builds_release_notes_task_for_new_release(seed_user):
    ctx, db = _ctx(seed_user, latest_release={"tag_name": "v1.2.0", "body": "- Added dark mode"})
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    release_task = next(t for t in ctx.tasks if t.kind == "release_notes")
    assert release_task.target == "v1.2.0"
    assert release_task.current is None
    assert release_task.structured is False
    assert release_task.source_material == {"tag": "v1.2.0", "raw_notes": "- Added dark mode", "repo_name": "hello-world"}
    db.close()


def test_analyzer_skips_release_notes_task_when_tag_already_drafted(seed_user):
    ctx, db = _ctx(seed_user, latest_release={"tag_name": "v1.2.0", "body": "- Added dark mode"})
    ctx.repo.last_release_tag = "v1.2.0"
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    assert not any(t.kind == "release_notes" for t in ctx.tasks)
    db.close()


def test_analyzer_skips_release_notes_task_when_body_is_empty(seed_user):
    ctx, db = _ctx(seed_user, latest_release={"tag_name": "v1.2.0", "body": ""})
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    assert not any(t.kind == "release_notes" for t in ctx.tasks)
    db.close()


def test_analyzer_skips_release_notes_task_when_no_release_exists(seed_user):
    ctx, db = _ctx(seed_user, latest_release=None)
    ctx = ContentAnalyzer(db_session=db).run(ctx)
    assert not any(t.kind == "release_notes" for t in ctx.tasks)
    db.close()


def test_analyzer_builds_issue_reply_task_for_new_issue(seed_user):
    ctx, db = _ctx(seed_user, open_issues=[{"number": 42, "title": "Bug: crashes on startup", "body": "It crashes."}])
    ctx = ContentAnalyzer(db_session=db).run(ctx)

    issue_task = next(t for t in ctx.tasks if t.kind == "issue_reply")
    assert issue_task.target == "issue:42"
    assert issue_task.structured is False
    assert issue_task.source_material == {"title": "Bug: crashes on startup", "body": "It crashes.", "repo_name": "hello-world"}
    db.close()


def test_analyzer_skips_issue_reply_task_when_draft_already_exists(seed_user):
    ctx, db = _ctx(seed_user, open_issues=[{"number": 42, "title": "Bug", "body": "It crashes."}])
    db.add(Draft(user_id=seed_user, repo_id=ctx.repo.id, kind="issue_reply", target="issue:42", content={}, status="rejected"))
    db.commit()

    ctx = ContentAnalyzer(db_session=db).run(ctx)

    assert not any(t.kind == "issue_reply" for t in ctx.tasks)
    db.close()


def test_analyzer_builds_discussion_reply_task_for_new_discussion(seed_user):
    ctx, db = _ctx(seed_user, discussions=[{"id": "D_kwDOABCD1", "number": 7, "title": "How do I configure X?", "body": "Trying to set up X."}])
    ctx = ContentAnalyzer(db_session=db).run(ctx)

    disc_task = next(t for t in ctx.tasks if t.kind == "discussion_reply")
    assert disc_task.target == "discussion:7"
    assert disc_task.source_material == {
        "title": "How do I configure X?", "body": "Trying to set up X.", "repo_name": "hello-world",
        "discussion_node_id": "D_kwDOABCD1",
    }
    db.close()


def test_analyzer_skips_discussion_reply_task_when_draft_already_exists(seed_user):
    ctx, db = _ctx(seed_user, discussions=[{"id": "D_kwDOABCD1", "number": 7, "title": "Q", "body": "B"}])
    db.add(Draft(user_id=seed_user, repo_id=ctx.repo.id, kind="discussion_reply", target="discussion:7", content={}, status="posted"))
    db.commit()

    ctx = ContentAnalyzer(db_session=db).run(ctx)

    assert not any(t.kind == "discussion_reply" for t in ctx.tasks)
    db.close()
