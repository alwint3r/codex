from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from openai_codex.async_client import AsyncCodexClient
from openai_codex.generated.v2_all import (
    AgentMessageDeltaNotification,
    GetAccountRateLimitsResponse,
    TurnCompletedNotification,
)
from openai_codex.models import Notification, UnknownNotification


def test_async_client_allows_concurrent_transport_calls() -> None:
    """Async wrappers should offload sync calls so concurrent awaits can overlap."""

    async def scenario() -> int:
        """Run two blocking sync calls and report peak overlap."""
        client = AsyncCodexClient()
        active = 0
        max_active = 0

        def fake_model_list(include_hidden: bool = False) -> bool:
            """Simulate a blocking sync transport call."""
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            time.sleep(0.05)
            active -= 1
            return include_hidden

        client._sync.model_list = fake_model_list  # type: ignore[method-assign]
        await asyncio.gather(client.model_list(), client.model_list())
        return max_active

    assert asyncio.run(scenario()) == 2


def test_async_client_turn_notification_methods_delegate_to_sync_client() -> None:
    """Async turn routing methods should preserve sync-client registration semantics."""

    async def scenario() -> tuple[list[tuple[str, str]], Notification, str]:
        """Record the sync-client calls made by async turn notification wrappers."""
        client = AsyncCodexClient()
        event = Notification(
            method="unknown/direct",
            payload=UnknownNotification(params={"turnId": "turn-1"}),
        )
        completed = TurnCompletedNotification.model_validate(
            {
                "threadId": "thread-1",
                "turn": {"id": "turn-1", "items": [], "status": "completed"},
            }
        )
        calls: list[tuple[str, str]] = []

        def fake_register(turn_id: str) -> None:
            """Record turn registration through the wrapped sync client."""
            calls.append(("register", turn_id))

        def fake_unregister(turn_id: str) -> None:
            """Record turn unregistration through the wrapped sync client."""
            calls.append(("unregister", turn_id))

        def fake_next(turn_id: str) -> Notification:
            """Return one routed notification through the wrapped sync client."""
            calls.append(("next", turn_id))
            return event

        def fake_wait(turn_id: str) -> TurnCompletedNotification:
            """Return one completion through the wrapped sync client."""
            calls.append(("wait", turn_id))
            return completed

        client._sync.register_turn_notifications = fake_register  # type: ignore[method-assign]
        client._sync.unregister_turn_notifications = fake_unregister  # type: ignore[method-assign]
        client._sync.next_turn_notification = fake_next  # type: ignore[method-assign]
        client._sync.wait_for_turn_completed = fake_wait  # type: ignore[method-assign]

        client.register_turn_notifications("turn-1")
        next_event = await client.next_turn_notification("turn-1")
        completed_event = await client.wait_for_turn_completed("turn-1")
        client.unregister_turn_notifications("turn-1")

        return calls, next_event, completed_event.turn.id

    calls, next_event, completed_turn_id = asyncio.run(scenario())

    assert (
        calls,
        next_event,
        completed_turn_id,
    ) == (
        [
            ("register", "turn-1"),
            ("next", "turn-1"),
            ("wait", "turn-1"),
            ("unregister", "turn-1"),
        ],
        Notification(
            method="unknown/direct",
            payload=UnknownNotification(params={"turnId": "turn-1"}),
        ),
        "turn-1",
    )


def test_async_stream_text_uses_sync_turn_routing() -> None:
    async def scenario() -> tuple[list[tuple[str, str]], list[str]]:
        client = AsyncAppServerClient()
        notifications = [
            Notification(
                method="item/agentMessage/delta",
                payload=AgentMessageDeltaNotification.model_validate(
                    {
                        "delta": "first",
                        "itemId": "item-1",
                        "threadId": "thread-1",
                        "turnId": "turn-1",
                    }
                ),
            ),
            Notification(
                method="item/agentMessage/delta",
                payload=AgentMessageDeltaNotification.model_validate(
                    {
                        "delta": "second",
                        "itemId": "item-2",
                        "threadId": "thread-1",
                        "turnId": "turn-1",
                    }
                ),
            ),
            Notification(
                method="turn/completed",
                payload=TurnCompletedNotification.model_validate(
                    {
                        "threadId": "thread-1",
                        "turn": {"id": "turn-1", "items": [], "status": "completed"},
                    }
                ),
            ),
        ]
        calls: list[tuple[str, str]] = []

        def fake_turn_start(thread_id: str, text: str, *, params=None):  # type: ignore[no-untyped-def]
            calls.append(("turn_start", thread_id))
            return SimpleNamespace(turn=SimpleNamespace(id="turn-1"))

        def fake_register(turn_id: str) -> None:
            calls.append(("register", turn_id))

        def fake_next(turn_id: str) -> Notification:
            calls.append(("next", turn_id))
            return notifications.pop(0)

        def fake_unregister(turn_id: str) -> None:
            calls.append(("unregister", turn_id))

        client._sync.turn_start = fake_turn_start  # type: ignore[method-assign]
        client._sync.register_turn_notifications = fake_register  # type: ignore[method-assign]
        client._sync.next_turn_notification = fake_next  # type: ignore[method-assign]
        client._sync.unregister_turn_notifications = fake_unregister  # type: ignore[method-assign]

        chunks = [chunk async for chunk in client.stream_text("thread-1", "hello")]
        return calls, [chunk.delta for chunk in chunks]

    calls, deltas = asyncio.run(scenario())

    assert (calls, deltas) == (
        [
            ("turn_start", "thread-1"),
            ("register", "turn-1"),
            ("next", "turn-1"),
            ("next", "turn-1"),
            ("next", "turn-1"),
            ("unregister", "turn-1"),
        ],
        ["first", "second"],
    )


def test_async_account_rate_limits_uses_sync_client_method() -> None:
    async def scenario() -> GetAccountRateLimitsResponse:
        client = AsyncAppServerClient()

        def fake_account_rate_limits() -> GetAccountRateLimitsResponse:
            return GetAccountRateLimitsResponse.model_validate(
                {
                    "rateLimits": {},
                    "rateLimitsByLimitId": None,
                }
            )

        client._sync.account_rate_limits = fake_account_rate_limits  # type: ignore[method-assign]
        return await client.account_rate_limits()

    response = asyncio.run(scenario())
    assert isinstance(response, GetAccountRateLimitsResponse)
