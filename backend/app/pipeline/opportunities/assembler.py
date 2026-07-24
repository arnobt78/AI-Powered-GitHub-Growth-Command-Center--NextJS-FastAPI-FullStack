from sqlalchemy.orm import Session

from app.models import Opportunity
from app.pipeline.base import Stage
from app.pipeline.opportunity_base import OpportunityPipelineContext


class OpportunityAssembler(Stage):
    name = "opportunity_assembler"

    def __init__(self, db_session: Session):
        self.db = db_session

    def run(self, ctx: OpportunityPipelineContext) -> OpportunityPipelineContext:
        existing_ids = {
            row.external_id
            for row in self.db.query(Opportunity.external_id).filter(
                Opportunity.repo_id == ctx.repo.id
            ).all()
        }
        for item in ctx.opportunities:
            if item["external_id"] in existing_ids:
                continue
            self.db.add(Opportunity(
                user_id=ctx.repo.user_id,
                repo_id=ctx.repo.id,
                source=item["source"],
                external_id=item["external_id"],
                title=item["title"],
                url=item["url"],
            ))
        self.db.commit()
        return ctx
