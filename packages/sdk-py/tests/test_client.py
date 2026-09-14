"""Unit tests for ArcaneClient and AsyncArcaneClient."""

from __future__ import annotations

import json
import time
from typing import Any
from unittest.mock import patch, MagicMock

import httpx
import pytest
import respx

from arcane import ArcaneClient, AsyncArcaneClient
from arcane.errors import ArcaneApiError, ArcaneAuthError, ArcaneTimeoutError
from arcane.types import (
    Connection,
    Execution,
    ExecuteResult,
    PageResult,
    Subscription,
    Toolkit,
    Tool,
    Trigger,
    WebhookDestination,
)

BASE_URL = "https://api.arcane.run/v1"
API_KEY = "arc_live_testkey123"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client() -> ArcaneClient:
    return ArcaneClient(api_key=API_KEY, base_url=BASE_URL)


@pytest.fixture
def async_client() -> AsyncArcaneClient:
    return AsyncArcaneClient(api_key=API_KEY, base_url=BASE_URL)


def toolkit_payload(**overrides: Any) -> dict:
    base = {
        "id": "tk_abc",
        "slug": "github",
        "name": "GitHub",
        "description": "GitHub toolkit",
        "provider": "github",
        "status": "ACTIVE",
        "created_at": "2024-01-01T00:00:00Z",
    }
    return {**base, **overrides}


def tool_payload(**overrides: Any) -> dict:
    base = {
        "id": "tool_abc",
        "toolkit_id": "tk_abc",
        "slug": "list_repos",
        "name": "List Repos",
        "description": "Lists GitHub repos",
        "action_type": "READ",
        "status": "ACTIVE",
        "input_schema": {},
        "output_schema": {},
        "created_at": "2024-01-01T00:00:00Z",
    }
    return {**base, **overrides}


def connection_payload(**overrides: Any) -> dict:
    base = {
        "id": "conn_abc",
        "external_user_id": "user_1",
        "toolkit_id": "tk_abc",
        "status": "ACTIVE",
        "scopes": [],
        "metadata": {},
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }
    return {**base, **overrides}


def execution_payload(**overrides: Any) -> dict:
    base = {
        "id": "exec_abc",
        "connection_id": "conn_abc",
        "toolkit_slug": "github",
        "tool_slug": "list_repos",
        "status": "SUCCEEDED",
        "input": {},
        "output": {"repos": []},
        "error": None,
        "session_id": None,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        "completed_at": "2024-01-01T00:00:01Z",
    }
    return {**base, **overrides}


def page_payload(items: list) -> dict:
    return {"data": items, "next_cursor": None, "total": len(items)}


def trigger_payload(**overrides: Any) -> dict:
    base = {
        "id": "trig_abc",
        "slug": "pr_opened",
        "name": "PR Opened",
        "provider": "github",
        "description": None,
        "configuration": {},
        "status": "ACTIVE",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }
    return {**base, **overrides}


# ── Sync client tests ─────────────────────────────────────────────────────────

class TestToolsSync:
    @respx.mock
    def test_list_toolkits(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits").mock(
            return_value=httpx.Response(200, json=page_payload([toolkit_payload()]))
        )
        result = client.tools.list_toolkits()
        assert isinstance(result, PageResult)
        assert len(result.data) == 1
        assert result.data[0].slug == "github"

    @respx.mock
    def test_list_toolkits_with_query(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits").mock(
            return_value=httpx.Response(200, json=page_payload([toolkit_payload()]))
        )
        result = client.tools.list_toolkits(q="github")
        assert len(result.data) == 1

    @respx.mock
    def test_list_tools(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits/github/tools").mock(
            return_value=httpx.Response(200, json=page_payload([tool_payload()]))
        )
        result = client.tools.list_tools("github")
        assert len(result.data) == 1
        assert result.data[0].slug == "list_repos"

    @respx.mock
    def test_get_tool(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits/github/tools/list_repos").mock(
            return_value=httpx.Response(200, json=tool_payload())
        )
        tool = client.tools.get_tool("github", "list_repos")
        assert isinstance(tool, Tool)
        assert tool.slug == "list_repos"


