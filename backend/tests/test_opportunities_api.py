from app.db import SessionLocal
from app.models import Opportunity, Repo


def _seed_opportunity_for(user_id: int) -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    opp = Opportunity(
        user_id=user_id,
        repo_id=repo.id,
        source="hacker_news",
        external_id="111",
        title="Show HN: hello-world",
        url="https://news.ycombinator.com/item?id=111",
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)
    opp_id = opp.id
    repo_id = repo.id
    db.close()
    return repo_id, opp_id


def test_opportunities_isolated_per_user(client, other_user_client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    other_list = other_user_client.get("/opportunities")
    assert other_list.json() == []

    other_patch = other_user_client.patch(f"/opportunities/{opp_id}", json={"dismissed": True})
    assert other_patch.status_code == 404


def test_list_opportunities_returns_current_users(client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    resp = client.get("/opportunities")
    assert resp.status_code == 200
    assert any(o["id"] == opp_id and o["source"] == "hacker_news" for o in resp.json())


def test_dismiss_opportunity(client):
    _repo_id, opp_id = _seed_opportunity_for(client.test_user_id)

    resp = client.patch(f"/opportunities/{opp_id}", json={"dismissed": True})
    assert resp.status_code == 200
    assert resp.json()["dismissed"] is True

    list_resp = client.get("/opportunities")
    assert any(o["id"] == opp_id and o["dismissed"] for o in list_resp.json())


def test_opportunities_require_user_token(client_without_user_token):
    resp = client_without_user_token.get("/opportunities")
    assert resp.status_code == 401

    resp = client_without_user_token.patch("/opportunities/1", json={"dismissed": True})
    assert resp.status_code == 401
