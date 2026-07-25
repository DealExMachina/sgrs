"""Contract / drift test.

Asserts that every path the client calls corresponds to a real product route in
``apps/api`` (mounted under ``/api/*`` in ``apps/api/src/app.ts``). This guards
against future path drift — if a client method starts targeting a path that the
API does not expose, this test fails.

The route allowlist below is a static mirror of the ``/api/*`` routers in
``apps/api/src/routes/*``. Two endpoints (finality ``certificate`` and
``verify``) exist in the reference ``@sgrs/client-ts`` surface but are not yet
mounted server-side; they are tracked explicitly in ``PARITY_ONLY_ROUTES`` so
the drift they represent is documented rather than hidden.
"""

import httpx
import pytest

from sgrs_client import Client
from sgrs_client.schema import ConnectModelRequest, FinalityCertificate, IngestDocumentRequest

# Static mirror of the /api/* product routes in apps/api/src/routes/*.
# ``{param}`` is a placeholder for any single URL-encoded path segment.
PRODUCT_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/scopes"),
    ("POST", "/api/scopes"),
    ("GET", "/api/scopes/{param}"),
    ("PUT", "/api/scopes/{param}"),
    ("PATCH", "/api/scopes/{param}"),
    ("DELETE", "/api/scopes/{param}"),
    ("GET", "/api/models"),
    ("POST", "/api/models"),
    ("GET", "/api/models/{param}"),
    ("DELETE", "/api/models/{param}"),
    ("GET", "/api/finality/{param}"),
    ("POST", "/api/finality/{param}"),
    ("GET", "/api/finality/{param}/history"),
    ("GET", "/api/agents"),
    ("GET", "/api/agents/{param}"),
    ("GET", "/api/claims/{param}"),
    ("POST", "/api/claims"),
    ("GET", "/api/claims/{param}/by-doc"),
    ("GET", "/api/drifts/{param}"),
    ("POST", "/api/drifts"),
    ("GET", "/api/contradictions/{param}"),
    ("POST", "/api/contradictions"),
    ("PATCH", "/api/contradictions/{param}"),
    ("GET", "/api/risks/{param}"),
    ("POST", "/api/risks"),
    ("GET", "/api/documents/{param}"),
    ("POST", "/api/documents"),
    ("PATCH", "/api/documents/{param}"),
    ("GET", "/api/epochs/{param}"),
    ("GET", "/api/epochs/{param}/latest"),
    ("POST", "/api/epochs"),
    ("POST", "/api/epochs/{param}/comments"),
    ("POST", "/api/ingest"),
}

# Reference @sgrs/client-ts parity endpoints not yet mounted in apps/api.
PARITY_ONLY_ROUTES = {
    ("GET", "/api/finality/{param}/certificate/{param}"),
    ("POST", "/api/finality/verify"),
}

ALLOWED_ROUTES = PRODUCT_ROUTES | PARITY_ONLY_ROUTES

# Distinctive sentinel values so path params can be normalized to ``{param}``.
_SCOPE = "sentinelscope"
_HANDLE = "mh_000000000000000000000000"
_AGENT = "ag-sentinel"
_ID = "sentinelid"
_ROUND = 7
_SENTINELS = {_SCOPE, _HANDLE, _AGENT, _ID, str(_ROUND)}

_CERT = FinalityCertificate.model_validate(
    {
        "id": "c",
        "scope_id": _SCOPE,
        "round": _ROUND,
        "issued_at": "2025-04-24T10:00:00Z",
        "policy_hash": "sha256:ab",
        "signature_ed25519": "s",
        "payload": {
            "scope_id": _SCOPE,
            "score": 0.5,
            "per_dimension": {},
            "monotonicity_rounds": 0,
            "plateau_ema": 0.0,
            "convergence_rate": 0.0,
            "state": "active",
            "veto_active": False,
        },
    }
)

# Every public client method → the args to invoke it with.
INVOCATIONS = [
    ("list_scopes", ()),
    ("get_scope", (_SCOPE,)),
    ("create_scope", (_SCOPE, "n", "t")),
    ("update_scope", (_SCOPE,)),
    ("patch_scope", (_SCOPE,)),
    ("delete_scope", (_SCOPE,)),
    ("list_models", ()),
    ("connect_model", (ConnectModelRequest(provider="openai", api_key="k", model="m"),)),
    ("get_model", (_HANDLE,)),
    ("revoke_model", (_HANDLE,)),
    ("get_finality_status", (_SCOPE,)),
    ("upsert_finality", (_SCOPE,)),
    ("get_finality_certificate", (_SCOPE, _ROUND)),
    ("verify_finality_certificate", (_CERT,)),
    ("get_finality_history", (_SCOPE,)),
    ("list_agents", ()),
    ("get_agent", (_AGENT,)),
    ("check_health", ()),
    ("ingest_document", (IngestDocumentRequest(scope_id=_SCOPE, name="n", text="t"),)),
    ("list_claims", (_SCOPE,)),
    ("create_claim", (_SCOPE, "text", "src", 0.9)),
    ("list_claims_by_doc", (_SCOPE,)),
    ("list_drifts", (_SCOPE,)),
    ("create_drift", (_SCOPE, "subject", 0.9, 0.6, -0.3, "high")),
    ("list_contradictions", (_SCOPE,)),
    ("create_contradiction", (_SCOPE, "a", "b", "sa", "sb", "critical")),
    ("resolve_contradiction", (_ID, "resolved", "analyst")),
    ("list_risks", (_SCOPE,)),
    ("create_risk", (_SCOPE, "desc", "high", "src")),
    ("list_documents", (_SCOPE,)),
    ("create_document", (_SCOPE, "name", "pdf")),
    ("patch_document", (_ID,)),
    ("get_latest_epoch", (_SCOPE,)),
    ("list_epochs", (_SCOPE,)),
    ("create_epoch", (_SCOPE, 1, "summary", 0.8, "active")),
    ("add_epoch_comment", (_ID, "author", "text")),
]


def _normalize(path: str) -> str:
    segments = [("{param}" if seg in _SENTINELS else seg) for seg in path.split("/")]
    return "/".join(segments)


def _make_recording_client() -> tuple[Client, list[httpx.Request]]:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={})

    client = Client(base_url="http://localhost:3003", tenant_id="acme")
    transport = httpx.MockTransport(handler)
    client._async_client = httpx.AsyncClient(
        base_url=client.base_url, headers=client._get_headers(), transport=transport
    )
    return client, captured


@pytest.mark.parametrize("method_name,args", INVOCATIONS)
async def test_client_paths_match_api_routes(method_name, args):
    client, captured = _make_recording_client()
    await getattr(client, method_name)(*args)

    assert len(captured) == 1, f"{method_name} issued {len(captured)} requests"
    request = captured[0]
    route = (request.method, _normalize(request.url.path))
    assert route in ALLOWED_ROUTES, (
        f"{method_name} calls {route[0]} {route[1]} which is not a known apps/api route"
    )


async def test_every_product_route_is_reachable():
    """Every mounted product route should be exercised by at least one method."""
    client, captured = _make_recording_client()
    for method_name, args in INVOCATIONS:
        await getattr(client, method_name)(*args)

    called = {(r.method, _normalize(r.url.path)) for r in captured}
    uncovered = PRODUCT_ROUTES - called
    assert not uncovered, f"product routes not covered by the client: {sorted(uncovered)}"
