"""SGRS API client — HTTP REST + optional NATS real-time events."""

from typing import Any, Generic, Optional, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .events.api import EventsApi, NatsConfig
from .schema import (
    Agent,
    ConnectModelRequest,
    FinalityCertificate,
    FinalityStatus,
    ModelHandle,
    Scope,
    ScopeId,
)

__all__ = ["ApiError", "ApiResponse", "Client", "create_client", "NatsConfig"]

T = TypeVar("T", bound=BaseModel)


class ApiError(Exception):
    """Exception raised for API errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        details: Optional[dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(f"{code}: {message}")


class ApiResponse(Generic[T]):
    """Response from an API call."""

    def __init__(self, ok: bool, status_code: int, data: Optional[T] = None, error: Optional[ApiError] = None):
        self.ok = ok
        self.status_code = status_code
        self.data = data
        self.error = error


class Client:
    """SGRS client — unified HTTP REST + optional NATS real-time events.

    Minimal async example (HTTP only, no ``nats-py``)::

        client = Client(base_url='http://localhost:3003')
        scope = await client.get_scope('my-scope')

    With NATS real-time events (install ``pip install 'sgrs-client[nats]'``)::

        from sgrs_client.events import NatsConfig

        client = Client(
            base_url='http://localhost:3003',
            nats=NatsConfig(servers='nats://localhost:4222'),
        )
        await client.connect()

        # CRITICAL PATH — veto propagation to all swarm agents
        await client.events.on_veto_activated('acme', my_veto_handler)

        # Terminal convergence
        await client.events.on_finality_final('acme', 'scope-1', my_final_handler)

        await client.close()  # drain + disconnect
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        verify_ssl: bool = True,
        nats: Optional[NatsConfig] = None,
    ):
        """Initialize the SGRS client.

        Args:
            base_url:   Base URL of the SGRS API (e.g., http://localhost:3003)
            api_key:    Optional API key for Authorization: Bearer header
            timeout:    HTTP request timeout in seconds (default: 30)
            verify_ssl: Verify SSL certificates (default: True)
            nats:       Optional NATS config for real-time event transport.
                        When provided, call ``await client.connect()`` to
                        establish the NATS connection before subscribing.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._verify_ssl = verify_ssl

        # HTTP transport
        self._async_client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            verify=verify_ssl,
            headers=self._get_headers(),
        )
        self._sync_client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            verify=verify_ssl,
            headers=self._get_headers(),
        )

        # Real-time event transport (NATS — optional)
        self.events = EventsApi(nats)

    def _get_headers(self) -> dict[str, str]:
        """Get request headers."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _async_request(
        self,
        method: str,
        path: str,
        model: type[T],
        body: Optional[dict[str, Any]] = None,
    ) -> ApiResponse[T]:
        """Make an async HTTP request."""
        try:
            response = await self._async_client.request(method, path, json=body)
            response.raise_for_status()

            data = response.json()
            if isinstance(data, dict):
                validated = model.model_validate(data)
            else:
                validated = model.model_validate({"data": data})

            return ApiResponse(ok=True, status_code=response.status_code, data=validated)

        except httpx.HTTPStatusError as e:
            try:
                error_data = e.response.json()
                error = ApiError(
                    code=error_data.get("code", f"HTTP_{e.response.status_code}"),
                    message=error_data.get("message", str(e)),
                    status_code=e.response.status_code,
                    details=error_data.get("details"),
                )
            except Exception:
                error = ApiError(
                    code=f"HTTP_{e.response.status_code}",
                    message=str(e),
                    status_code=e.response.status_code,
                )
            return ApiResponse(ok=False, status_code=e.response.status_code, error=error)

        except ValidationError as e:
            error = ApiError(
                code="VALIDATION_ERROR",
                message="Response validation failed",
                status_code=500,
                details={"errors": e.errors()},
            )
            return ApiResponse(ok=False, status_code=500, error=error)

        except Exception as e:
            error = ApiError(
                code="REQUEST_ERROR",
                message=str(e),
                status_code=0,
            )
            return ApiResponse(ok=False, status_code=0, error=error)

    def _sync_request(
        self,
        method: str,
        path: str,
        model: type[T],
        body: Optional[dict[str, Any]] = None,
    ) -> ApiResponse[T]:
        """Make a sync HTTP request."""
        try:
            response = self._sync_client.request(method, path, json=body)
            response.raise_for_status()

            data = response.json()
            if isinstance(data, dict):
                validated = model.model_validate(data)
            else:
                validated = model.model_validate({"data": data})

            return ApiResponse(ok=True, status_code=response.status_code, data=validated)

        except httpx.HTTPStatusError as e:
            try:
                error_data = e.response.json()
                error = ApiError(
                    code=error_data.get("code", f"HTTP_{e.response.status_code}"),
                    message=error_data.get("message", str(e)),
                    status_code=e.response.status_code,
                    details=error_data.get("details"),
                )
            except Exception:
                error = ApiError(
                    code=f"HTTP_{e.response.status_code}",
                    message=str(e),
                    status_code=e.response.status_code,
                )
            return ApiResponse(ok=False, status_code=e.response.status_code, error=error)

        except ValidationError as e:
            error = ApiError(
                code="VALIDATION_ERROR",
                message="Response validation failed",
                status_code=500,
                details={"errors": e.errors()},
            )
            return ApiResponse(ok=False, status_code=500, error=error)

        except Exception as e:
            error = ApiError(
                code="REQUEST_ERROR",
                message=str(e),
                status_code=0,
            )
            return ApiResponse(ok=False, status_code=0, error=error)

    async def connect(self) -> None:
        """Connect the NATS real-time transport.

        Safe no-op when ``nats`` was not passed to the constructor.
        Must be called before using ``client.events`` subscriptions.
        """
        await self.events.connect()

    async def close(self) -> None:
        """Close both the HTTP keepalive pool and the NATS connection.

        Drains any in-flight NATS messages before closing.
        Safe to call even when NATS is not configured.
        """
        await self.events.close()
        await self._async_client.aclose()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self._sync_client.close()

    async def __aenter__(self) -> "Client":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    # Scopes API
    async def list_scopes(self) -> ApiResponse[list[Scope]]:
        """List all scopes (async)."""
        # Note: This is a simplified example. Full implementation would handle list responses
        raise NotImplementedError("List responses require special handling")

    def list_scopes_sync(self) -> ApiResponse[list[Scope]]:
        """List all scopes (sync)."""
        raise NotImplementedError("List responses require special handling")

    async def get_scope(self, scope_id: ScopeId) -> ApiResponse[Scope]:
        """Get a specific scope by ID (async)."""
        return await self._async_request("GET", f"/api/v1/scopes/{scope_id}", Scope)

    def get_scope_sync(self, scope_id: ScopeId) -> ApiResponse[Scope]:
        """Get a specific scope by ID (sync)."""
        return self._sync_request("GET", f"/api/v1/scopes/{scope_id}", Scope)

    async def create_scope(self, name: str, tag: str, **kwargs) -> ApiResponse[Scope]:
        """Create a new scope (async)."""
        body = {"name": name, "tag": tag, **kwargs}
        return await self._async_request("POST", "/api/v1/scopes", Scope, body)

    def create_scope_sync(self, name: str, tag: str, **kwargs) -> ApiResponse[Scope]:
        """Create a new scope (sync)."""
        body = {"name": name, "tag": tag, **kwargs}
        return self._sync_request("POST", "/api/v1/scopes", Scope, body)

    async def update_scope(self, scope_id: ScopeId, **kwargs) -> ApiResponse[Scope]:
        """Update an existing scope (async)."""
        return await self._async_request("PATCH", f"/api/v1/scopes/{scope_id}", Scope, kwargs)

    def update_scope_sync(self, scope_id: ScopeId, **kwargs) -> ApiResponse[Scope]:
        """Update an existing scope (sync)."""
        return self._sync_request("PATCH", f"/api/v1/scopes/{scope_id}", Scope, kwargs)

    # Models API
    async def connect_model(self, request: ConnectModelRequest) -> ApiResponse[ModelHandle]:
        """Connect a new LLM model provider (async)."""
        return await self._async_request(
            "POST",
            "/api/v1/models/connect",
            ModelHandle,
            request.model_dump(),
        )

    def connect_model_sync(self, request: ConnectModelRequest) -> ApiResponse[ModelHandle]:
        """Connect a new LLM model provider (sync)."""
        return self._sync_request(
            "POST",
            "/api/v1/models/connect",
            ModelHandle,
            request.model_dump(),
        )

    async def get_model(self, handle: str) -> ApiResponse[ModelHandle]:
        """Get a connected model (async)."""
        return await self._async_request("GET", f"/api/v1/models/{handle}", ModelHandle)

    def get_model_sync(self, handle: str) -> ApiResponse[ModelHandle]:
        """Get a connected model (sync)."""
        return self._sync_request("GET", f"/api/v1/models/{handle}", ModelHandle)

    # Finality API
    async def get_finality_status(self, scope_id: ScopeId) -> ApiResponse[FinalityStatus]:
        """Get finality status for a scope (async)."""
        return await self._async_request(
            "GET", f"/api/v1/finality/{scope_id}", FinalityStatus
        )

    def get_finality_status_sync(self, scope_id: ScopeId) -> ApiResponse[FinalityStatus]:
        """Get finality status for a scope (sync)."""
        return self._sync_request(
            "GET", f"/api/v1/finality/{scope_id}", FinalityStatus
        )

    async def get_finality_certificate(
        self, scope_id: ScopeId, round: int
    ) -> ApiResponse[FinalityCertificate]:
        """Get a finality certificate by round (async)."""
        return await self._async_request(
            "GET",
            f"/api/v1/finality/{scope_id}/certificate/{round}",
            FinalityCertificate,
        )

    def get_finality_certificate_sync(
        self, scope_id: ScopeId, round: int
    ) -> ApiResponse[FinalityCertificate]:
        """Get a finality certificate by round (sync)."""
        return self._sync_request(
            "GET",
            f"/api/v1/finality/{scope_id}/certificate/{round}",
            FinalityCertificate,
        )


def create_client(
    base_url: str,
    api_key: Optional[str] = None,
    timeout: float = 30.0,
    verify_ssl: bool = True,
    nats: Optional[NatsConfig] = None,
) -> Client:
    """Create a new SGRS client.

    Args:
        base_url:   Base URL of the SGRS API
        api_key:    Optional API key for Authorization: Bearer header
        timeout:    HTTP request timeout in seconds (default: 30)
        verify_ssl: Verify SSL certificates (default: True)
        nats:       Optional NatsConfig for real-time event streaming.
                    Requires: pip install 'sgrs-client[nats]'

    Returns:
        Initialized Client instance.

    Example — HTTP only::

        client = create_client(base_url='https://api.example.com')

    Example — with real-time NATS::

        from sgrs_client.events import NatsConfig

        client = create_client(
            base_url='https://api.example.com',
            nats=NatsConfig(servers='nats://localhost:4222'),
        )
        await client.connect()
        await client.events.on_veto_activated('acme', handler)
    """
    return Client(
        base_url=base_url,
        api_key=api_key,
        timeout=timeout,
        verify_ssl=verify_ssl,
        nats=nats,
    )
