"""Unit tests for the SGRS Python API client.

Every resource method is exercised through a real ``httpx.MockTransport`` so we
assert on the actual HTTP method, path, headers (including ``X-Tenant-ID``),
serialized body, and response parsing (including list endpoints).
"""

import json
from typing import Any, Optional

import httpx
import pytest

from sgrs_client import Client, create_client
from sgrs_client.schema import (
    ConnectModelRequest,
    FinalityCertificate,
    IngestDocumentRequest,
)

BASE_URL = "http://localhost:3003"
TENANT = "acme"

# ─── Sample response payloads ────────────────────────────────────────────────

SCOPE = {
    "id": "test-scope",
    "name": "Test Scope",
    "tag": "test",
    "state": "active",
    "score": 0.5,
    "cycles": 0,
    "created_at": "2025-04-24T10:00:00Z",
    "updated_at": "2025-04-24T10:00:00Z",
}
MODEL_HANDLE = {
    "handle": "mh_abcdefghijklmnopqrstuvwx",
    "provider": "openai",
    "model": "gpt-4",
    "label": None,
    "created_at": "2025-04-24T10:00:00Z",
    "last_used_at": None,
}
FINALITY = {
    "scope_id": "test-scope",
    "score": 0.85,
    "per_dimension": {
        "claim_confidence": 0.9,
        "contradiction_resolution": 0.8,
        "goal_completion": 0.85,
        "risk_score_inverse": 0.75,
    },
    "monotonicity_rounds": 5,
    "plateau_ema": 2.3,
    "convergence_rate": 0.12,
    "state": "near-final",
    "veto_active": False,
}
CERTIFICATE = {
    "id": "cert-1",
    "scope_id": "test-scope",
    "round": 1,
    "issued_at": "2025-04-24T10:00:00Z",
    "policy_hash": "sha256:abc123",
    "signature_ed25519": "sig123",
    "payload": FINALITY,
}
AGENT = {
    "id": "ag-extractor",
    "name": "Extractor",
    "role": "extractor",
    "kind": "internal",
    "scopes": ["test-scope"],
}
CLAIM = {
    "id": "11111111-1111-1111-1111-111111111111",
    "scope_id": "test-scope",
    "text": "ARR grew 20%",
    "source": "memo.pdf",
    "confidence": 0.9,
    "round": 1,
    "created_at": "2025-04-24T10:00:00Z",
}
CONTRADICTION = {
    "id": "22222222-2222-2222-2222-222222222222",
    "scope_id": "test-scope",
    "claim_a": "ARR grew",
    "claim_b": "ARR shrank",
    "source_a": "a.pdf",
    "source_b": "b.pdf",
    "severity": "critical",
    "status": "open",
    "round": 1,
    "created_at": "2025-04-24T10:00:00Z",
}
RISK = {
    "id": "33333333-3333-3333-3333-333333333333",
    "scope_id": "test-scope",
    "description": "Renewal risk",
    "level": "high",
    "source": "memo.pdf",
    "round": 1,
    "created_at": "2025-04-24T10:00:00Z",
}
DOCUMENT = {
    "id": "44444444-4444-4444-4444-444444444444",
    "scope_id": "test-scope",
    "name": "memo.pdf",
    "type": "pdf",
    "status": "indexed",
    "claim_count": 3,
    "ingested_at": "2025-04-24T10:00:00Z",
}
EPOCH = {
    "id": "55555555-5555-5555-5555-555555555555",
    "scope_id": "test-scope",
    "round": 2,
    "summary_text": "Converging.",
    "claim_count": 3,
    "drift_count": 0,
    "contradiction_count": 1,
    "risk_count": 1,
    "score": 0.8,
    "state": "near-final",
    "comments": [],
    "created_at": "2025-04-24T10:00:00Z",
}
INGEST_RESPONSE = {
    "scope_id": "test-scope",
    "name": "memo.pdf",
    "type": "txt",
    "document_id": "doc_1",
    "idempotency_key": "idem_1",
    "queued": True,
    "seq": 42,
    "integration_version": "v1",
    "message": "queued",
}
HEALTH = {"status": "ok", "db": "ok", "timestamp": "2025-04-24T10:00:00Z"}


# ─── Recording transport helper ──────────────────────────────────────────────


class _Recorder:
    def __init__(self) -> None:
        self.request: Optional[httpx.Request] = None

    @property
    def body(self) -> Any:
        assert self.request is not None
        content = self.request.content
        return json.loads(content) if content else None


