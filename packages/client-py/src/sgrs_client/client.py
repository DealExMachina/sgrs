"""SGRS API client — HTTP REST + optional NATS real-time events."""

from typing import Any, Generic, Literal, Optional, TypeVar, Union
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from .events.api import EventsApi, NatsConfig
from .schema import (
    AddEpochCommentBody,
    Agent,
    Claim,
    ConnectModelRequest,
    Contradiction,
    ContradictionSeverity,
    CreateClaimBody,
    CreateContradictionBody,
    CreateDriftBody,
    CreateDocumentBody,
    CreateEpochBody,
    CreateRiskBody,
    DocumentStatus,
    Drift,
    DriftSeverity,
    EpochSummary,
    FinalityCertificate,
    FinalityDimension,
    FinalityStatus,
    IngestDocumentRequest,
    IngestDocumentResponse,
    ModelHandle,
    PatchDocumentBody,
    ResolveContradictionBody,
    Risk,
    RiskLevel,
    Scope,
    ScopeId,
    ScopeState,
    SgrsDocument,
    validate_tenant_id,
)

__all__ = ["ApiError", "ApiResponse", "Client", "create_client", "NatsConfig"]

T = TypeVar("T", bound=BaseModel)


def _enc(value: Any) -> str:
    """URL-encode a path parameter (mirrors JS ``encodeURIComponent``)."""
    return quote(str(value), safe="")


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

        client = Client(base_url='http://localhost:3003', tenant_id='acme')
        scope = await client.get_scope('my-scope')

    With NATS real-time events (install ``pip install 'sgrs-client[nats]'``)::

        from sgrs_client.events import NatsConfig

        client = Client(
            base_url='http://localhost:3003',
            tenant_id='acme',
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
        tenant_id: Optional[str] = None,
        timeout: float = 30.0,
        verify_ssl: bool = True,
        nats: Optional[NatsConfig] = None,
    ):
        """Initialize the SGRS client.

        Args:
            base_url:   Base URL of the SGRS API (e.g., http://localhost:3003)
            api_key:    Optional API key for Authorization: Bearer header
            tenant_id:  Tenant id sent as ``X-Tenant-ID`` on every authenticated
                        request. Validated against the ``TenantId`` contract
                        (lowercase a-z, 0-9, inner hyphens; max 64 chars).
            timeout:    HTTP request timeout in seconds (default: 30)
            verify_ssl: Verify SSL certificates (default: True)
            nats:       Optional NATS config for real-time event transport.
                        When provided, call ``await client.connect()`` to
                        establish the NATS connection before subscribing.

        Raises:
            ValueError: If ``tenant_id`` is provided but invalid.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.tenant_id = validate_tenant_id(tenant_id) if tenant_id else None
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
        """Get the base request headers (Content-Type, Accept, Authorization).

        The ``X-Tenant-ID`` header is applied per-request (see
        :meth:`_tenant_headers`) so it can be omitted on unauthenticated routes
        such as ``health``.
        """
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _tenant_headers(self, send_tenant: bool) -> dict[str, str]:
        """Per-request headers — carries ``X-Tenant-ID`` for authenticated calls."""
        if send_tenant and self.tenant_id:
            return {"X-Tenant-ID": self.tenant_id}
        return {}

    def _parse_data(
        self,
        data: Any,
        model: Optional[type[T]],
        is_list: bool,
        is_map: bool = False,
    ) -> Any:
        """Validate a decoded JSON body into the requested model shape.

        ``is_map`` handles object responses that map a string key to a list of
        ``model`` instances (e.g. the claims ``by-doc`` grouping).
        """
        if model is None:
            return data
        if is_map:
            return {key: [model.model_validate(item) for item in items] for key, items in data.items()}
        if is_list:
            return [model.model_validate(item) for item in data]
        return model.model_validate(data)

    def _error_from_status(self, exc: httpx.HTTPStatusError) -> ApiError:
        try:
            error_data = exc.response.json()
            return ApiError(
                code=error_data.get("code", f"HTTP_{exc.response.status_code}"),
                message=error_data.get("message", str(exc)),
                status_code=exc.response.status_code,
                details=error_data.get("details"),
            )
        except Exception:
            return ApiError(
                code=f"HTTP_{exc.response.status_code}",
                message=str(exc),
                status_code=exc.response.status_code,
            )

    async def _async_request(
        self,
        method: str,
        path: str,
        model: Optional[type[T]] = None,
        body: Optional[dict[str, Any]] = None,
        *,
        is_list: bool = False,
        is_map: bool = False,
        send_tenant: bool = True,
    ) -> ApiResponse[Any]:
        """Make an async HTTP request."""
        try:
            response = await self._async_client.request(
                method, path, json=body, headers=self._tenant_headers(send_tenant)
            )
            response.raise_for_status()

            data = self._parse_data(response.json(), model, is_list, is_map)
            return ApiResponse(ok=True, status_code=response.status_code, data=data)

        except httpx.HTTPStatusError as e:
            error = self._error_from_status(e)
            return ApiResponse(ok=False, status_code=e.response.status_code, error=error)

        except httpx.TimeoutException as e:
            error = ApiError(code="REQUEST_TIMEOUT", message=str(e) or "Request timed out", status_code=408)
            return ApiResponse(ok=False, status_code=408, error=error)

        except httpx.RequestError as e:
            error = ApiError(code="NETWORK_ERROR", message=str(e) or "Network error", status_code=0)
            return ApiResponse(ok=False, status_code=0, error=error)

        except ValidationError as e:
            error = ApiError(
                code="VALIDATION_ERROR",
                message="Response validation failed",
                status_code=500,
                details={"errors": e.errors()},
            )
            return ApiResponse(ok=False, status_code=500, error=error)

        except Exception as e:
            error = ApiError(code="REQUEST_ERROR", message=str(e), status_code=0)
            return ApiResponse(ok=False, status_code=0, error=error)

    def _sync_request(
        self,
        method: str,
        path: str,
        model: Optional[type[T]] = None,
        body: Optional[dict[str, Any]] = None,
        *,
        is_list: bool = False,
        is_map: bool = False,
        send_tenant: bool = True,
    ) -> ApiResponse[Any]:
        """Make a sync HTTP request."""
        try:
            response = self._sync_client.request(
                method, path, json=body, headers=self._tenant_headers(send_tenant)
            )
            response.raise_for_status()

            data = self._parse_data(response.json(), model, is_list, is_map)
            return ApiResponse(ok=True, status_code=response.status_code, data=data)

        except httpx.HTTPStatusError as e:
            error = self._error_from_status(e)
            return ApiResponse(ok=False, status_code=e.response.status_code, error=error)

        except httpx.TimeoutException as e:
            error = ApiError(code="REQUEST_TIMEOUT", message=str(e) or "Request timed out", status_code=408)
            return ApiResponse(ok=False, status_code=408, error=error)

        except httpx.RequestError as e:
            error = ApiError(code="NETWORK_ERROR", message=str(e) or "Network error", status_code=0)
            return ApiResponse(ok=False, status_code=0, error=error)

        except ValidationError as e:
            error = ApiError(
                code="VALIDATION_ERROR",
                message="Response validation failed",
                status_code=500,
                details={"errors": e.errors()},
            )
            return ApiResponse(ok=False, status_code=500, error=error)

        except Exception as e:
            error = ApiError(code="REQUEST_ERROR", message=str(e), status_code=0)
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

    @staticmethod
    def _dump(body: Union[BaseModel, dict[str, Any]]) -> dict[str, Any]:
        """Serialize a request body (Pydantic model or plain dict) to JSON-ready dict."""
        if isinstance(body, BaseModel):
            return body.model_dump(mode="json", exclude_none=True)
        return body

    # ── Scopes API ───────────────────────────────────────────────────────────
    async def list_scopes(self) -> ApiResponse[list[Scope]]:
        """List all scopes for the configured tenant (async)."""
        return await self._async_request("GET", "/api/scopes", Scope, is_list=True)

    def list_scopes_sync(self) -> ApiResponse[list[Scope]]:
        """List all scopes for the configured tenant (sync)."""
        return self._sync_request("GET", "/api/scopes", Scope, is_list=True)

    async def get_scope(self, scope_id: ScopeId) -> ApiResponse[Scope]:
        """Get a specific scope by ID (async)."""
        return await self._async_request("GET", f"/api/scopes/{_enc(scope_id)}", Scope)

    def get_scope_sync(self, scope_id: ScopeId) -> ApiResponse[Scope]:
        """Get a specific scope by ID (sync)."""
        return self._sync_request("GET", f"/api/scopes/{_enc(scope_id)}", Scope)

    async def create_scope(self, scope_id: ScopeId, name: str, tag: str, **kwargs: Any) -> ApiResponse[Scope]:
        """Create a new scope (async).

        The caller supplies the scope ``id`` — a human-readable slug — matching
        the server contract ``POST /api/scopes`` which requires ``id`` in the body.
        """
        body = {"id": scope_id, "name": name, "tag": tag, **kwargs}
        return await self._async_request("POST", "/api/scopes", Scope, body)

    def create_scope_sync(self, scope_id: ScopeId, name: str, tag: str, **kwargs: Any) -> ApiResponse[Scope]:
        """Create a new scope (sync)."""
        body = {"id": scope_id, "name": name, "tag": tag, **kwargs}
        return self._sync_request("POST", "/api/scopes", Scope, body)

    async def update_scope(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[Scope]:
        """Full replace of an existing scope via ``PUT`` (async).

        The server requires at least ``name`` and ``tag``. For partial updates
        use :meth:`patch_scope`.
        """
        return await self._async_request("PUT", f"/api/scopes/{_enc(scope_id)}", Scope, fields)

    def update_scope_sync(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[Scope]:
        """Full replace of an existing scope via ``PUT`` (sync)."""
        return self._sync_request("PUT", f"/api/scopes/{_enc(scope_id)}", Scope, fields)

    async def patch_scope(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[Scope]:
        """Partial update of an existing scope via ``PATCH`` (async)."""
        return await self._async_request("PATCH", f"/api/scopes/{_enc(scope_id)}", Scope, fields)

    def patch_scope_sync(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[Scope]:
        """Partial update of an existing scope via ``PATCH`` (sync)."""
        return self._sync_request("PATCH", f"/api/scopes/{_enc(scope_id)}", Scope, fields)

    async def delete_scope(self, scope_id: ScopeId) -> ApiResponse[dict[str, Any]]:
        """Delete a scope (async). Returns ``{"id": ...}``."""
        return await self._async_request("DELETE", f"/api/scopes/{_enc(scope_id)}")

    def delete_scope_sync(self, scope_id: ScopeId) -> ApiResponse[dict[str, Any]]:
        """Delete a scope (sync)."""
        return self._sync_request("DELETE", f"/api/scopes/{_enc(scope_id)}")

    # ── Models API ───────────────────────────────────────────────────────────
    async def list_models(self) -> ApiResponse[list[ModelHandle]]:
        """List all connected model handles for the tenant (async)."""
        return await self._async_request("GET", "/api/models", ModelHandle, is_list=True)

    def list_models_sync(self) -> ApiResponse[list[ModelHandle]]:
        """List all connected model handles for the tenant (sync)."""
        return self._sync_request("GET", "/api/models", ModelHandle, is_list=True)

    async def connect_model(self, request: ConnectModelRequest) -> ApiResponse[ModelHandle]:
        """Connect a new LLM model provider (async)."""
        return await self._async_request("POST", "/api/models", ModelHandle, self._dump(request))

    def connect_model_sync(self, request: ConnectModelRequest) -> ApiResponse[ModelHandle]:
        """Connect a new LLM model provider (sync)."""
        return self._sync_request("POST", "/api/models", ModelHandle, self._dump(request))

    async def get_model(self, handle: str) -> ApiResponse[ModelHandle]:
        """Get a connected model handle (async)."""
        return await self._async_request("GET", f"/api/models/{_enc(handle)}", ModelHandle)

    def get_model_sync(self, handle: str) -> ApiResponse[ModelHandle]:
        """Get a connected model handle (sync)."""
        return self._sync_request("GET", f"/api/models/{_enc(handle)}", ModelHandle)

    async def revoke_model(self, handle: str) -> ApiResponse[dict[str, Any]]:
        """Revoke a model handle (async). Returns ``{"handle": ...}``."""
        return await self._async_request("DELETE", f"/api/models/{_enc(handle)}")

    def revoke_model_sync(self, handle: str) -> ApiResponse[dict[str, Any]]:
        """Revoke a model handle (sync)."""
        return self._sync_request("DELETE", f"/api/models/{_enc(handle)}")

    # ── Finality API ───────────────────────────────────────────────────────────
    async def get_finality_status(self, scope_id: ScopeId) -> ApiResponse[FinalityStatus]:
        """Get current finality status for a scope (async)."""
        return await self._async_request("GET", f"/api/finality/{_enc(scope_id)}", FinalityStatus)

    def get_finality_status_sync(self, scope_id: ScopeId) -> ApiResponse[FinalityStatus]:
        """Get current finality status for a scope (sync)."""
        return self._sync_request("GET", f"/api/finality/{_enc(scope_id)}", FinalityStatus)

    async def upsert_finality(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[FinalityStatus]:
        """Upsert finality status for a scope (async).

        Called by the convergence kernel after each round; ``scope_id`` is taken
        from the path, so the body omits it.
        """
        return await self._async_request("POST", f"/api/finality/{_enc(scope_id)}", FinalityStatus, fields)

    def upsert_finality_sync(self, scope_id: ScopeId, **fields: Any) -> ApiResponse[FinalityStatus]:
        """Upsert finality status for a scope (sync)."""
        return self._sync_request("POST", f"/api/finality/{_enc(scope_id)}", FinalityStatus, fields)

    async def get_finality_certificate(
        self, scope_id: ScopeId, round: int
    ) -> ApiResponse[FinalityCertificate]:
        """Get a finality certificate for a specific convergence round (async)."""
        return await self._async_request(
            "GET",
            f"/api/finality/{_enc(scope_id)}/certificate/{_enc(round)}",
            FinalityCertificate,
        )

    def get_finality_certificate_sync(
        self, scope_id: ScopeId, round: int
    ) -> ApiResponse[FinalityCertificate]:
        """Get a finality certificate for a specific convergence round (sync)."""
        return self._sync_request(
            "GET",
            f"/api/finality/{_enc(scope_id)}/certificate/{_enc(round)}",
            FinalityCertificate,
        )

    async def verify_finality_certificate(
        self, certificate: FinalityCertificate
    ) -> ApiResponse[dict[str, Any]]:
        """Verify a finality certificate signature (async). Returns ``{"valid": bool}``."""
        return await self._async_request("POST", "/api/finality/verify", None, self._dump(certificate))

    def verify_finality_certificate_sync(
        self, certificate: FinalityCertificate
    ) -> ApiResponse[dict[str, Any]]:
        """Verify a finality certificate signature (sync)."""
        return self._sync_request("POST", "/api/finality/verify", None, self._dump(certificate))

    async def get_finality_history(self, scope_id: ScopeId, limit: int = 500) -> ApiResponse[dict[str, Any]]:
        """Get historical finality time-series data points (async)."""
        return await self._async_request(
            "GET", f"/api/finality/{_enc(scope_id)}/history?limit={_enc(limit)}"
        )

    def get_finality_history_sync(self, scope_id: ScopeId, limit: int = 500) -> ApiResponse[dict[str, Any]]:
        """Get historical finality time-series data points (sync)."""
        return self._sync_request(
            "GET", f"/api/finality/{_enc(scope_id)}/history?limit={_enc(limit)}"
        )

    # ── Agents API ─────────────────────────────────────────────────────────────
    async def list_agents(self) -> ApiResponse[list[Agent]]:
        """List all agents registered for the tenant (async)."""
        return await self._async_request("GET", "/api/agents", Agent, is_list=True)

    def list_agents_sync(self) -> ApiResponse[list[Agent]]:
        """List all agents registered for the tenant (sync)."""
        return self._sync_request("GET", "/api/agents", Agent, is_list=True)

    async def get_agent(self, agent_id: str) -> ApiResponse[Agent]:
        """Get a specific agent by ID (async)."""
        return await self._async_request("GET", f"/api/agents/{_enc(agent_id)}", Agent)

    def get_agent_sync(self, agent_id: str) -> ApiResponse[Agent]:
        """Get a specific agent by ID (sync)."""
        return self._sync_request("GET", f"/api/agents/{_enc(agent_id)}", Agent)

    # ── Health ─────────────────────────────────────────────────────────────────
    async def check_health(self) -> ApiResponse[dict[str, Any]]:
        """Health check (async). No tenant header is sent on this route."""
        return await self._async_request("GET", "/api/health", send_tenant=False)

    def check_health_sync(self) -> ApiResponse[dict[str, Any]]:
        """Health check (sync). No tenant header is sent on this route."""
        return self._sync_request("GET", "/api/health", send_tenant=False)

    # ── Ingest ───────────────────────────────────────────────────────────────
    async def ingest_document(self, request: IngestDocumentRequest) -> ApiResponse[IngestDocumentResponse]:
        """Ingest a document into the headless swarm (async)."""
        return await self._async_request("POST", "/api/ingest", IngestDocumentResponse, self._dump(request))

    def ingest_document_sync(self, request: IngestDocumentRequest) -> ApiResponse[IngestDocumentResponse]:
        """Ingest a document into the headless swarm (sync)."""
        return self._sync_request("POST", "/api/ingest", IngestDocumentResponse, self._dump(request))

    # ── Governance read helpers ─────────────────────────────────────────────────
    async def list_claims(self, scope_id: ScopeId) -> ApiResponse[list[Claim]]:
        """List claims extracted for a scope (async)."""
        return await self._async_request("GET", f"/api/claims/{_enc(scope_id)}", Claim, is_list=True)

    def list_claims_sync(self, scope_id: ScopeId) -> ApiResponse[list[Claim]]:
        """List claims extracted for a scope (sync)."""
        return self._sync_request("GET", f"/api/claims/{_enc(scope_id)}", Claim, is_list=True)

    async def list_contradictions(self, scope_id: ScopeId) -> ApiResponse[list[Contradiction]]:
        """List contradictions detected for a scope (async)."""
        return await self._async_request(
            "GET", f"/api/contradictions/{_enc(scope_id)}", Contradiction, is_list=True
        )

    def list_contradictions_sync(self, scope_id: ScopeId) -> ApiResponse[list[Contradiction]]:
        """List contradictions detected for a scope (sync)."""
        return self._sync_request(
            "GET", f"/api/contradictions/{_enc(scope_id)}", Contradiction, is_list=True
        )

    async def list_risks(self, scope_id: ScopeId) -> ApiResponse[list[Risk]]:
        """List risks identified for a scope (async)."""
        return await self._async_request("GET", f"/api/risks/{_enc(scope_id)}", Risk, is_list=True)

    def list_risks_sync(self, scope_id: ScopeId) -> ApiResponse[list[Risk]]:
        """List risks identified for a scope (sync)."""
        return self._sync_request("GET", f"/api/risks/{_enc(scope_id)}", Risk, is_list=True)

    async def list_documents(self, scope_id: ScopeId) -> ApiResponse[list[SgrsDocument]]:
        """List documents ingested into a scope (async)."""
        return await self._async_request("GET", f"/api/documents/{_enc(scope_id)}", SgrsDocument, is_list=True)

    def list_documents_sync(self, scope_id: ScopeId) -> ApiResponse[list[SgrsDocument]]:
        """List documents ingested into a scope (sync)."""
        return self._sync_request("GET", f"/api/documents/{_enc(scope_id)}", SgrsDocument, is_list=True)

    async def get_latest_epoch(self, scope_id: ScopeId) -> ApiResponse[EpochSummary]:
        """Get the latest epoch summary for a scope (async)."""
        return await self._async_request("GET", f"/api/epochs/{_enc(scope_id)}/latest", EpochSummary)

    def get_latest_epoch_sync(self, scope_id: ScopeId) -> ApiResponse[EpochSummary]:
        """Get the latest epoch summary for a scope (sync)."""
        return self._sync_request("GET", f"/api/epochs/{_enc(scope_id)}/latest", EpochSummary)

    # ── Governance write helpers — Claims ────────────────────────────────────────
    async def create_claim(
        self,
        scope_id: ScopeId,
        text: str,
        source: str,
        confidence: float,
        *,
        document_id: Optional[str] = None,
        dimension: Optional[FinalityDimension] = None,
        round: int = 0,
    ) -> ApiResponse[Claim]:
        """Create a claim (async). Mirrors ``POST /api/claims``."""
        body = CreateClaimBody(
            scope_id=scope_id,
            text=text,
            source=source,
            confidence=confidence,
            document_id=document_id,
            dimension=dimension,
            round=round,
        )
        return await self._async_request("POST", "/api/claims", Claim, self._dump(body))

    def create_claim_sync(
        self,
        scope_id: ScopeId,
        text: str,
        source: str,
        confidence: float,
        *,
        document_id: Optional[str] = None,
        dimension: Optional[FinalityDimension] = None,
        round: int = 0,
    ) -> ApiResponse[Claim]:
        """Create a claim (sync)."""
        body = CreateClaimBody(
            scope_id=scope_id,
            text=text,
            source=source,
            confidence=confidence,
            document_id=document_id,
            dimension=dimension,
            round=round,
        )
        return self._sync_request("POST", "/api/claims", Claim, self._dump(body))

    async def list_claims_by_doc(self, scope_id: ScopeId) -> ApiResponse[dict[str, list[Claim]]]:
        """Group a scope's claims by source document (async).

        Returns an object mapping each ``source`` to its list of claims.
        """
        return await self._async_request(
            "GET", f"/api/claims/{_enc(scope_id)}/by-doc", Claim, is_map=True
        )

    def list_claims_by_doc_sync(self, scope_id: ScopeId) -> ApiResponse[dict[str, list[Claim]]]:
        """Group a scope's claims by source document (sync)."""
        return self._sync_request(
            "GET", f"/api/claims/{_enc(scope_id)}/by-doc", Claim, is_map=True
        )

    # ── Governance write helpers — Drifts ────────────────────────────────────────
    async def list_drifts(self, scope_id: ScopeId) -> ApiResponse[list[Drift]]:
        """List drifts detected for a scope (async)."""
        return await self._async_request("GET", f"/api/drifts/{_enc(scope_id)}", Drift, is_list=True)

    def list_drifts_sync(self, scope_id: ScopeId) -> ApiResponse[list[Drift]]:
        """List drifts detected for a scope (sync)."""
        return self._sync_request("GET", f"/api/drifts/{_enc(scope_id)}", Drift, is_list=True)

    async def create_drift(
        self,
        scope_id: ScopeId,
        subject: str,
        previous_confidence: float,
        current_confidence: float,
        delta: float,
        severity: DriftSeverity,
        *,
        claim_id: Optional[str] = None,
        round: int = 0,
    ) -> ApiResponse[Drift]:
        """Create a drift (async). Mirrors ``POST /api/drifts``."""
        body = CreateDriftBody(
            scope_id=scope_id,
            subject=subject,
            previous_confidence=previous_confidence,
            current_confidence=current_confidence,
            delta=delta,
            severity=severity,
            claim_id=claim_id,
            round=round,
        )
        return await self._async_request("POST", "/api/drifts", Drift, self._dump(body))

    def create_drift_sync(
        self,
        scope_id: ScopeId,
        subject: str,
        previous_confidence: float,
        current_confidence: float,
        delta: float,
        severity: DriftSeverity,
        *,
        claim_id: Optional[str] = None,
        round: int = 0,
    ) -> ApiResponse[Drift]:
        """Create a drift (sync)."""
        body = CreateDriftBody(
            scope_id=scope_id,
            subject=subject,
            previous_confidence=previous_confidence,
            current_confidence=current_confidence,
            delta=delta,
            severity=severity,
            claim_id=claim_id,
            round=round,
        )
        return self._sync_request("POST", "/api/drifts", Drift, self._dump(body))

    # ── Governance write helpers — Contradictions ────────────────────────────────
    async def create_contradiction(
        self,
        scope_id: ScopeId,
        claim_a: str,
        claim_b: str,
        source_a: str,
        source_b: str,
        severity: ContradictionSeverity,
        *,
        round: int = 0,
    ) -> ApiResponse[Contradiction]:
        """Create a contradiction (async). Mirrors ``POST /api/contradictions``."""
        body = CreateContradictionBody(
            scope_id=scope_id,
            claim_a=claim_a,
            claim_b=claim_b,
            source_a=source_a,
            source_b=source_b,
            severity=severity,
            round=round,
        )
        return await self._async_request("POST", "/api/contradictions", Contradiction, self._dump(body))

    def create_contradiction_sync(
        self,
        scope_id: ScopeId,
        claim_a: str,
        claim_b: str,
        source_a: str,
        source_b: str,
        severity: ContradictionSeverity,
        *,
        round: int = 0,
    ) -> ApiResponse[Contradiction]:
        """Create a contradiction (sync)."""
        body = CreateContradictionBody(
            scope_id=scope_id,
            claim_a=claim_a,
            claim_b=claim_b,
            source_a=source_a,
            source_b=source_b,
            severity=severity,
            round=round,
        )
        return self._sync_request("POST", "/api/contradictions", Contradiction, self._dump(body))

    async def resolve_contradiction(
        self,
        contradiction_id: str,
        status: Literal["resolved", "deferred"],
        resolved_by: str,
        *,
        resolution: Optional[str] = None,
    ) -> ApiResponse[Contradiction]:
        """Resolve or defer a contradiction (async). Mirrors ``PATCH /api/contradictions/:id``."""
        body = ResolveContradictionBody(status=status, resolved_by=resolved_by, resolution=resolution)
        return await self._async_request(
            "PATCH", f"/api/contradictions/{_enc(contradiction_id)}", Contradiction, self._dump(body)
        )

    def resolve_contradiction_sync(
        self,
        contradiction_id: str,
        status: Literal["resolved", "deferred"],
        resolved_by: str,
        *,
        resolution: Optional[str] = None,
    ) -> ApiResponse[Contradiction]:
        """Resolve or defer a contradiction (sync)."""
        body = ResolveContradictionBody(status=status, resolved_by=resolved_by, resolution=resolution)
        return self._sync_request(
            "PATCH", f"/api/contradictions/{_enc(contradiction_id)}", Contradiction, self._dump(body)
        )

    # ── Governance write helpers — Risks ─────────────────────────────────────────
    async def create_risk(
        self,
        scope_id: ScopeId,
        description: str,
        level: RiskLevel,
        source: str,
        *,
        category: Optional[str] = None,
        document_id: Optional[str] = None,
        round: int = 0,
    ) -> ApiResponse[Risk]:
        """Create a risk (async). Mirrors ``POST /api/risks``."""
        body = CreateRiskBody(
            scope_id=scope_id,
            description=description,
            level=level,
            source=source,
            category=category,
            document_id=document_id,
            round=round,
        )
        return await self._async_request("POST", "/api/risks", Risk, self._dump(body))

    def create_risk_sync(
        self,
        scope_id: ScopeId,
        description: str,
        level: RiskLevel,
        source: str,
        *,
        category: Optional[str] = None,
        document_id: Optional[str] = None,
        round: int = 0,
    ) -> ApiResponse[Risk]:
        """Create a risk (sync)."""
        body = CreateRiskBody(
            scope_id=scope_id,
            description=description,
            level=level,
            source=source,
            category=category,
            document_id=document_id,
            round=round,
        )
        return self._sync_request("POST", "/api/risks", Risk, self._dump(body))

    # ── Governance write helpers — Documents ─────────────────────────────────────
    async def create_document(
        self,
        scope_id: ScopeId,
        name: str,
        type: str,
        *,
        status: Optional[DocumentStatus] = None,
        provenance: Optional[str] = None,
    ) -> ApiResponse[SgrsDocument]:
        """Register a document (async). Mirrors ``POST /api/documents``."""
        body = CreateDocumentBody(
            scope_id=scope_id, name=name, type=type, status=status, provenance=provenance
        )
        return await self._async_request("POST", "/api/documents", SgrsDocument, self._dump(body))

    def create_document_sync(
        self,
        scope_id: ScopeId,
        name: str,
        type: str,
        *,
        status: Optional[DocumentStatus] = None,
        provenance: Optional[str] = None,
    ) -> ApiResponse[SgrsDocument]:
        """Register a document (sync)."""
        body = CreateDocumentBody(
            scope_id=scope_id, name=name, type=type, status=status, provenance=provenance
        )
        return self._sync_request("POST", "/api/documents", SgrsDocument, self._dump(body))

    async def patch_document(
        self,
        document_id: str,
        *,
        status: Optional[DocumentStatus] = None,
        claim_count: Optional[int] = None,
        provenance: Optional[str] = None,
    ) -> ApiResponse[SgrsDocument]:
        """Update a document's status and/or claim_count (async). Mirrors ``PATCH /api/documents/:id``."""
        body = PatchDocumentBody(status=status, claim_count=claim_count, provenance=provenance)
        return await self._async_request(
            "PATCH", f"/api/documents/{_enc(document_id)}", SgrsDocument, self._dump(body)
        )

    def patch_document_sync(
        self,
        document_id: str,
        *,
        status: Optional[DocumentStatus] = None,
        claim_count: Optional[int] = None,
        provenance: Optional[str] = None,
    ) -> ApiResponse[SgrsDocument]:
        """Update a document's status and/or claim_count (sync)."""
        body = PatchDocumentBody(status=status, claim_count=claim_count, provenance=provenance)
        return self._sync_request(
            "PATCH", f"/api/documents/{_enc(document_id)}", SgrsDocument, self._dump(body)
        )

    # ── Governance write helpers — Epochs ────────────────────────────────────────
    async def list_epochs(self, scope_id: ScopeId) -> ApiResponse[list[EpochSummary]]:
        """List epoch summaries for a scope (async)."""
        return await self._async_request(
            "GET", f"/api/epochs/{_enc(scope_id)}", EpochSummary, is_list=True
        )

    def list_epochs_sync(self, scope_id: ScopeId) -> ApiResponse[list[EpochSummary]]:
        """List epoch summaries for a scope (sync)."""
        return self._sync_request(
            "GET", f"/api/epochs/{_enc(scope_id)}", EpochSummary, is_list=True
        )

    async def create_epoch(
        self,
        scope_id: ScopeId,
        round: int,
        summary_text: str,
        score: float,
        state: ScopeState,
        *,
        claim_count: int = 0,
        drift_count: int = 0,
        contradiction_count: int = 0,
        risk_count: int = 0,
    ) -> ApiResponse[EpochSummary]:
        """Create an epoch summary (async). Mirrors ``POST /api/epochs``."""
        body = CreateEpochBody(
            scope_id=scope_id,
            round=round,
            summary_text=summary_text,
            score=score,
            state=state,
            claim_count=claim_count,
            drift_count=drift_count,
            contradiction_count=contradiction_count,
            risk_count=risk_count,
        )
        return await self._async_request("POST", "/api/epochs", EpochSummary, self._dump(body))

    def create_epoch_sync(
        self,
        scope_id: ScopeId,
        round: int,
        summary_text: str,
        score: float,
        state: ScopeState,
        *,
        claim_count: int = 0,
        drift_count: int = 0,
        contradiction_count: int = 0,
        risk_count: int = 0,
    ) -> ApiResponse[EpochSummary]:
        """Create an epoch summary (sync)."""
        body = CreateEpochBody(
            scope_id=scope_id,
            round=round,
            summary_text=summary_text,
            score=score,
            state=state,
            claim_count=claim_count,
            drift_count=drift_count,
            contradiction_count=contradiction_count,
            risk_count=risk_count,
        )
        return self._sync_request("POST", "/api/epochs", EpochSummary, self._dump(body))

    async def add_epoch_comment(
        self, epoch_id: str, author: str, text: str
    ) -> ApiResponse[EpochSummary]:
        """Add a HITL comment to an epoch summary (async). Mirrors ``POST /api/epochs/:id/comments``.

        Returns the updated epoch summary (with the new comment appended).
        """
        body = AddEpochCommentBody(author=author, text=text)
        return await self._async_request(
            "POST", f"/api/epochs/{_enc(epoch_id)}/comments", EpochSummary, self._dump(body)
        )

    def add_epoch_comment_sync(
        self, epoch_id: str, author: str, text: str
    ) -> ApiResponse[EpochSummary]:
        """Add a HITL comment to an epoch summary (sync)."""
        body = AddEpochCommentBody(author=author, text=text)
        return self._sync_request(
            "POST", f"/api/epochs/{_enc(epoch_id)}/comments", EpochSummary, self._dump(body)
        )


