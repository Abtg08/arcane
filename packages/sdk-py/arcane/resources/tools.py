"""Tools and toolkits resource."""

from __future__ import annotations

from typing import Any

from ..http import HttpClient, AsyncHttpClient
from ..types import PageResult, Toolkit, Tool


class ToolsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list_toolkits(
        self,
        *,
        q: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Toolkit]:
        """List toolkits, optionally filtered by a search query."""
        data = self._http.get(
            "/toolkits",
            params={"q": q, "cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Toolkit)

    def list_tools(
        self,
        toolkit_slug: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Tool]:
        """List tools for a given toolkit."""
        data = self._http.get(
            f"/toolkits/{toolkit_slug}/tools",
            params={"cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Tool)

    def get_tool(self, toolkit_slug: str, tool_slug: str) -> Tool:
        """Get a specific tool by toolkit and tool slug."""
        data = self._http.get(f"/toolkits/{toolkit_slug}/tools/{tool_slug}")
        return Tool.from_dict(data)


class AsyncToolsResource:
    def __init__(self, http: AsyncHttpClient) -> None:
        self._http = http

    async def list_toolkits(
        self,
        *,
        q: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Toolkit]:
        data = await self._http.get(
            "/toolkits",
            params={"q": q, "cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Toolkit)

    async def list_tools(
        self,
        toolkit_slug: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Tool]:
        data = await self._http.get(
            f"/toolkits/{toolkit_slug}/tools",
            params={"cursor": cursor, "limit": limit},
        )
        return PageResult.from_dict(data, Tool)

    async def get_tool(self, toolkit_slug: str, tool_slug: str) -> Tool:
        data = await self._http.get(f"/toolkits/{toolkit_slug}/tools/{tool_slug}")
        return Tool.from_dict(data)