def make_client(
    payload: Any,
    status: int = 200,
    *,
    tenant_id: Optional[str] = TENANT,
    api_key: Optional[str] = "test-key",
) -> tuple[Client, _Recorder]:
    """Build a Client whose transport records the request and returns ``payload``."""
    rec = _Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        rec.request = request
        return httpx.Response(status, json=payload)

    client = Client(base_url=BASE_URL, api_key=api_key, tenant_id=tenant_id)
    transport = httpx.MockTransport(handler)
    client._async_client = httpx.AsyncClient(
        base_url=client.base_url, headers=client._get_headers(), transport=transport
    )
    client._sync_client = httpx.Client(
        base_url=client.base_url, headers=client._get_headers(), transport=transport
    )
    return client, rec


# ─── Initialization / configuration ──────────────────────────────────────────


class TestClientInitialization:
    def test_init_with_base_url(self):
        assert Client(base_url=BASE_URL).base_url == BASE_URL

    def test_init_strips_trailing_slash(self):
        assert Client(base_url=BASE_URL + "/").base_url == BASE_URL

    def test_init_with_api_key(self):
        assert Client(base_url=BASE_URL, api_key="k").api_key == "k"

    def test_init_with_custom_timeout(self):
        assert Client(base_url=BASE_URL, timeout=60.0).timeout == 60.0

    def test_init_with_ssl_verification_disabled(self):
        assert Client(base_url=BASE_URL, verify_ssl=False)._verify_ssl is False

    def test_init_with_tenant_id(self):
        assert Client(base_url=BASE_URL, tenant_id="acme").tenant_id == "acme"

    def test_tenant_id_is_trimmed(self):
        assert Client(base_url=BASE_URL, tenant_id="  acme  ").tenant_id == "acme"

    def test_no_tenant_id_by_default(self):
        assert Client(base_url=BASE_URL).tenant_id is None


class TestTenantValidation:
    @pytest.mark.parametrize(
        "bad",
        ["Bad_Tenant", "UPPER", "-lead", "trail-", "has space", "under_score", "a" * 65],
    )
    def test_invalid_tenant_id_raises(self, bad):
        with pytest.raises(ValueError):
            Client(base_url=BASE_URL, tenant_id=bad)

    @pytest.mark.parametrize("good", ["a", "acme", "acme-corp", "a1-b2-c3"])
    def test_valid_tenant_id_accepted(self, good):
        assert Client(base_url=BASE_URL, tenant_id=good).tenant_id == good

    def test_create_client_validates_tenant(self):
        with pytest.raises(ValueError):
            create_client(base_url=BASE_URL, tenant_id="Bad_Tenant")


class TestRequestHeaders:
    def test_basic_headers(self):
        headers = Client(base_url=BASE_URL)._get_headers()
        assert headers["Content-Type"] == "application/json"
        assert headers["Accept"] == "application/json"

    def test_authorization_header_with_key(self):
        headers = Client(base_url=BASE_URL, api_key="test-key")._get_headers()
        assert headers["Authorization"] == "Bearer test-key"

    def test_no_authorization_without_key(self):
        assert "Authorization" not in Client(base_url=BASE_URL)._get_headers()

    def test_base_headers_never_include_tenant(self):
        headers = Client(base_url=BASE_URL, tenant_id="acme")._get_headers()
        assert "X-Tenant-ID" not in headers


# ─── Scopes ──────────────────────────────────────────────────────────────────


