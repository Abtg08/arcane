"""Arcane SDK clients — sync and async."""

from __future__ import annotations

from .http import HttpClient, AsyncHttpClient
from .resources.connections import ConnectionsResource, AsyncConnectionsResource
from .resources.executions import ExecutionsResource, AsyncExecutionsResource
from .resources.tools import ToolsResource, AsyncToolsResource
from .resources.triggers import TriggersResource, AsyncTriggersResource

DEFAULT_BASE_URL = "https://api.arcane.run/v1"


class ArcaneClient:
    """Synchronous Arcane API client."""

    tools: ToolsResource
    connections: ConnectionsResource
    executions: ExecutionsResource
    triggers: TriggersResource

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 30.0,
    ) -> None:
        self._http = HttpClient(api_key=api_key, base_url=base_url, timeout_s=timeout_s)
        self.tools = ToolsResource(self._http)
        self.connections = ConnectionsResource(self._http)
        self.executions = ExecutionsResource(self._http)
        self.triggers = TriggersResource(self._http)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._http.close()

    def __enter__(self) -> ArcaneClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class AsyncArcaneClient:
    """Asynchronous Arcane API client."""

    tools: AsyncToolsResource
    connections: AsyncConnectionsResource
    executions: AsyncExecutionsResource
    triggers: AsyncTriggersResource

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout_s: float = 30.0,
    ) -> None:
        self._http = AsyncHttpClient(api_key=api_key, base_url=base_url, timeout_s=timeout_s)
        self.tools = AsyncToolsResource(self._http)
        self.connections = AsyncConnectionsResource(self._http)
        self.executions = AsyncExecutionsResource(self._http)
        self.triggers = AsyncTriggersResource(self._http)

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._http.aclose()

    async def __aenter__(self) -> AsyncArcaneClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()