def create_client(
    base_url: str,
    api_key: Optional[str] = None,
    tenant_id: Optional[str] = None,
    timeout: float = 30.0,
    verify_ssl: bool = True,
    nats: Optional[NatsConfig] = None,
) -> Client:
    """Create a new SGRS client.

    Args:
        base_url:   Base URL of the SGRS API
        api_key:    Optional API key for Authorization: Bearer header
        tenant_id:  Tenant id sent as ``X-Tenant-ID`` on authenticated requests
                    (validated against the ``TenantId`` contract).
        timeout:    HTTP request timeout in seconds (default: 30)
        verify_ssl: Verify SSL certificates (default: True)
        nats:       Optional NatsConfig for real-time event streaming.
                    Requires: pip install 'sgrs-client[nats]'

    Returns:
        Initialized Client instance.

    Example — HTTP only::

        client = create_client(base_url='https://api.example.com', tenant_id='acme')

    Example — with real-time NATS::

        from sgrs_client.events import NatsConfig

        client = create_client(
            base_url='https://api.example.com',
            tenant_id='acme',
            nats=NatsConfig(servers='nats://localhost:4222'),
        )
        await client.connect()
        await client.events.on_veto_activated('acme', handler)

    Raises:
        ValueError: If ``tenant_id`` is provided but invalid.
    """
    return Client(
        base_url=base_url,
        api_key=api_key,
        tenant_id=tenant_id,
        timeout=timeout,
        verify_ssl=verify_ssl,
        nats=nats,
    )
