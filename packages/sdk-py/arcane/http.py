"""
Thin HTTP transport layer for the Arcane SDK.

Uses httpx for both sync and async support:
  - _HttpClient      — synchronous (default)
  - _AsyncHttpClient — async variant used by AsyncArcaneClient

Attaches the X-Api-Key header, handles non-2xx responses, and never exposes
raw credentials in exception messages.
"""

from __future__ import annotations

from typing import Any

import httpx

from .errors import ArcaneApiError, ArcaneAuthError, ArcaneError

DEFAULT_BASE_URL = "https://api.arcane.run"
SDK_VERSION = "0.1.0"
_USER_AGENT = f"arcane-python/{SDK_VERSION}"


def _build_headers(api_key: str) -> dict[str, str]:
    return {
        "X-Api-Key": api_key,
        "Content-Type": "application/json",
        "User-Agent": _USER_AGENT,
    }


def _raise_for_response(response: httpx.Response) -> None:
    """Convert a non-2xx httpx.Response into an ArcaneError subclass."""
    if response.is_success:
        return

    request_id = response.headers.get("x-request-id")
    message: str = response.reason_phrase or "Unknown error"
    code: str | None = None

    try:
        body: dict[str, Any] = response.json()
        # Support both flat {"message": "..."} and nested {"error": {"message": ..., "code": ...}}
        if isinstance(body.get("error"), dict):
            err = body["error"]
            message = err.get("message", message)
            code = err.get("code")
        else:
            message = body.get("message", body.get("error", message))
            code = body.get("code")
    except Exception:
        pass  # Use status text fallback

    status = response.status_code
    if status in (401, 403):
        raise ArcaneAuthError(message, request_id)
    raise ArcaneApiError(status, message, request_id, code)


class HttpClient:
    """Synchronous HTTP client."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_s: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = _build_headers(api_key)
        self._timeout = timeout_s
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=self._headers,
            timeout=timeout_s,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> HttpClient:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        # Strip None params
        clean_params = (
            {k: v for k, v in params.items() if v is not None}
            if params
            else None
        )
        try:
            resp = self._client.request(
                method,
                path,
                params=clean_params,
                json=json,
            )
        except httpx.TimeoutException as exc:
            raise ArcaneError(f"Request timed out: {exc}") from exc
        except httpx.RequestError as exc:
            raise ArcaneError(f"Network error: {exc}") from exc

        _raise_for_response(resp)

        if resp.status_code == 204:
            return None
        return resp.json()

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def post(self, path: str, json: Any = None) -> Any:
        return self._request("POST", path, json=json)

    def patch(self, path: str, json: Any = None) -> Any:
        return self._request("PATCH", path, json=json)

    def delete(self, path: str) -> Any:
        return self._request("DELETE", path)


class AsyncHttpClient:
    """Async HTTP client (used by AsyncArcaneClient)."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_s: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = _build_headers(api_key)
        self._timeout = timeout_s
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=timeout_s,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> AsyncHttpClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        clean_params = (
            {k: v for k, v in params.items() if v is not None}
            if params
            else None
        )
        try:
            resp = await self._client.request(
                method,
                path,
                params=clean_params,
                json=json,
            )
        except httpx.TimeoutException as exc:
            raise ArcaneError(f"Request timed out: {exc}") from exc
        except httpx.RequestError as exc:
            raise ArcaneError(f"Network error: {exc}") from exc

        _raise_for_response(resp)

        if resp.status_code == 204:
            return None
        return resp.json()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, json: Any = None) -> Any:
        return await self._request("POST", path, json=json)

    async def patch(self, path: str, json: Any = None) -> Any:
        return await self._request("PATCH", path, json=json)

    async def delete(self, path: str) -> Any:
        return await self._request("DELETE", path)
