"""In-process pub/sub for SSE — per-user asyncio queues.

Educational walkthrough
-----------------------
``publish(type, payload, user_id=…)`` pushes to every subscriber queue for that
user. API handlers and pipeline runners call this after mutations so open
browser tabs can invalidate TanStack Query without polling.
"""

import asyncio
from typing import Any


class EventBroadcaster:
    """Fan-out event bus keyed by ``user_id`` (one queue per SSE connection)."""

    def __init__(self) -> None:
        self._subscribers: list[tuple[int, asyncio.Queue]] = []

    def subscribe(self, user_id: int) -> asyncio.Queue:
        """Register a new listener queue for this user's SSE stream."""
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.append((user_id, queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a queue when the SSE client disconnects."""
        self._subscribers = [(uid, q) for uid, q in self._subscribers if q is not queue]

    def publish(self, event_type: str, payload: dict[str, Any], user_id: int) -> None:
        """Push an event to all live SSE subscribers for ``user_id`` only."""
        event = {"type": event_type, "payload": payload}
        for uid, queue in list(self._subscribers):
            if uid == user_id:
                queue.put_nowait(event)


# Process-wide singleton imported by routers and the pipeline runner.
broadcaster = EventBroadcaster()