class TestConnectionsSync:
    @respx.mock
    def test_list_connections(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/connections").mock(
            return_value=httpx.Response(200, json=page_payload([connection_payload()]))
        )
        result = client.connections.list()
        assert len(result.data) == 1
        assert result.data[0].status == "ACTIVE"

    @respx.mock
    def test_get_connection(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/connections/conn_abc").mock(
            return_value=httpx.Response(200, json=connection_payload())
        )
        conn = client.connections.get("conn_abc")
        assert isinstance(conn, Connection)
        assert conn.id == "conn_abc"

    @respx.mock
    def test_initiate_oauth(self, client: ArcaneClient) -> None:
        respx.post(f"{BASE_URL}/connections/oauth/initiate").mock(
            return_value=httpx.Response(200, json={
                "redirect_url": "https://github.com/login/oauth/authorize?...",
                "state": "some_state_token",
            })
        )
        result = client.connections.initiate_oauth(
            toolkit_slug="github",
            external_user_id="user_1",
            redirect_uri="https://myapp.com/callback",
        )
        assert result.redirect_url.startswith("https://github.com")

    @respx.mock
    def test_revoke_connection(self, client: ArcaneClient) -> None:
        respx.delete(f"{BASE_URL}/connections/conn_abc").mock(
            return_value=httpx.Response(204)
        )
        client.connections.revoke("conn_abc")  # Should not raise


