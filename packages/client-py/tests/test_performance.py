"""Performance benchmarks for the SGRS Python API client.

Run with: pytest tests/test_performance.py -v --benchmark-only

Measures:
- Request latency (ms)
- Throughput (requests/sec)
- Memory usage
- Concurrent request performance
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import pytest

from sgrs_client import Client, create_client
from sgrs_client.schema import Scope, ModelHandle, FinalityStatus


class MockHTTPResponse:
    """Mock HTTP response with configurable delay."""

    def __init__(self, status_code: int, json_data: dict, delay_ms: int = 0):
        self.status_code = status_code
        self.json_data = json_data
        self.delay_ms = delay_ms
        self.headers = {"content-type": "application/json"}

    async def aread(self):
        if self.delay_ms > 0:
            await asyncio.sleep(self.delay_ms / 1000)
        return None

    def json(self):
        return self.json_data

    def raise_for_status(self):
        if not 200 <= self.status_code < 300:
            raise Exception(f"HTTP {self.status_code}")


@pytest.fixture
def mock_scope():
    """Sample scope for benchmarking."""
    return {
        "id": "perf-test-scope",
        "name": "Performance Test Scope",
        "tag": "perf",
        "state": "active",
        "score": 0.5,
        "cycles": 0,
        "created_at": datetime.now().isoformat() + "Z",
        "updated_at": datetime.now().isoformat() + "Z",
    }


@pytest.fixture
def mock_model():
    """Sample model handle for benchmarking."""
    return {
        "handle": "mh_abcdef0123456789abcdef",
        "provider": "openai",
        "model": "gpt-4",
        "created_at": datetime.now().isoformat() + "Z",
        "last_used_at": None,
    }


@pytest.fixture
def mock_finality():
    """Sample finality status for benchmarking."""
    return {
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


class TestLatencyZeroDelay:
    """Benchmark latency with zero network delay (local operation)."""

    @pytest.mark.asyncio
    async def test_get_scope_latency(self, benchmark, mock_scope):
        """Measure latency for getting a scope."""

        async def get_scope():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                return await client.get_scope("test-scope")

        await benchmark.pedantic(get_scope, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_list_scopes_latency(self, benchmark, mock_scope):
        """Measure latency for listing scopes."""

        async def list_scopes():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, [mock_scope])
                ),
            ):
                return await client._async_request("GET", "/api/v1/scopes", Scope)

        await benchmark.pedantic(list_scopes, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_create_scope_latency(self, benchmark, mock_scope):
        """Measure latency for creating a scope."""

        async def create_scope():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(201, mock_scope)
                ),
            ):
                return await client.create_scope(
                    name="Test", tag="test", state="active", score=0.5, cycles=0
                )

        await benchmark.pedantic(create_scope, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_update_scope_latency(self, benchmark, mock_scope):
        """Measure latency for updating a scope."""

        async def update_scope():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                return await client.update_scope("test-scope", score=0.75)

        await benchmark.pedantic(update_scope, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_connect_model_latency(self, benchmark, mock_model):
        """Measure latency for connecting a model."""

        async def connect_model():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(201, mock_model)
                ),
            ):
                from sgrs_client import ConnectModelRequest

                request = ConnectModelRequest(
                    provider="openai", api_key="sk-test", model="gpt-4"
                )
                return await client.connect_model(request)

        await benchmark.pedantic(connect_model, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_get_finality_status_latency(
        self, benchmark, mock_finality
    ):
        """Measure latency for getting finality status."""

        async def get_finality():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_finality)
                ),
            ):
                return await client.get_finality_status("test-scope")

        await benchmark.pedantic(get_finality, rounds=100, iterations=1)


class TestLatencyWithNetworkDelay:
    """Benchmark latency with simulated network delay (50ms)."""

    @pytest.mark.asyncio
    async def test_get_scope_with_50ms_delay(self, benchmark, mock_scope):
        """Measure latency for getting a scope with 50ms network delay."""

        async def get_scope_delayed():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope, delay_ms=50)
                ),
            ):
                return await client.get_scope("test-scope")

        await benchmark.pedantic(get_scope_delayed, rounds=50, iterations=1)

    @pytest.mark.asyncio
    async def test_create_scope_with_50ms_delay(
        self, benchmark, mock_scope
    ):
        """Measure latency for creating a scope with 50ms network delay."""

        async def create_scope_delayed():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(201, mock_scope, delay_ms=50)
                ),
            ):
                return await client.create_scope(
                    name="Test", tag="test", state="active", score=0.5, cycles=0
                )

        await benchmark.pedantic(create_scope_delayed, rounds=50, iterations=1)


class TestThroughput:
    """Benchmark throughput with multiple sequential requests."""

    @pytest.mark.asyncio
    async def test_100_sequential_gets(self, benchmark, mock_scope):
        """Measure throughput for 100 sequential GET requests."""

        async def sequential_gets():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                for _ in range(100):
                    await client.get_scope("test-scope")

        await benchmark.pedantic(sequential_gets, rounds=10, iterations=1)

    @pytest.mark.asyncio
    async def test_10_scope_crud_cycles(self, benchmark, mock_scope):
        """Measure throughput for 10 complete CRUD cycles."""

        async def crud_cycles():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                for i in range(10):
                    await client.create_scope(
                        name=f"Scope {i}",
                        tag="test",
                        state="active",
                        score=0.5,
                        cycles=0,
                    )
                    await client.get_scope(f"scope-{i}")
                    await client.update_scope(f"scope-{i}", score=0.75)

        await benchmark.pedantic(crud_cycles, rounds=5, iterations=1)


class TestConcurrency:
    """Benchmark concurrent request performance."""

    @pytest.mark.asyncio
    async def test_5_concurrent_gets(self, benchmark, mock_scope):
        """Measure performance of 5 concurrent GET requests."""

        async def concurrent_5():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                await asyncio.gather(
                    *[
                        client.get_scope(f"scope-{i}")
                        for i in range(5)
                    ]
                )

        await benchmark.pedantic(concurrent_5, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_10_concurrent_gets(self, benchmark, mock_scope):
        """Measure performance of 10 concurrent GET requests."""

        async def concurrent_10():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(200, mock_scope)
                ),
            ):
                await asyncio.gather(
                    *[
                        client.get_scope(f"scope-{i}")
                        for i in range(10)
                    ]
                )

        await benchmark.pedantic(concurrent_10, rounds=50, iterations=1)

    @pytest.mark.asyncio
    async def test_20_concurrent_mixed(
        self, benchmark, mock_scope, mock_finality
    ):
        """Measure performance of 20 concurrent mixed operations."""

        async def concurrent_mixed():
            client = Client(base_url="http://localhost:3003")

            async def mock_request(method, url, **kwargs):
                if "finality" in url:
                    return MockHTTPResponse(200, mock_finality)
                return MockHTTPResponse(200, mock_scope)

            with patch.object(
                client._async_client,
                "request",
                new=mock_request,
            ):
                operations = (
                    [client.get_scope(f"scope-{i}") for i in range(5)]
                    + [client.get_finality_status(f"scope-{i}") for i in range(5)]
                    + [client.get_scope(f"scope-{i}") for i in range(10)]
                )
                await asyncio.gather(*operations)

        await benchmark.pedantic(concurrent_mixed, rounds=20, iterations=1)


class TestMemoryEfficiency:
    """Benchmark memory usage and object creation."""

    def test_create_1000_clients(self, benchmark):
        """Measure memory efficiency of creating 1000 client instances."""

        def create_clients():
            for _ in range(1000):
                Client(base_url="http://localhost:3003")

        benchmark.pedantic(create_clients, rounds=5, iterations=1)

    def test_serialize_large_scope_list(self, benchmark, mock_scope):
        """Measure performance of serializing large scope lists."""

        def serialize():
            scopes = [mock_scope for _ in range(100)]
            return sum(
                len(str(scope)) for scope in scopes
            )  # Simulate work

        benchmark.pedantic(serialize, rounds=1000, iterations=1)


class TestErrorHandling:
    """Benchmark error handling overhead."""

    @pytest.mark.asyncio
    async def test_404_error_handling(self, benchmark):
        """Measure overhead of handling 404 errors."""

        async def handle_404():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(
                        404, {"code": "NOT_FOUND", "message": "Not found"}
                    )
                ),
            ):
                result = await client.get_scope("nonexistent")
                return result.ok

        await benchmark.pedantic(handle_404, rounds=100, iterations=1)

    @pytest.mark.asyncio
    async def test_500_error_handling(self, benchmark):
        """Measure overhead of handling 500 errors."""

        async def handle_500():
            client = Client(base_url="http://localhost:3003")
            with patch.object(
                client._async_client,
                "request",
                new=AsyncMock(
                    return_value=MockHTTPResponse(
                        500,
                        {"code": "SERVER_ERROR", "message": "Server error"},
                    )
                ),
            ):
                result = await client.get_finality_status("test")
                return result.ok

        await benchmark.pedantic(handle_500, rounds=100, iterations=1)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--benchmark-only"])
