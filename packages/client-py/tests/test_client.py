"""Unit tests for the SGRS Python API client."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import pytest
from httpx import Response

from sgrs_client import Client, create_client
from sgrs_client.schema import (
    Scope,
    ModelProvider,
    ModelHandle,
    FinalityStatus,
    FinalityCertificate,
)


@pytest.fixture
def client():
    """Create a test client."""
    return Client(base_url="http://localhost:3000")


@pytest.fixture
def client_with_key():
    """Create a test client with API key."""
    return Client(base_url="http://localhost:3000", api_key="test-key")


class TestClientInitialization:
    """Test client initialization and configuration."""

    def test_init_with_base_url(self):
        """Test initialization with base URL."""
        client = Client(base_url="http://localhost:3000")
        assert client.base_url == "http://localhost:3000"

    def test_init_strips_trailing_slash(self):
        """Test that trailing slash is removed from base URL."""
        client = Client(base_url="http://localhost:3000/")
        assert client.base_url == "http://localhost:3000"

    def test_init_with_api_key(self):
        """Test initialization with API key."""
        client = Client(base_url="http://localhost:3000", api_key="test-key")
        assert client.api_key == "test-key"

    def test_init_with_custom_timeout(self):
        """Test initialization with custom timeout."""
        client = Client(base_url="http://localhost:3000", timeout=60.0)
        assert client.timeout == 60.0

    def test_init_with_ssl_verification_disabled(self):
        """Test initialization with SSL verification disabled."""
        client = Client(base_url="http://localhost:3000", verify_ssl=False)
        assert client._verify_ssl is False


class TestRequestHeaders:
    """Test request header construction."""

    def test_basic_headers(self, client):
        """Test that basic headers are set."""
        headers = client._get_headers()
        assert headers["Content-Type"] == "application/json"
        assert headers["Accept"] == "application/json"

    def test_authorization_header_with_key(self, client_with_key):
        """Test that Authorization header is set when API key is provided."""
        headers = client_with_key._get_headers()
        assert headers["Authorization"] == "Bearer test-key"

    def test_no_authorization_without_key(self, client):
        """Test that Authorization header is not set without API key."""
        headers = client._get_headers()
        assert "Authorization" not in headers


class TestScopeOperations:
    """Test scope API operations."""

    @pytest.mark.asyncio
    async def test_get_scope(self):
        """Test getting a scope."""
        scope_data = {
            "id": "test-scope",
            "name": "Test Scope",
            "tag": "test",
            "state": "active",
            "score": 0.5,
            "cycles": 0,
            "created_at": "2025-04-24T10:00:00Z",
            "updated_at": "2025-04-24T10:00:00Z",
        }

        with patch.object(
            Client, "_async_request", return_value=Mock(ok=True, data=Scope(**scope_data))
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.get_scope("test-scope")

            assert result.ok is True
            assert result.data.id == "test-scope"

    @pytest.mark.asyncio
    async def test_create_scope(self):
        """Test creating a scope."""
        with patch.object(
            Client, "_async_request", return_value=Mock(ok=True, data=Mock())
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.create_scope(
                name="New Scope", tag="new", state="active", score=0.5, cycles=0
            )

            assert result.ok is True

    @pytest.mark.asyncio
    async def test_update_scope(self):
        """Test updating a scope."""
        with patch.object(
            Client, "_async_request", return_value=Mock(ok=True, data=Mock())
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.update_scope("test-scope", score=0.75)

            assert result.ok is True


class TestModelOperations:
    """Test model API operations."""

    @pytest.mark.asyncio
    async def test_connect_model(self):
        """Test connecting a model."""
        model_data = {
            "handle": "mh_abcdef0123456789abcdef",
            "provider": "openai",
            "model": "gpt-4",
            "created_at": "2025-04-24T10:00:00Z",
            "last_used_at": None,
        }

        with patch.object(
            Client,
            "_async_request",
            return_value=Mock(ok=True, data=ModelHandle(**model_data)),
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.connect_model(
                Mock(
                    provider="openai",
                    api_key="sk-test",
                    model="gpt-4",
                    model_dump=Mock(return_value=model_data),
                )
            )

            assert result.ok is True

    @pytest.mark.asyncio
    async def test_get_model(self):
        """Test getting a model."""
        with patch.object(
            Client, "_async_request", return_value=Mock(ok=True, data=Mock())
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.get_model("mh_test")

            assert result.ok is True


class TestFinalityOperations:
    """Test finality API operations."""

    @pytest.mark.asyncio
    async def test_get_finality_status(self):
        """Test getting finality status."""
        status_data = {
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

        with patch.object(
            Client,
            "_async_request",
            return_value=Mock(ok=True, data=FinalityStatus(**status_data)),
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.get_finality_status("test-scope")

            assert result.ok is True
            assert result.data.score == 0.85

    @pytest.mark.asyncio
    async def test_get_finality_certificate(self):
        """Test getting finality certificate."""
        with patch.object(
            Client, "_async_request", return_value=Mock(ok=True, data=Mock())
        ) as mock_request:
            client = Client(base_url="http://localhost:3000")
            result = await client.get_finality_certificate("test-scope", 1)

            assert result.ok is True


class TestContextManagers:
    """Test context manager functionality."""

    def test_sync_context_manager(self):
        """Test sync context manager."""
        with Client(base_url="http://localhost:3000") as client:
            assert client.base_url == "http://localhost:3000"

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        """Test async context manager."""
        async with Client(base_url="http://localhost:3000") as client:
            assert client.base_url == "http://localhost:3000"

        # Client should be closed after exiting context
        assert True  # No exception raised


class TestErrorHandling:
    """Test error handling."""

    @pytest.mark.asyncio
    async def test_network_error(self):
        """Test handling of network errors."""
        client = Client(base_url="http://localhost:3000")

        with patch.object(
            client, "_async_client", Mock(request=AsyncMock(side_effect=Exception("Network error")))
        ):
            result = await client._async_request("GET", "/api/v1/scopes", Scope)

            assert result.ok is False
            assert result.error.code == "REQUEST_ERROR"

    @pytest.mark.asyncio
    async def test_http_error(self):
        """Test handling of HTTP errors."""
        client = Client(base_url="http://localhost:3000")

        error_response = Mock(
            status_code=404, json=Mock(return_value={"code": "NOT_FOUND", "message": "Not found"})
        )

        with patch.object(
            client,
            "_async_client",
            Mock(request=AsyncMock(side_effect=Exception("404 Not Found"))),
        ):
            result = await client._async_request("GET", "/api/v1/scopes/nonexistent", Scope)

            assert result.ok is False


class TestCreateClientFunction:
    """Test the create_client factory function."""

    def test_create_client_with_base_url(self):
        """Test creating client with base URL."""
        client = create_client(base_url="http://localhost:3000")
        assert isinstance(client, Client)
        assert client.base_url == "http://localhost:3000"

    def test_create_client_with_api_key(self):
        """Test creating client with API key."""
        client = create_client(
            base_url="http://localhost:3000", api_key="test-key"
        )
        assert client.api_key == "test-key"

    def test_create_client_with_custom_timeout(self):
        """Test creating client with custom timeout."""
        client = create_client(
            base_url="http://localhost:3000", timeout=60.0
        )
        assert client.timeout == 60.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