class TestExecutionsSync:
    @respx.mock
    def test_execute(self, client: ArcaneClient) -> None:
        respx.post(f"{BASE_URL}/execute").mock(
            return_value=httpx.Response(202, json={
                "execution_id": "exec_abc",
                "status": "PENDING",
            })
        )
        result = client.executions.execute(
            tool="github.list_repos",
            connection_id="conn_abc",
            input={"owner": "acme"},
        )
        assert isinstance(result, ExecuteResult)
        assert result.execution_id == "exec_abc"

    def test_execute_invalid_tool_format(self, client: ArcaneClient) -> None:
        with pytest.raises(ValueError, match="tool must be"):
            client.executions.execute(
                tool="invalid-format",
                connection_id="conn_abc",
                input={},
            )

    @respx.mock
    def test_get_execution(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/executions/exec_abc").mock(
            return_value=httpx.Response(200, json=execution_payload())
        )
        exec_ = client.executions.get("exec_abc")
        assert isinstance(exec_, Execution)
        assert exec_.status == "SUCCEEDED"
        assert exec_.is_terminal is True
        assert exec_.succeeded is True

    @respx.mock
    def test_list_executions(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/executions").mock(
            return_value=httpx.Response(200, json=page_payload([execution_payload()]))
        )
        result = client.executions.list()
        assert len(result.data) == 1

    @respx.mock
    def test_wait_for_already_terminal(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/executions/exec_abc").mock(
            return_value=httpx.Response(200, json=execution_payload(status="SUCCEEDED"))
        )
        exec_ = client.executions.wait_for("exec_abc")
        assert exec_.succeeded is True

    @respx.mock
    def test_wait_for_polls_until_done(self, client: ArcaneClient) -> None:
        call_count = 0

        def respond(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            status = "RUNNING" if call_count < 3 else "SUCCEEDED"
            return httpx.Response(200, json=execution_payload(status=status))

        respx.get(f"{BASE_URL}/executions/exec_abc").mock(side_effect=respond)
        exec_ = client.executions.wait_for("exec_abc", interval_s=0.01)
        assert call_count == 3
        assert exec_.succeeded is True

    @respx.mock
    def test_wait_for_timeout(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/executions/exec_abc").mock(
            return_value=httpx.Response(200, json=execution_payload(status="RUNNING"))
        )
        with pytest.raises(ArcaneTimeoutError):
            client.executions.wait_for("exec_abc", timeout_s=0.05, interval_s=0.01)


class TestTriggersSync:
    @respx.mock
    def test_create_trigger(self, client: ArcaneClient) -> None:
        respx.post(f"{BASE_URL}/triggers").mock(
            return_value=httpx.Response(201, json=trigger_payload())
        )
        trig = client.triggers.create(
            slug="pr_opened",
            name="PR Opened",
            provider="github",
        )
        assert isinstance(trig, Trigger)
        assert trig.slug == "pr_opened"

    @respx.mock
    def test_list_triggers(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/triggers").mock(
            return_value=httpx.Response(200, json=page_payload([trigger_payload()]))
        )
        result = client.triggers.list()
        assert len(result.data) == 1

    @respx.mock
    def test_get_trigger(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/triggers/trig_abc").mock(
            return_value=httpx.Response(200, json=trigger_payload())
        )
        trig = client.triggers.get("trig_abc")
        assert trig.id == "trig_abc"

    @respx.mock
    def test_update_trigger(self, client: ArcaneClient) -> None:
        respx.patch(f"{BASE_URL}/triggers/trig_abc").mock(
            return_value=httpx.Response(200, json=trigger_payload(name="Updated"))
        )
        trig = client.triggers.update("trig_abc", name="Updated")
        assert trig.name == "Updated"

    @respx.mock
    def test_delete_trigger(self, client: ArcaneClient) -> None:
        respx.delete(f"{BASE_URL}/triggers/trig_abc").mock(
            return_value=httpx.Response(204)
        )
        client.triggers.delete("trig_abc")  # Should not raise

    @respx.mock
    def test_subscribe(self, client: ArcaneClient) -> None:
        respx.post(f"{BASE_URL}/triggers/trig_abc/subscriptions").mock(
            return_value=httpx.Response(200, json={
                "id": "sub_abc",
                "trigger_id": "trig_abc",
                "destination_id": "dest_abc",
                "external_user_id": "user_1",
                "status": "ACTIVE",
                "created_at": "2024-01-01T00:00:00Z",
            })
        )
        sub = client.triggers.subscribe(
            "trig_abc",
            destination_id="dest_abc",
            external_user_id="user_1",
        )
        assert isinstance(sub, Subscription)
        assert sub.id == "sub_abc"

    @respx.mock
    def test_create_destination(self, client: ArcaneClient) -> None:
        respx.post(f"{BASE_URL}/webhook-destinations").mock(
            return_value=httpx.Response(201, json={
                "id": "dest_abc",
                "environment_id": "env_abc",
                "name": "My Webhook",
                "url": "https://myapp.com/webhook",
                "status": "ACTIVE",
                "created_at": "2024-01-01T00:00:00Z",
            })
        )
        dest = client.triggers.create_destination(
            name="My Webhook",
            url="https://myapp.com/webhook",
        )
        assert isinstance(dest, WebhookDestination)
        assert dest.url == "https://myapp.com/webhook"


# ── Error handling tests ──────────────────────────────────────────────────────

class TestErrorHandling:
    @respx.mock
    def test_auth_error(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/connections").mock(
            return_value=httpx.Response(401, json={
                "error": {"code": "UNAUTHORIZED", "message": "Invalid API key"}
            })
        )
        with pytest.raises(ArcaneAuthError) as exc_info:
            client.connections.list()
        assert exc_info.value.status == 401

    @respx.mock
    def test_api_error_with_code(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/connections/bad_id").mock(
            return_value=httpx.Response(404, json={
                "error": {"code": "NOT_FOUND", "message": "Connection not found"}
            })
        )
        with pytest.raises(ArcaneApiError) as exc_info:
            client.connections.get("bad_id")
        assert exc_info.value.status == 404
        assert exc_info.value.code == "NOT_FOUND"

    @respx.mock
    def test_api_error_plain_message(self, client: ArcaneClient) -> None:
        respx.get(f"{BASE_URL}/connections/bad_id").mock(
            return_value=httpx.Response(500, json={"message": "Internal server error"})
        )
        with pytest.raises(ArcaneApiError) as exc_info:
            client.connections.get("bad_id")
        assert exc_info.value.status == 500

    def test_auth_header_sent(self, client: ArcaneClient) -> None:
        with respx.mock:
            route = respx.get(f"{BASE_URL}/connections").mock(
                return_value=httpx.Response(200, json=page_payload([]))
            )
            client.connections.list()
            assert route.called
            request = route.calls.last.request
            assert request.headers.get("X-Api-Key") == API_KEY


# ── Context manager tests ────────────────────────────────────────────────────

class TestContextManager:
    def test_sync_context_manager(self) -> None:
        with ArcaneClient(api_key=API_KEY) as c:
            assert isinstance(c, ArcaneClient)
        # close() should have been called; no assertion needed beyond no exception

    @pytest.mark.asyncio
    async def test_async_context_manager(self) -> None:
        async with AsyncArcaneClient(api_key=API_KEY) as c:
            assert isinstance(c, AsyncArcaneClient)


# ── Async client tests ────────────────────────────────────────────────────────

class TestToolsAsync:
    @pytest.mark.asyncio
    @respx.mock
    async def test_list_toolkits(self, async_client: AsyncArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits").mock(
            return_value=httpx.Response(200, json=page_payload([toolkit_payload()]))
        )
        result = await async_client.tools.list_toolkits()
        assert len(result.data) == 1
        assert isinstance(result.data[0], Toolkit)

    @pytest.mark.asyncio
    @respx.mock
    async def test_get_tool(self, async_client: AsyncArcaneClient) -> None:
        respx.get(f"{BASE_URL}/toolkits/github/tools/list_repos").mock(
            return_value=httpx.Response(200, json=tool_payload())
        )
        tool = await async_client.tools.get_tool("github", "list_repos")
        assert tool.slug == "list_repos"


class TestExecutionsAsync:
    @pytest.mark.asyncio
    @respx.mock
    async def test_execute(self, async_client: AsyncArcaneClient) -> None:
        respx.post(f"{BASE_URL}/execute").mock(
            return_value=httpx.Response(202, json={
                "execution_id": "exec_abc",
                "status": "PENDING",
            })
        )
        result = await async_client.executions.execute(
            tool="github.list_repos",
            connection_id="conn_abc",
            input={"owner": "acme"},
        )
        assert result.execution_id == "exec_abc"

    @pytest.mark.asyncio
    async def test_execute_invalid_tool_format(self, async_client: AsyncArcaneClient) -> None:
        with pytest.raises(ValueError, match="tool must be"):
            await async_client.executions.execute(
                tool="no_dot",
                connection_id="conn_abc",
                input={},
            )

    @pytest.mark.asyncio
    @respx.mock
    async def test_wait_for_timeout(self, async_client: AsyncArcaneClient) -> None:
        respx.get(f"{BASE_URL}/executions/exec_abc").mock(
            return_value=httpx.Response(200, json=execution_payload(status="RUNNING"))
        )
        with pytest.raises(ArcaneTimeoutError):
            await async_client.executions.wait_for("exec_abc", timeout_s=0.05, interval_s=0.01)

    @pytest.mark.asyncio
    @respx.mock
    async def test_wait_for_success(self, async_client: AsyncArcaneClient) -> None:
        call_count = 0

        def respond(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            status = "RUNNING" if call_count < 2 else "SUCCEEDED"
            return httpx.Response(200, json=execution_payload(status=status))

        respx.get(f"{BASE_URL}/executions/exec_abc").mock(side_effect=respond)
        exec_ = await async_client.executions.wait_for("exec_abc", interval_s=0.01)
        assert exec_.succeeded is True
