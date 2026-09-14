"""
Shared types used across the Arcane SDK.

All types are plain dataclasses (not Pydantic) to keep the SDK dependency-free.
JSON deserialization uses from_dict() class methods.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Generic, Literal, TypeVar

T = TypeVar("T")


# ── Pagination ─────────────────────────────────────────────────────────────────

@dataclass
class PageResult(Generic[T]):
    data: list[T]
    next_cursor: str | None

    @classmethod
    def from_dict(cls, d: dict[str, Any], item_cls: Any) -> PageResult[Any]:
        return cls(
            data=[item_cls.from_dict(i) for i in d.get("data", [])],
            next_cursor=d.get("next_cursor"),
        )


# ── Toolkits & Tools ───────────────────────────────────────────────────────────

@dataclass
class Toolkit:
    id: str
    slug: str
    name: str
    description: str
    provider: str
    status: Literal["ACTIVE", "DEPRECATED"]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Toolkit:
        return cls(
            id=d["id"],
            slug=d["slug"],
            name=d["name"],
            description=d.get("description", ""),
            provider=d.get("provider", ""),
            status=d["status"],
            created_at=d["created_at"],
        )


@dataclass
class ToolVersion:
    tool_version_id: str
    version: int
    published_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ToolVersion:
        return cls(
            tool_version_id=d["tool_version_id"],
            version=d["version"],
            published_at=d.get("published_at", ""),
        )


@dataclass
class Tool:
    id: str
    toolkit_id: str
    slug: str
    name: str
    description: str
    action_type: str
    status: Literal["ACTIVE", "DEPRECATED"]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    created_at: str
    latest_version: ToolVersion | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Tool:
        lv = d.get("latest_version")
        return cls(
            id=d["id"],
            toolkit_id=d.get("toolkit_id", ""),
            slug=d["slug"],
            name=d["name"],
            description=d.get("description", ""),
            action_type=d.get("action_type", ""),
            status=d["status"],
            input_schema=d.get("input_schema", {}),
            output_schema=d.get("output_schema", {}),
            created_at=d["created_at"],
            latest_version=ToolVersion.from_dict(lv) if lv else None,
        )


# ── Connections ────────────────────────────────────────────────────────────────

@dataclass
class Connection:
    id: str
    toolkit_id: str
    external_user_id: str
    status: Literal["ACTIVE", "PENDING", "REVOKED", "ERROR"]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Connection:
        return cls(
            id=d["id"],
            toolkit_id=d.get("toolkit_id", ""),
            external_user_id=d.get("external_user_id", ""),
            status=d["status"],
            created_at=d["created_at"],
            updated_at=d.get("updated_at", d["created_at"]),
        )


@dataclass
class OAuthInitiateResult:
    redirect_url: str
    state: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> OAuthInitiateResult:
        return cls(redirect_url=d["redirect_url"], state=d["state"])


# ── Executions ─────────────────────────────────────────────────────────────────

ExecutionStatus = Literal[
    "PENDING", "AUTHORIZING", "RUNNING", "SUCCEEDED", "FAILED", "REJECTED", "TIMED_OUT"
]

TERMINAL_STATUSES: frozenset[str] = frozenset(
    {"SUCCEEDED", "FAILED", "REJECTED", "TIMED_OUT"}
)


@dataclass
class Execution:
    id: str
    tool_version_id: str
    connection_id: str
    environment_id: str
    status: str  # ExecutionStatus
    output: dict[str, Any] | None
    error: str | None
    started_at: str | None
    completed_at: str | None
    created_at: str

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def succeeded(self) -> bool:
        return self.status == "SUCCEEDED"

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Execution:
        return cls(
            id=d["id"],
            tool_version_id=d.get("tool_version_id", ""),
            connection_id=d.get("connection_id", ""),
            environment_id=d.get("environment_id", ""),
            status=d["status"],
            output=d.get("output"),
            error=d.get("error"),
            started_at=d.get("started_at"),
            completed_at=d.get("completed_at"),
            created_at=d["created_at"],
        )


@dataclass
class ExecuteResult:
    execution_id: str
    status: str  # ExecutionStatus
    tool: str
    tool_version: int
    message: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ExecuteResult:
        return cls(
            execution_id=d["execution_id"],
            status=d["status"],
            tool=d.get("tool", ""),
            tool_version=d.get("tool_version", 0),
            message=d.get("message", ""),
        )


# ── Triggers ───────────────────────────────────────────────────────────────────

@dataclass
class Trigger:
    id: str
    environment_id: str
    slug: str
    name: str
    description: str | None
    status: Literal["ACTIVE", "PAUSED", "DELETED"]
    provider: str
    configuration: dict[str, Any]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Trigger:
        return cls(
            id=d["id"],
            environment_id=d.get("environment_id", ""),
            slug=d["slug"],
            name=d["name"],
            description=d.get("description"),
            status=d["status"],
            provider=d.get("provider", ""),
            configuration=d.get("configuration", {}),
            created_at=d["created_at"],
            updated_at=d.get("updated_at", d["created_at"]),
        )


@dataclass
class Subscription:
    id: str
    trigger_id: str
    destination_id: str
    external_user_id: str
    status: Literal["ACTIVE", "PAUSED", "DELETED"]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Subscription:
        return cls(
            id=d["id"],
            trigger_id=d["trigger_id"],
            destination_id=d["destination_id"],
            external_user_id=d.get("external_user_id", ""),
            status=d["status"],
            created_at=d["created_at"],
        )


@dataclass
class WebhookDestination:
    id: str
    environment_id: str
    name: str
    url: str
    status: Literal["ACTIVE", "DELETED"]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WebhookDestination:
        return cls(
            id=d["id"],
            environment_id=d.get("environment_id", ""),
            name=d["name"],
            url=d["url"],
            status=d["status"],
            created_at=d["created_at"],
        )
