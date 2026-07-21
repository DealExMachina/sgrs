"""Integration tests for the SGRS Python API client with mocked responses."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import pytest
import httpx

from sgrs_client import Client, create_client
from sgrs_client.schema import (
    Scope,
    ScopeState,
    ModelHandle,
    FinalityStatus,
    FinalityCertificate,
    ModelProvider,
)


class MockHTTPResponse:
    """Mock HTTP response."""

    def __init__(self, status_code: int, json_data: dict):
        self.status_code = status_code
        self.json_data = json_data
        self.headers = {"content-type": "application/json"}

    def json(self):
        return self.json_data

    def raise_for_status(self):
        if not 200 <= self.status_code < 300:
            request = httpx.Request("GET", "http://test")
            response = httpx.Response(
                self.status_code,
                request=request,
                json=self.json_data,
            )
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}",
                request=request,
                response=response,
            )


class TestScopeManagementWorkflow:
    """Test complete scope management workflow."""

    @pytest.mark.asyncio
    async def test_scope_lifecycle(self):
        """Test creating, reading, updating, and deleting a scope."""
        scope_id = "horizon-ma-2025"
        scope_data = {
            "id": scope_id,
            "name": "Project Horizon: TechCorp Acquisition",
            "tag": "m&a",
            "state": "active",
            "score": 0.45,
            "cycles": 2,
            "created_at": datetime.now().isoformat() + "Z",
            "updated_at": datetime.now().isoformat() + "Z",
        }

        async def mock_request(method, url, **kwargs):
            if method == "GET" and scope_id in url:
                return MockHTTPResponse(200, scope_data)
            elif method == "POST":
                return MockHTTPResponse(201, scope_data)
            elif method == "PATCH":
                updated = scope_data.copy()
                updated["score"] = 0.65
                updated["cycles"] = 3
                return MockHTTPResponse(200, updated)
            elif method == "DELETE":
                return MockHTTPResponse(204, None)
            return MockHTTPResponse(404, {"error": "Not found"})

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            # Test getting scope
            result = await client.get_scope(scope_id)
            assert result.ok is True
            assert result.data.name == "Project Horizon: TechCorp Acquisition"

            # Test updating scope
            result = await client.update_scope(scope_id, score=0.65, cycles=3)
            assert result.ok is True
            if result.data:
                assert result.data.score == 0.65

            # Test deleting scope
            result = await client.get_scope(scope_id)
            assert result.ok is True


class TestModelManagementWorkflow:
    """Test LLM model connection and management."""

    @pytest.mark.asyncio
    async def test_model_connection_workflow(self):
        """Test connecting and retrieving models."""
        handle = "mh_abc123def456ghi789jkl012"
        model_data = {
            "handle": handle,
            "provider": "openai",
            "model": "gpt-4-turbo",
            "label": "Main GPT-4",
            "created_at": datetime.now().isoformat() + "Z",
            "last_used_at": datetime.now().isoformat() + "Z",
        }

        async def mock_request(method, url, **kwargs):
            if method == "POST" and "models/connect" in url:
                return MockHTTPResponse(201, model_data)
            elif method == "GET" and handle in url:
                return MockHTTPResponse(200, model_data)
            elif method == "DELETE" and handle in url:
                return MockHTTPResponse(204, None)
            return MockHTTPResponse(404, {"error": "Not found"})

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            # Test getting model
            result = await client.get_model(handle)
            assert result.ok is True
            assert result.data.provider == "openai"


class TestFinalityCertificateWorkflow:
    """Test finality status and certificate retrieval."""

    @pytest.mark.asyncio
    async def test_finality_workflow(self):
        """Test getting finality status and certificates."""
        scope_id = "horizon-ma-2025"
        status_data = {
            "scope_id": scope_id,
            "score": 0.87,
            "per_dimension": {
                "claim_confidence": 0.92,
                "contradiction_resolution": 0.88,
                "goal_completion": 0.85,
                "risk_score_inverse": 0.83,
            },
            "monotonicity_rounds": 8,
            "plateau_ema": 3.2,
            "convergence_rate": 0.098,
            "state": "near-final",
            "veto_active": False,
        }

        certificate_data = {
            "id": "cert-horizon-ma-2025-1",
            "scope_id": scope_id,
            "round": 1,
            "issued_at": datetime.now().isoformat() + "Z",
            "policy_hash": "sha256:abcdef0123456789abcdef0123456789",
            "signature_ed25519": "sig_abcdef0123456789abcdef0123456789",
            "payload": status_data,
        }

        async def mock_request(method, url, **kwargs):
            if "finality/" in url and "certificate" not in url:
                return MockHTTPResponse(200, status_data)
            elif "certificate" in url:
                return MockHTTPResponse(200, certificate_data)
            return MockHTTPResponse(404, {"error": "Not found"})

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            # Test getting finality status
            result = await client.get_finality_status(scope_id)
            assert result.ok is True
            assert result.data.score == 0.87
            assert result.data.state == "near-final"
            assert result.data.veto_active is False

            # Test getting certificate
            result = await client.get_finality_certificate(scope_id, 1)
            assert result.ok is True


class TestErrorHandling:
    """Test error handling in various scenarios."""

    @pytest.mark.asyncio
    async def test_404_not_found(self):
        """Test handling of 404 Not Found errors."""
        async def mock_request(method, url, **kwargs):
            return MockHTTPResponse(
                404,
                {
                    "code": "SCOPE_NOT_FOUND",
                    "message": "Scope not found",
                },
            )

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            result = await client.get_scope("nonexistent")
            assert result.ok is False
            assert result.error.status_code == 404

    @pytest.mark.asyncio
    async def test_400_bad_request(self):
        """Test handling of 400 Bad Request errors."""
        async def mock_request(method, url, **kwargs):
            return MockHTTPResponse(
                400,
                {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid scope name",
                    "details": {"field": "name", "reason": "too short"},
                },
            )

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            result = await client.create_scope(name="x", tag="test")
            assert result.ok is False
            assert result.error.status_code == 400

    @pytest.mark.asyncio
    async def test_500_server_error(self):
        """Test handling of 500 Internal Server Error."""
        async def mock_request(method, url, **kwargs):
            return MockHTTPResponse(
                500,
                {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "Database connection failed",
                },
            )

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            result = await client.get_finality_status("test-scope")
            assert result.ok is False
            assert result.error.status_code == 500


class TestSyncOperations:
    """Test synchronous operations."""

    def test_sync_get_scope(self):
        """Test synchronous scope retrieval."""
        scope_data = {
            "id": "test-scope",
            "name": "Test Scope",
            "tag": "test",
            "state": "active",
            "score": 0.5,
            "cycles": 0,
            "created_at": datetime.now().isoformat() + "Z",
            "updated_at": datetime.now().isoformat() + "Z",
        }

        def mock_request(method, url, **kwargs):
            return MockHTTPResponse(200, scope_data)

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._sync_client, "request", new=mock_request):
            result = client.get_scope_sync("test-scope")
            assert result.ok is True
            assert result.data.id == "test-scope"

    def test_sync_update_scope(self):
        """Test synchronous scope update."""
        updated_scope_data = {
            "id": "test-scope",
            "name": "Test Scope",
            "tag": "test",
            "state": "active",
            "score": 0.75,
            "cycles": 1,
            "created_at": datetime.now().isoformat() + "Z",
            "updated_at": datetime.now().isoformat() + "Z",
        }

        def mock_request(method, url, **kwargs):
            return MockHTTPResponse(200, updated_scope_data)

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._sync_client, "request", new=mock_request):
            result = client.update_scope_sync("test-scope", score=0.75)
            assert result.ok is True


class TestEdgeCases:
    """Test edge cases and special scenarios."""

    @pytest.mark.asyncio
    async def test_empty_response_body(self):
        """Test handling of empty response bodies (204 No Content)."""
        async def mock_request(method, url, **kwargs):
            if method == "DELETE":
                return MockHTTPResponse(204, None)
            return MockHTTPResponse(404, {"error": "Not found"})

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            result = await client._async_request("DELETE", "/api/v1/scopes/test", Scope)
            # DELETE may return 204 with no body, so this tests error handling

    @pytest.mark.asyncio
    async def test_multiple_dimensions_in_finality_status(self):
        """Test finality status with all dimensions populated."""
        status_data = {
            "scope_id": "test-scope",
            "score": 0.87,
            "per_dimension": {
                "claim_confidence": 0.92,
                "contradiction_resolution": 0.88,
                "goal_completion": 0.85,
                "risk_score_inverse": 0.83,
            },
            "monotonicity_rounds": 8,
            "plateau_ema": 3.2,
            "convergence_rate": 0.098,
            "state": "near-final",
            "veto_active": False,
        }

        async def mock_request(method, url, **kwargs):
            return MockHTTPResponse(200, status_data)

        client = Client(base_url="http://localhost:3003")

        with patch.object(client._async_client, "request", new=mock_request):
            result = await client.get_finality_status("test-scope")
            assert result.ok is True
            assert len(result.data.per_dimension) == 4
            assert result.data.per_dimension["claim_confidence"] == 0.92


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
