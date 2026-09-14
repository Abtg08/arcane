"""Executions resource — run tools and poll results."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from ..errors import ArcaneTimeoutError
from ..http import HttpClient, AsyncHttpClient
from ..types import Execution, ExecuteResult, PageResult, TERMINAL_STATUSES


class ExecutionsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def execute(
        self,
        *,
        tool: str,
        connection_id: str,
        input: dict[str, Any],
        session_id: str | None = None,
        tool_version: int | None = None,
    ) -> ExecuteResult:
        """
        Execute a tool. Returns immediately with a pending execution ID.

        ``tool`` must be the fully-qualified tool identifier: ``"<toolkit_slug>.<tool_slug>"``

        Use :meth:`get` to poll or :meth:`wait_for` for a blocking helper.
        """
        parts = tool.split(".", 1)
        if len(parts) != 2:
            raise ValueError(
                f"tool must be '<toolkit_slug>.<tool_slug>', got {tool!r}"
            )
        toolkit_slug, tool_slug = parts

        body: dict[str, Any] = {
            "toolkit_slug": toolkit_slug,
            "tool_slug": tool_slug,
            "connection_id": connection_id,
            "input": input,
        }
        if session_id is not None:
            body["session_id"] = session_id
        if tool_version is not None:
            body["tool_version"] = tool_version

        data = self._http.post("/execute", json=body)
        return ExecuteResult.from_dict(data)

    def get(self, execution_id: str) -> Execution:
        """Get a single execution by ID."""
        data = self._http.get(f"/executions/{execution_id}")
        return Execution.from_dict(data)

    def list(
        self,
        *,
        connection_id: str | None = None,
        session_id: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Execution]:
        """List executions with optional filters and cursor pagination."""
        data = self._http.get(
            "/executions",
            params={
                "connection_id": connection_id,
                "session_id": session_id,
                "status": status,
                "cursor": cursor,
                "limit": limit,
            },
        )
        return PageResult.from_dict(data, Execution)

    def wait_for(
        self,
        execution_id: str,
        *,
        timeout_s: float = 120.0,
        interval_s: float = 1.0,
    ) -> Execution:
        """
        Poll until the execution reaches a terminal state.

        :raises ArcaneTimeoutError: if ``timeout_s`` is exceeded.
        """
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            execution = self.get(execution_id)
            if execution.is_terminal:
                return execution
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(interval_s, remaining))

        raise ArcaneTimeoutError(
            f"Execution {execution_id!r} did not complete within {timeout_s}s"
        )


class AsyncExecutionsResource:
    def __init__(self, http: AsyncHttpClient) -> None:
        self._http = http

    async def execute(
        self,
        *,
        tool: str,
        connection_id: str,
        input: dict[str, Any],
        session_id: str | None = None,
        tool_version: int | None = None,
    ) -> ExecuteResult:
        parts = tool.split(".", 1)
        if len(parts) != 2:
            raise ValueError(
                f"tool must be '<toolkit_slug>.<tool_slug>', got {tool!r}"
            )
        toolkit_slug, tool_slug = parts

        body: dict[str, Any] = {
            "toolkit_slug": toolkit_slug,
            "tool_slug": tool_slug,
            "connection_id": connection_id,
            "input": input,
        }
        if session_id is not None:
            body["session_id"] = session_id
        if tool_version is not None:
            body["tool_version"] = tool_version

        data = await self._http.post("/execute", json=body)
        return ExecuteResult.from_dict(data)

    async def get(self, execution_id: str) -> Execution:
        data = await self._http.get(f"/executions/{execution_id}")
        return Execution.from_dict(data)

    async def list(
        self,
        *,
        connection_id: str | None = None,
        session_id: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> PageResult[Execution]:
        data = await self._http.get(
            "/executions",
            params={
                "connection_id": connection_id,
                "session_id": session_id,
                "status": status,
                "cursor": cursor,
                "limit": limit,
            },
        )
        return PageResult.from_dict(data, Execution)

    async def wait_for(
        self,
        execution_id: str,
        *,
        timeout_s: float = 120.0,
        interval_s: float = 1.0,
    ) -> Execution:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            execution = await self.get(execution_id)
            if execution.is_terminal:
                return execution
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            await asyncio.sleep(min(interval_s, remaining))

        raise ArcaneTimeoutError(
            f"Execution {execution_id!r} did not complete within {timeout_s}s"
        )
