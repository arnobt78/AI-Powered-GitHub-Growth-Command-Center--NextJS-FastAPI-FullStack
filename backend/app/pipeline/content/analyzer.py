from sqlalchemy.orm import Session

from app.models import Draft
from app.pipeline.base import Stage
from app.pipeline.content_base import ContentPipelineContext, ContentTask

_MIN_TOPICS = 5


class ContentAnalyzer(Stage):
    name = "content_analyzer"

    def __init__(self, db_session: Session):
        self.db = db_session

    def run(self, ctx: ContentPipelineContext) -> ContentPipelineContext:
        raw = ctx.raw
        topics = raw.get("topics", [])
        tasks: list[ContentTask] = [
            ContentTask(
                kind="readme_suggestion",
                target="readme",
                structured=False,
                current=raw.get("readme"),
                source_material={"readme": raw.get("readme") or "", "topics": topics, "description": raw.get("description")},
            ),
        ]

        for filename in raw.get("missing_docs", []):
            tasks.append(ContentTask(
                kind="missing_doc_suggestion",
                target=filename,
                structured=False,
                current=None,
                source_material={"filename": filename, "readme": raw.get("readme") or ""},
            ))

        if len(topics) < _MIN_TOPICS:
            tasks.append(ContentTask(
                kind="topic_suggestion",
                target="topics",
                structured=True,
                current=topics,
                source_material={"topics": topics, "readme": raw.get("readme") or "", "description": raw.get("description")},
            ))

        tasks.append(ContentTask(
            kind="seo_suggestion",
            target="description",
            structured=True,
            current=raw.get("description"),
            source_material={"description": raw.get("description"), "readme": raw.get("readme") or "", "topics": topics},
        ))

        latest_release = raw.get("latest_release")
        if latest_release and latest_release.get("tag_name") != ctx.repo.last_release_tag:
            body = (latest_release.get("body") or "").strip()
            if body:
                tasks.append(ContentTask(
                    kind="release_notes",
                    target=latest_release["tag_name"],
                    structured=False,
                    current=None,
                    source_material={"tag": latest_release["tag_name"], "raw_notes": body, "repo_name": ctx.repo.name},
                ))

        for issue in raw.get("open_issues", []):
            target = f"issue:{issue['number']}"
            if self._draft_exists(ctx.repo.id, "issue_reply", target):
                continue
            tasks.append(ContentTask(
                kind="issue_reply",
                target=target,
                structured=False,
                current=None,
                source_material={"title": issue["title"], "body": issue.get("body") or "", "repo_name": ctx.repo.name},
            ))

        for disc in raw.get("discussions", []):
            target = f"discussion:{disc['number']}"
            if self._draft_exists(ctx.repo.id, "discussion_reply", target):
                continue
            tasks.append(ContentTask(
                kind="discussion_reply",
                target=target,
                structured=False,
                current=None,
                source_material={
                    "title": disc["title"], "body": disc.get("body") or "", "repo_name": ctx.repo.name,
                    "discussion_node_id": disc["id"],
                },
            ))

        ctx.tasks = tasks
        return ctx

    def _draft_exists(self, repo_id: int, kind: str, target: str) -> bool:
        return self.db.query(Draft).filter_by(repo_id=repo_id, kind=kind, target=target).first() is not None