class TestScopes:
    async def test_list_scopes(self):
        client, rec = make_client([SCOPE, SCOPE])
        res = await client.list_scopes()
        assert res.ok is True
        assert rec.request.method == "GET"
        assert rec.request.url.path == "/api/scopes"
        assert rec.request.headers["X-Tenant-ID"] == TENANT
        assert isinstance(res.data, list) and len(res.data) == 2
        assert res.data[0].id == "test-scope"

    def test_list_scopes_sync(self):
        client, rec = make_client([SCOPE])
        res = client.list_scopes_sync()
        assert res.ok is True
        assert rec.request.url.path == "/api/scopes"
        assert len(res.data) == 1

    async def test_get_scope(self):
        client, rec = make_client(SCOPE)
        res = await client.get_scope("test-scope")
        assert res.ok is True
        assert rec.request.method == "GET"
        assert rec.request.url.path == "/api/scopes/test-scope"
        assert res.data.id == "test-scope"

    def test_get_scope_sync(self):
        client, rec = make_client(SCOPE)
        res = client.get_scope_sync("test-scope")
        assert res.ok and rec.request.url.path == "/api/scopes/test-scope"

    async def test_get_scope_url_encodes(self):
        client, rec = make_client(SCOPE)
        await client.get_scope("scope/with/slashes")
        assert rec.request.url.raw_path == b"/api/scopes/scope%2Fwith%2Fslashes"

    async def test_create_scope(self):
        client, rec = make_client(SCOPE, status=201)
        res = await client.create_scope("test-scope", "Test Scope", "test", state="active")
        assert res.ok is True
        assert rec.request.method == "POST"
        assert rec.request.url.path == "/api/scopes"
        assert rec.body == {"id": "test-scope", "name": "Test Scope", "tag": "test", "state": "active"}

    def test_create_scope_sync(self):
        client, rec = make_client(SCOPE, status=201)
        client.create_scope_sync("test-scope", "Test Scope", "test")
        assert rec.body["id"] == "test-scope"

    async def test_update_scope_uses_put(self):
        client, rec = make_client(SCOPE)
        res = await client.update_scope("test-scope", name="Renamed", tag="t")
        assert res.ok is True
        assert rec.request.method == "PUT"
        assert rec.request.url.path == "/api/scopes/test-scope"
        assert rec.body == {"name": "Renamed", "tag": "t"}

    def test_update_scope_sync(self):
        client, rec = make_client(SCOPE)
        client.update_scope_sync("test-scope", name="Renamed", tag="t")
        assert rec.request.method == "PUT"

    async def test_patch_scope_uses_patch(self):
        client, rec = make_client(SCOPE)
        res = await client.patch_scope("test-scope", score=0.75)
        assert res.ok is True
        assert rec.request.method == "PATCH"
        assert rec.body == {"score": 0.75}

    def test_patch_scope_sync(self):
        client, rec = make_client(SCOPE)
        client.patch_scope_sync("test-scope", score=0.75)
        assert rec.request.method == "PATCH"

    async def test_delete_scope(self):
        client, rec = make_client({"id": "test-scope"})
        res = await client.delete_scope("test-scope")
        assert res.ok is True
        assert rec.request.method == "DELETE"
        assert rec.request.url.path == "/api/scopes/test-scope"
        assert res.data == {"id": "test-scope"}

    def test_delete_scope_sync(self):
        client, rec = make_client({"id": "test-scope"})
        res = client.delete_scope_sync("test-scope")
        assert res.ok and rec.request.method == "DELETE"


# ─── Models ────────────────────────────────────────────────────────────────


class TestModels:
    async def test_list_models(self):
        client, rec = make_client([MODEL_HANDLE])
        res = await client.list_models()
        assert res.ok is True
        assert rec.request.url.path == "/api/models"
        assert res.data[0].handle == MODEL_HANDLE["handle"]

    def test_list_models_sync(self):
        client, rec = make_client([MODEL_HANDLE])
        assert client.list_models_sync().ok is True

    async def test_connect_model(self):
        client, rec = make_client(MODEL_HANDLE, status=201)
        req = ConnectModelRequest(provider="openai", api_key="sk-test", model="gpt-4")
        res = await client.connect_model(req)
        assert res.ok is True
        assert rec.request.method == "POST"
        assert rec.request.url.path == "/api/models"
        # None-valued optional fields (base_url, label) are omitted.
        assert rec.body == {"provider": "openai", "api_key": "sk-test", "model": "gpt-4"}

    def test_connect_model_sync(self):
        client, rec = make_client(MODEL_HANDLE, status=201)
        req = ConnectModelRequest(provider="openai", api_key="sk-test", model="gpt-4")
        assert client.connect_model_sync(req).ok is True

    async def test_get_model(self):
        client, rec = make_client(MODEL_HANDLE)
        res = await client.get_model(MODEL_HANDLE["handle"])
        assert res.ok is True
        assert rec.request.url.path == f"/api/models/{MODEL_HANDLE['handle']}"

    def test_get_model_sync(self):
        client, rec = make_client(MODEL_HANDLE)
        assert client.get_model_sync(MODEL_HANDLE["handle"]).ok is True

    async def test_revoke_model(self):
        client, rec = make_client({"handle": MODEL_HANDLE["handle"]})
        res = await client.revoke_model(MODEL_HANDLE["handle"])
        assert res.ok is True
        assert rec.request.method == "DELETE"
        assert res.data == {"handle": MODEL_HANDLE["handle"]}

    def test_revoke_model_sync(self):
        client, rec = make_client({"handle": MODEL_HANDLE["handle"]})
        assert client.revoke_model_sync(MODEL_HANDLE["handle"]).ok is True


# ─── Finality ────────────────────────────────────────────────────────────────


