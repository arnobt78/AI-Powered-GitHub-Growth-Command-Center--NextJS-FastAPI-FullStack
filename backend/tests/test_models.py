from app.db import Base, engine, SessionLocal
from app.models import Repo, User, Opportunity, Draft


def test_create_and_query_repo(seed_user):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()

    fetched = db.query(Repo).filter_by(owner="octocat", name="hello-world").first()
    assert fetched is not None
    assert fetched.name == "hello-world"
    assert fetched.tracked_since is not None
    db.close()


def test_create_user_and_scoped_repo():
    db = SessionLocal()
    user = User(
        github_id="555",
        username="tester",
        avatar_url="https://avatars.githubusercontent.com/u/555",
        email="tester@example.com",
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    assert user.plan == "free"
    assert user.max_tracked_repos == 5

    repo = Repo(owner="octocat", name="hello-world", user_id=user.id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    assert repo.user_id == user.id
    db.close()


def test_user_notification_fields_default_none_and_are_settable():
    db = SessionLocal()
    user = User(
        github_id="666",
        username="notif-tester",
        avatar_url="https://avatars.githubusercontent.com/u/666",
        email=None,
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    assert user.notification_email is None
    assert user.last_reauth_notified_at is None

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    user.notification_email = "fallback@example.com"
    user.last_reauth_notified_at = now
    db.commit()
    db.refresh(user)

    assert user.notification_email == "fallback@example.com"
    assert user.last_reauth_notified_at is not None
    db.close()


def test_repo_last_release_tag_defaults_none_and_is_settable():
    db = SessionLocal()
    user = User(
        github_id="777",
        username="release-tester",
        avatar_url="https://avatars.githubusercontent.com/u/777",
        email=None,
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    repo = Repo(owner="octocat", name="hello-world", user_id=user.id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    assert repo.last_release_tag is None

    repo.last_release_tag = "v1.2.0"
    db.commit()
    db.refresh(repo)

    assert repo.last_release_tag == "v1.2.0"
    db.close()


def test_create_opportunity_scoped_to_repo_and_user():
    db = SessionLocal()
    user = User(
        github_id="888",
        username="opp-tester",
        avatar_url="https://avatars.githubusercontent.com/u/888",
        email=None,
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    repo = Repo(owner="octocat", name="hello-world", user_id=user.id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    opportunity = Opportunity(
        user_id=user.id,
        repo_id=repo.id,
        source="hacker_news",
        external_id="12345",
        title="Show HN: hello-world",
        url="https://news.ycombinator.com/item?id=12345",
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)

    assert opportunity.dismissed is False
    assert opportunity.created_at is not None

    fetched = db.query(Opportunity).filter_by(repo_id=repo.id).one()
    assert fetched.source == "hacker_news"
    assert fetched.external_id == "12345"
    db.close()


def test_draft_error_message_defaults_none_and_is_settable():
    db = SessionLocal()
    user = User(
        github_id="999",
        username="draft-error-tester",
        avatar_url="https://avatars.githubusercontent.com/u/999",
        email=None,
        access_token_encrypted="ciphertext-placeholder",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    draft = Draft(
        user_id=user.id,
        repo_id=None,
        kind="issue_reply",
        target="issue:1",
        content={"suggested": "Thanks for the report!", "reason": "acknowledges the issue"},
        status="pending",
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)

    assert draft.error_message is None

    draft.status = "failed"
    draft.error_message = "GitHub token rejected"
    db.commit()
    db.refresh(draft)

    assert draft.error_message == "GitHub token rejected"
    db.close()
