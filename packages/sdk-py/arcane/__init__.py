"""
Arcane Python SDK — execute tools, manage connections, and observe executions.

Usage::

    from arcane import ArcaneClient

    arcane = ArcaneClient(api_key="arc_live_...")

    result = arcane.executions.execute(
        tool="github.list_repos",
        connection_id="conn_...",
        input={"owner": "acme"},
    )

    done = arcane.executions.wait_for(result.execution_id)
    print(done.output)
"""

from .client import ArcaneClient, AsyncArcaneClient
from .errors import ArcaneError, ArcaneApiError, ArcaneAuthError, ArcaneTimeoutError
from .types import (
    Toolkit,
    Tool,
    Connection,
    Execution,
    ExecutionStatus,
    ExecuteResult,
    Trigger,
    Subscription,
    WebhookDestination,
    PageResult,
)

__all__ = [
    "ArcaneClient",
    "AsyncArcaneClient",
    # errors
    "ArcaneError",
    "ArcaneApiError",
    "ArcaneAuthError",
    "ArcaneTimeoutError",
    # types
    "Toolkit",
    "Tool",
    "Connection",
    "Execution",
    "ExecutionStatus",
    "ExecuteResult",
    "Trigger",
    "Subscription",
    "WebhookDestination",
    "PageResult",
]

__version__ = "0.1.0"
