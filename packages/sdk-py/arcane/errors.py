"""
Arcane SDK error hierarchy.

ArcaneError        — base class for all SDK errors
ArcaneApiError     — HTTP-level error with status code and request ID
ArcaneAuthError    — 401/403 authentication/authorization failure
ArcaneTimeoutError — poll / network timeout
"""

from __future__ import annotations


class ArcaneError(Exception):
    """Base class for all Arcane SDK errors."""


class ArcaneApiError(ArcaneError):
    """Raised when the API returns a non-2xx response."""

    def __init__(
        self,
        status: int,
        message: str,
        request_id: str | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.request_id = request_id
        self.code = code

    def __repr__(self) -> str:
        return (
            f"ArcaneApiError(status={self.status!r}, message={str(self)!r}, "
            f"code={self.code!r}, request_id={self.request_id!r})"
        )


class ArcaneAuthError(ArcaneApiError):
    """Raised on 401/403 responses — invalid or missing API key."""

    def __init__(
        self,
        message: str = "Authentication failed",
        request_id: str | None = None,
    ) -> None:
        super().__init__(401, message, request_id, "UNAUTHORIZED")


class ArcaneTimeoutError(ArcaneError):
    """Raised when polling an execution exceeds the deadline."""

    def __init__(self, message: str = "Operation timed out") -> None:
        super().__init__(message)
