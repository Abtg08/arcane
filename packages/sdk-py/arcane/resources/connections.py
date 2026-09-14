"""Connections resource — manage user connections to external services."""

from __future__ import annotations

from typing import Literal

from ..http import HttpClient, AsyncHttpClient
from ..types import Connection, OAuthInitiateResult, PageResult


class ConnectionsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(
        self,
        *,
        external_user_id: str | None = None,
        toolkit_id: str | None = None,
        status: Literal["ACTIVE", "PENDING", "REVOKED", "ERROR"] | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Connection]:
        """List connections, optionally filtered by user, toolkit, or status."""
        data = self._http.get(
            "/connections",
            params={
                "external_user_id": external_user_id,
                "toolkit_id": toolkit_id,
                "status": status,
                "cursor": cursor,
                "limit": limit,
            },
        )
        return PageResult.from_dict(data, Connection)

    def get(self, connection_id: str) -> Connection:
        """Get a specific connection by ID."""
        data = self._http.get(f"/connections/{connection_id}")
        return Connection.from_dict(data)

    def initiate_oauth(
        self,
        *,
        toolkit_slug: str,
        external_user_id: str,
        redirect_uri: str,
        scopes: list[str] | None = None,
    ) -> OAuthInitiateResult:
        """Initiate an OAuth flow. Returns the redirect URL to send the user to."""
        body: dict = {
            "toolkit_slug": toolkit_slug,
            "external_user_id": external_user_id,
            "redirect_uri": redirect_uri,
        }
        if scopes is not None:
            body["scopes"] = scopes
        data = self._http.post("/connections/oauth/initiate", json=body)
        return OAuthInitiateResult.from_dict(data)

    def revoke(self, connection_id: str) -> None:
        """Revoke a connection."""
        self._http.delete(f"/connections/{connection_id}")


class AsyncConnectionsResource:
    def __init__(self, http: AsyncHttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        external_user_id: str | None = None,
        toolkit_id: str | None = None,
        status: Literal["ACTIVE", "PENDING", "REVOKED", "ERROR"] | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Connection]:
        data = await self._http.get(
            "/connections",
            params={
                "external_user_id": external_user_id,
                "toolkit_id": toolkit_id,
                "status": status,
                "cursor": cursor,
                "limit": limit,
            },
        )
        return PageResult.from_dict(data, Connection)

    async def get(self, connection_id: str) -> Connection:
        data = await self._http.get(f"/connections/{connection_id}")
        return Connection.from_dict(data)

    async def initiate_oauth(
        self,
        *,
        toolkit_slug: str,
        external_user_id: str,
        redirect_uri: str,
        scopes: list[str] | None = None,
    ) -> OAuthInitiateResult:
        body: dict = {
            "toolkit_slug": toolkit_slug,
            "external_user_id": external_user_id,
            "redirect_uri": redirect_uri,
        }
        if scopes is not None:
            body["scopes"] = scopes
        data = await self._http.post("/connections/oauth/initiate", json=body)
        return OAuthInitiateResult.from_dict(data)

    async def revoke(self, connection_id: str) -> None:
        await self._http.delete(f"/connections/{connection_id}")
