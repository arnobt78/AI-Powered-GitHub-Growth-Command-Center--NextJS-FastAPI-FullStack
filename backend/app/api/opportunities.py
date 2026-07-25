from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_owned_or_404, require_api_key, require_user
from app.events import broadcaster
from app.models import Opportunity, User

router = APIRouter(prefix="/opportunities", tags=["opportunities"], dependencies=[Depends(require_api_key)])


class OpportunityOut(BaseModel):
    id: int
    repo_id: int
    source: str
    title: str
    url: str
    dismissed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class OpportunityPatch(BaseModel):
    dismissed: bool


@router.get("", response_model=list[OpportunityOut])
def list_opportunities(
    db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> list[Opportunity]:
    return db.execute(
        select(Opportunity)
        .where(Opportunity.user_id == current_user.id)
        .order_by(Opportunity.created_at.desc())
    ).scalars().all()


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
def update_opportunity(
    opportunity_id: int,
    payload: OpportunityPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> Opportunity:
    opp = get_owned_or_404(db, Opportunity, opportunity_id, current_user.id, "Opportunity")
    opp.dismissed = payload.dismissed
    db.commit()
    db.refresh(opp)
    broadcaster.publish(
        "opportunity_updated", {"id": opp.id, "dismissed": opp.dismissed}, user_id=current_user.id
    )
    return opp
