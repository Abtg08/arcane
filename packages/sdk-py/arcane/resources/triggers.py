"""Triggers resource — manage event triggers, subscriptions, and webhook destinations."""

from __future__ import annotations

from typing import Any, Literal

from ..http import HttpClient, AsyncHttpClient
from ..types import PageResult, Subscription, Trigger, WebhookDestination


class TriggersResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    # ── Triggers ───────────────────────────────────────────────────────────────

    def create(
        self,
        *,
        slug: str,
        name: str,
        provider: str,
        description: str | None = None,
        configuration: dict[str, Any] | None = None,
    ) -> Trigger:
        """Create a new trigger."""
        body: dict[str, Any] = {"slug": slug, "name": name, "provider": provider}
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        data = self._http.post("/triggers", json=body)
        return Trigger.from_dict(data)

    def list(
        self,
        *,
        status: Literal["ACTIVE", "PAUSED", "DELETED"] | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Trigger]:
        """List triggers with optional pagination and status filter."""
        data = self._http.get(
            "/triggers",
            params={"status": status, "cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Trigger)

    def get(self, trigger_id: str) -> Trigger:
        """Get a trigger by ID."""
        data = self._http.get(f"/triggers/{trigger_id}")
        return Trigger.from_dict(data)

    def update(
        self,
        trigger_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        status: Literal["ACTIVE", "PAUSED"] | None = None,
    ) -> Trigger:
        """Update a trigger's name, description, or status."""
        patch: dict[str, Any] = {}
        if name is not None:
            patch["name"] = name
        if description is not None:
            patch["description"] = description
        if status is not None:
            patch["status"] = status
        data = self._http.patch(f"/triggers/{trigger_id}", json=patch)
        return Trigger.from_dict(data)

    def delete(self, trigger_id: str) -> None:
        """Soft-delete a trigger (sets status to DELETED)."""
        self._http.delete(f"/triggers/{trigger_id}")

    # ── Subscriptions ──────────────────────────────────────────────────────────

    def subscribe(
        self,
        trigger_id: str,
        *,
        destination_id: str,
        external_user_id: str,
    ) -> Subscription:
        """Subscribe a user to a trigger's events. Upserts safely."""
        data = self._http.post(
            f"/triggers/{trigger_id}/subscriptions",
            json={"destination_id": destination_id, "external_user_id": external_user_id},
        )
        return Subscription.from_dict(data)

    def list_subscriptions(self, trigger_id: str) -> PageResult[Subscription]:
        """List subscriptions for a trigger."""
        data = self._http.get(f"/triggers/{trigger_id}/subscriptions")
        return PageResult.from_dict(data, Subscription)

    def unsubscribe(self, trigger_id: str, subscription_id: str) -> None:
        """Unsubscribe a user from a trigger."""
        self._http.delete(f"/triggers/{trigger_id}/subscriptions/{subscription_id}")

    # ── Webhook destinations ───────────────────────────────────────────────────

    def create_destination(
        self,
        *,
        name: str,
        url: str,
        signing_secret: str | None = None,
    ) -> WebhookDestination:
        """Create a webhook destination."""
        body: dict[str, Any] = {"name": name, "url": url}
        if signing_secret is not None:
            body["signing_secret"] = signing_secret
        data = self._http.post("/webhook-destinations", json=body)
        return WebhookDestination.from_dict(data)

    def list_destinations(self) -> PageResult[WebhookDestination]:
        """List webhook destinations."""
        data = self._http.get("/webhook-destinations")
        return PageResult.from_dict(data, WebhookDestination)

    def delete_destination(self, destination_id: str) -> None:
        """Delete a webhook destination."""
        self._http.delete(f"/webhook-destinations/{destination_id}")


class AsyncTriggersResource:
    def __init__(self, http: AsyncHttpClient) -> None:
        self._http = http

    async def create(
        self,
        *,
        slug: str,
        name: str,
        provider: str,
        description: str | None = None,
        configuration: dict[str, Any] | None = None,
    ) -> Trigger:
        body: dict[str, Any] = {"slug": slug, "name": name, "provider": provider}
        if description is not None:
            body["description"] = description
        if configuration is not None:
            body["configuration"] = configuration
        data = await self._http.post("/triggers", json=body)
        return Trigger.from_dict(data)

    async def list(
        self,
        *,
        status: Literal["ACTIVE", "PAUSED", "DELETED"] | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Trigger]:
        data = await self._http.get(
            "/triggers",
            params={"status": status, "cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Trigger)

    async def get(self, trigger_id: str) -> Trigger:
        data = await self._http.get(f"/triggers/{trigger_id}")
        return Trigger.from_dict(data)

    async def update(
        self,
        trigger_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        status: Literal["ACTIVE", "PAUSED"] | None = None,
    ) -> Trigger:
        patch: dict[str, Any] = {}
        if name is not None:
            patch["name"] = name
        if description is not None:
            patch["description"] = description
        if status is not None:
            patch["status"] = status
        data = await self._http.patch(f"/triggers/{trigger_id}", json=patch)
        return Trigger.from_dict(data)

    async def delete(self, trigger_id: str) -> None:
        await self._http.delete(f"/triggers/{trigger_id}")

    async def subscribe(
        self,
        trigger_id: str,
        *,
        destination_id: str,
        external_user_id: str,
    ) -> Subscription:
        data = await self._http.post(
            f"/triggers/{trigger_id}/subscriptions",
            json={"destination_id": destination_id, "external_user_id": external_user_id},
        )
        return Subscription.from_dict(data)

    async def list_subscriptions(self, trigger_id: str) -> PageResult[Subscription]:
        data = await self._http.get(f"/triggers/{trigger_id}/subscriptions")
        return PageResult.from_dict(data, Subscription)

    async def unsubscribe(self, trigger_id: str, subscription_id: str) -> None:
        await self._http.delete(f"/triggers/{trigger_id}/subscriptions/{subscription_id}")

    async def create_destination(
        self,
        *,
        name: str,
        url: str,
        signing_secret: str | None = None,
    ) -> WebhookDestination:
        body: dict[str, Any] = {"name": name, "url": url}
        if signing_secret is not None:
            body["signing_secret"] = signing_secret
        data = await self._http.post("/webhook-destinations", json=body)
        return WebhookDestination.from_dict(data)

    async def list_destinations(self) -> PageResult[WebhookDestination]:
        data = await self._http.get("/webhook-destinations")
        return PageResult.from_dict(data, WebhookDestination)

    async def delete_destination(self, destination_id: str) -> None:
        await self._http.delete(f"/webhook-destinations/{destination_id}")