class TestFinality:
    async def test_get_finality_status(self):
        client, rec = make_client(FINALITY)
        res = await client.get_finality_status("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/finality/test-scope"
        assert res.data.score == 0.85

    def test_get_finality_status_sync(self):
        client, rec = make_client(FINALITY)
        assert client.get_finality_status_sync("test-scope").data.score == 0.85

    async def test_upsert_finality(self):
        client, rec = make_client(FINALITY)
        res = await client.upsert_finality(
            "test-scope",
            score=0.85,
            per_dimension=FINALITY["per_dimension"],
            monotonicity_rounds=5,
            plateau_ema=2.3,
            convergence_rate=0.12,
            state="near-final",
            veto_active=False,
        )
        assert res.ok is True
        assert rec.request.method == "POST"
        assert rec.request.url.path == "/api/finality/test-scope"
        assert "scope_id" not in rec.body

    def test_upsert_finality_sync(self):
        client, rec = make_client(FINALITY)
        res = client.upsert_finality_sync("test-scope", score=0.85)
        assert rec.request.method == "POST" and res.ok is True

    async def test_get_finality_certificate(self):
        client, rec = make_client(CERTIFICATE)
        res = await client.get_finality_certificate("test-scope", 1)
        assert res.ok is True
        assert rec.request.url.path == "/api/finality/test-scope/certificate/1"

    def test_get_finality_certificate_sync(self):
        client, rec = make_client(CERTIFICATE)
        assert client.get_finality_certificate_sync("test-scope", 1).ok is True

    async def test_verify_finality_certificate(self):
        client, rec = make_client({"valid": True})
        cert = FinalityCertificate.model_validate(CERTIFICATE)
        res = await client.verify_finality_certificate(cert)
        assert res.ok is True
        assert rec.request.method == "POST"
        assert rec.request.url.path == "/api/finality/verify"
        assert res.data == {"valid": True}

    def test_verify_finality_certificate_sync(self):
        client, rec = make_client({"valid": True})
        cert = FinalityCertificate.model_validate(CERTIFICATE)
        assert client.verify_finality_certificate_sync(cert).data == {"valid": True}

    async def test_get_finality_history(self):
        client, rec = make_client({"scope_id": "test-scope", "points": []})
        res = await client.get_finality_history("test-scope", limit=10)
        assert res.ok is True
        assert rec.request.url.path == "/api/finality/test-scope/history"
        assert rec.request.url.params["limit"] == "10"

    def test_get_finality_history_sync(self):
        client, rec = make_client({"scope_id": "test-scope", "points": []})
        assert client.get_finality_history_sync("test-scope").ok is True


# ─── Agents ────────────────────────────────────────────────────────────────


class TestAgents:
    async def test_list_agents(self):
        client, rec = make_client([AGENT])
        res = await client.list_agents()
        assert res.ok is True
        assert rec.request.url.path == "/api/agents"
        assert res.data[0].id == "ag-extractor"

    def test_list_agents_sync(self):
        client, rec = make_client([AGENT])
        assert client.list_agents_sync().ok is True

    async def test_get_agent(self):
        client, rec = make_client(AGENT)
        res = await client.get_agent("ag-extractor")
        assert res.ok is True
        assert rec.request.url.path == "/api/agents/ag-extractor"

    def test_get_agent_sync(self):
        client, rec = make_client(AGENT)
        assert client.get_agent_sync("ag-extractor").ok is True


# ─── Health (no tenant header) ─────────────────────────────────────────────


class TestHealth:
    async def test_check_health_omits_tenant_header(self):
        client, rec = make_client(HEALTH)
        res = await client.check_health()
        assert res.ok is True
        assert rec.request.url.path == "/api/health"
        assert "X-Tenant-ID" not in rec.request.headers
        assert res.data["status"] == "ok"

    def test_check_health_sync_omits_tenant_header(self):
        client, rec = make_client(HEALTH)
        res = client.check_health_sync()
        assert res.ok is True
        assert "X-Tenant-ID" not in rec.request.headers


# ─── Ingest ────────────────────────────────────────────────────────────────


class TestIngest:
    async def test_ingest_document(self):
        client, rec = make_client(INGEST_RESPONSE, status=202)
        req = IngestDocumentRequest(scope_id="test-scope", name="memo.pdf", text="hello", source="upload")
        res = await client.ingest_document(req)
        assert res.ok is True
        assert res.status_code == 202
        assert rec.request.method == "POST"
        assert rec.request.url.path == "/api/ingest"
        assert rec.request.headers["X-Tenant-ID"] == TENANT
        assert rec.body["scope_id"] == "test-scope"
        assert res.data.queued is True

    def test_ingest_document_sync(self):
        client, rec = make_client(INGEST_RESPONSE, status=202)
        req = IngestDocumentRequest(scope_id="test-scope", name="memo.pdf", text="hello")
        assert client.ingest_document_sync(req).ok is True


# ─── Governance read helpers ─────────────────────────────────────────────────


class TestReadHelpers:
    async def test_list_claims(self):
        client, rec = make_client([CLAIM])
        res = await client.list_claims("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/claims/test-scope"
        assert res.data[0].text == "ARR grew 20%"

    def test_list_claims_sync(self):
        client, rec = make_client([CLAIM])
        assert client.list_claims_sync("test-scope").ok is True

    async def test_list_contradictions(self):
        client, rec = make_client([CONTRADICTION])
        res = await client.list_contradictions("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/contradictions/test-scope"
        assert res.data[0].severity == "critical"

    def test_list_contradictions_sync(self):
        client, rec = make_client([CONTRADICTION])
        assert client.list_contradictions_sync("test-scope").ok is True

    async def test_list_risks(self):
        client, rec = make_client([RISK])
        res = await client.list_risks("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/risks/test-scope"
        assert res.data[0].level == "high"

    def test_list_risks_sync(self):
        client, rec = make_client([RISK])
        assert client.list_risks_sync("test-scope").ok is True

    async def test_list_documents(self):
        client, rec = make_client([DOCUMENT])
        res = await client.list_documents("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/documents/test-scope"
        assert res.data[0].name == "memo.pdf"

    def test_list_documents_sync(self):
        client, rec = make_client([DOCUMENT])
        assert client.list_documents_sync("test-scope").ok is True

    async def test_get_latest_epoch(self):
        client, rec = make_client(EPOCH)
        res = await client.get_latest_epoch("test-scope")
        assert res.ok is True
        assert rec.request.url.path == "/api/epochs/test-scope/latest"
        assert res.data.round == 2

    def test_get_latest_epoch_sync(self):
        client, rec = make_client(EPOCH)
        assert client.get_latest_epoch_sync("test-scope").ok is True


# ─── Error handling ──────────────────────────────────────────────────────────


class TestErrorHandling:
    async def test_http_error_parses_body(self):
        client, rec = make_client({"code": "NOT_FOUND", "message": "Scope not found"}, status=404)
        res = await client.get_scope("missing")
        assert res.ok is False
        assert res.status_code == 404
        assert res.error.code == "NOT_FOUND"
        assert res.error.message == "Scope not found"

    def test_http_error_sync(self):
        client, rec = make_client({"code": "NOT_FOUND", "message": "x"}, status=404)
        res = client.get_scope_sync("missing")
        assert res.ok is False and res.error.code == "NOT_FOUND"

    async def test_timeout_maps_to_request_timeout(self):
        client = Client(base_url=BASE_URL, tenant_id=TENANT)

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("timed out", request=request)

        client._async_client = httpx.AsyncClient(
            base_url=client.base_url, headers=client._get_headers(), transport=httpx.MockTransport(handler)
        )
        res = await client.list_scopes()
        assert res.ok is False
        assert res.error.code == "REQUEST_TIMEOUT"
        assert res.status_code == 408

    async def test_network_error_maps_to_network_error(self):
        client = Client(base_url=BASE_URL, tenant_id=TENANT)

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        client._async_client = httpx.AsyncClient(
            base_url=client.base_url, headers=client._get_headers(), transport=httpx.MockTransport(handler)
        )
        res = await client.list_scopes()
        assert res.ok is False
        assert res.error.code == "NETWORK_ERROR"

    async def test_response_validation_error(self):
        # Missing required fields for a Scope → VALIDATION_ERROR.
        client, rec = make_client({"id": "x"})
        res = await client.get_scope("x")
        assert res.ok is False
        assert res.error.code == "VALIDATION_ERROR"


# ─── Context managers / factory ──────────────────────────────────────────────


class TestContextManagers:
    def test_sync_context_manager(self):
        with Client(base_url=BASE_URL) as client:
            assert client.base_url == BASE_URL

    async def test_async_context_manager(self):
        async with Client(base_url=BASE_URL) as client:
            assert client.base_url == BASE_URL


class TestCreateClientFunction:
    def test_create_client_with_base_url(self):
        client = create_client(base_url=BASE_URL)
        assert isinstance(client, Client)
        assert client.base_url == BASE_URL

    def test_create_client_with_api_key(self):
        assert create_client(base_url=BASE_URL, api_key="test-key").api_key == "test-key"

    def test_create_client_with_tenant(self):
        assert create_client(base_url=BASE_URL, tenant_id="acme").tenant_id == "acme"

    def test_create_client_with_custom_timeout(self):
        assert create_client(base_url=BASE_URL, timeout=60.0).timeout == 60.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
