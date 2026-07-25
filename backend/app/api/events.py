"""Server-Sent Events stream for live UI cache invalidation.

Educational walkthrough
-----------------------
Authenticated clients open ``GET /events``. Each user gets their own queue from
``broadcaster``. When mutations/pipelines publish events, this generator yields
named SSE events; the Next.js frontend maps event types → TanStack Query keys.
"""

import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from app.deps import require_api_key, require_user
from app.events import broadcaster
from app.models import User

router = APIRouter(tags=["events"], dependencies=[Depends(require_api_key)])


@router.get("/events")
async def stream_events(current_user: User = Depends(require_user)) -> EventSourceResponse:
    """Long-lived SSE connection scoped to ``current_user.id``."""
    queue = broadcaster.subscribe(user_id=current_user.id)

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                # ``event`` name becomes EventSource event type on the client.
                yield {"event": event["type"], "data": json.dumps(event["payload"])}
        finally:
            broadcaster.unsubscribe(queue)

    return EventSourceResponse(event_generator())
