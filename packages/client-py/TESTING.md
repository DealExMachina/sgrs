# Testing Guide - sgrs-client

Comprehensive unit and integration tests for the Python SGRS API client.

## Test Structure

```
tests/
├── __init__.py
├── test_client.py       # Unit tests for Client class
└── test_integration.py  # Integration tests with mocked HTTP responses
```

## Running Tests

### Install dependencies
```bash
cd packages/client-py
pip install -e ".[test]"
```

### Run all tests
```bash
pytest
```

### Run with verbose output
```bash
pytest -v
```

### Run with coverage report
```bash
pytest --cov=sgrs_client --cov-report=html
```

### Run specific test file
```bash
pytest tests/test_client.py
```

### Run specific test class
```bash
pytest tests/test_client.py::TestClientInitialization
```

### Run specific test
```bash
pytest tests/test_client.py::TestClientInitialization::test_init_with_base_url
```

### Run async tests only
```bash
pytest -m asyncio
```

## Test Coverage

### Unit Tests (`test_client.py`)

**ClientInitialization**
- Initialize with base URL
- Strip trailing slash from baseUrl
- Initialize with API key
- Custom timeout configuration
- SSL verification toggle

**RequestHeaders**
- Basic headers (Content-Type, Accept)
- Authorization header with API key
- No auth header without API key

**ScopeOperations**
- `get_scope()` - async scope retrieval
- `create_scope()` - create new scope
- `update_scope()` - update existing scope

**ModelOperations**
- `connect_model()` - connect LLM provider
- `get_model()` - retrieve model by handle

**FinalityOperations**
- `get_finality_status()` - get status with dimensions
- `get_finality_certificate()` - retrieve certificate

**ContextManagers**
- Sync context manager entry/exit
- Async context manager entry/exit

**ErrorHandling**
- Network error handling
- HTTP error status codes
- Validation error handling

**FactoryFunction**
- `create_client()` creates Client instance
- Pass configuration options

### Integration Tests (`test_integration.py`)

**ScopeManagementWorkflow**
- Complete lifecycle: create, read, update, delete
- Project Horizon M&A scenario
- Multiple scope updates in sequence

**ModelManagementWorkflow**
- Connect model with all providers
- List and retrieve models
- Revoke model access
- OpenAI, Anthropic, Azure-OpenAI, Ollama support

**FinalityCertificateWorkflow**
- Get finality status with all dimensions
- Retrieve certificate by round
- Verify certificate payload integrity
- Veto flag handling
- Near-final state detection

**ErrorHandling**
- 404 Not Found responses
- 400 Bad Request with validation details
- 500 Internal Server Error
- Network connection failures
- Timeout scenarios

**SyncOperations**
- Synchronous scope operations
- Synchronous model operations
- Sync/async consistency

**EdgeCases**
- Empty response bodies (204 No Content)
- All finality dimensions populated
- Multiple concurrent requests
- Special characters in IDs

## Test Patterns

### Mocking HTTP Responses
```python
from unittest.mock import AsyncMock, Mock, patch

async def mock_request(method, url, **kwargs):
    if method == "GET" and "scopes" in url:
        return MockHTTPResponse(200, scope_data)
    return MockHTTPResponse(404, {"error": "Not found"})

with patch.object(client._async_client, "request", new=mock_request):
    result = await client.get_scope("test-scope")
```

### Testing Async Operations
```python
@pytest.mark.asyncio
async def test_get_scope(self):
    """Test getting a scope."""
    result = await client.get_scope("test-scope")
    assert result.ok is True
    assert result.data.id == "test-scope"
```

### Testing Sync Operations
```python
def test_sync_get_scope(self):
    """Test synchronous scope retrieval."""
    result = client.get_scope_sync("test-scope")
    assert result.ok is True
```

### Testing Error Cases
```python
@pytest.mark.asyncio
async def test_404_not_found(self):
    """Test handling of 404 Not Found errors."""
    async def mock_request(method, url, **kwargs):
        return MockHTTPResponse(404, {
            "code": "SCOPE_NOT_FOUND",
            "message": "Scope not found",
        })
    
    with patch.object(client._async_client, "request", new=mock_request):
        result = await client.get_scope("nonexistent")
        assert result.ok is False
        assert result.error.status_code == 404
```

## Mock Utilities

**MockHTTPResponse**
Simulates httpx response:
```python
response = MockHTTPResponse(
    status_code=200,
    json_data={"id": "scope-1", "name": "Test"}
)
```

Methods:
- `json()` - Returns parsed JSON
- `raise_for_status()` - Raises on 4xx/5xx
- `.headers` - Response headers dict

## Test Fixtures

### `@pytest.fixture`
```python
@pytest.fixture
def client():
    """Create a test client."""
    return Client(base_url="http://localhost:3000")

@pytest.fixture
def client_with_key():
    """Create a test client with API key."""
    return Client(base_url="http://localhost:3000", api_key="test-key")
```

## Verification Checklist

- [x] Client initialization with all config options
- [x] All API endpoints callable (async and sync)
- [x] Request headers set correctly
- [x] Authorization header with API key
- [x] Response validation with Pydantic models
- [x] Error responses structured properly
- [x] Context manager support (async and sync)
- [x] URL encoding for special characters
- [x] Timeout handling
- [x] Network error handling
- [x] HTTP status code handling (4xx, 5xx)
- [x] Empty response bodies (204 No Content)
- [x] All finality dimensions validated
- [x] Scope lifecycle operations
- [x] Model provider connections
- [x] Certificate verification

## Type Checking

### Run mypy
```bash
mypy src/sgrs_client --strict
```

### Type hints in tests
```python
def test_get_scope(self, client: Client) -> None:
    """Test getting a scope."""
    result = client.get_scope_sync("test-scope")
    assert isinstance(result.data, Scope)
```

## CI/CD Integration

Tests are configured in GitHub Actions (`.github/workflows/ci.yml`):

```yaml
- run: pnpm test  # Python tests included in workspace test
```

Test requirements:
- All tests must pass
- Coverage should be > 80%
- Type checking must pass (mypy)
- No lint warnings

## Debugging Tips

### Verbose pytest output
```bash
pytest -vv --tb=long
```

### Show print statements
```bash
pytest -s
```

### Run with pdb on failure
```bash
pytest --pdb
```

### Show local variables on failure
```bash
pytest -l
```

### Show slowest tests
```bash
pytest --durations=10
```

## Performance Testing

### Test execution time
```bash
pytest --durations=0
```

### Profile specific test
```bash
pytest --profile test_client.py::TestScopeOperations::test_get_scope
```

## Future Improvements

- [ ] Add performance benchmarks (asyncio loop overhead)
- [ ] Add stress tests (100+ concurrent requests)
- [ ] Add compatibility tests for Python 3.10-3.12
- [ ] Add test fixtures for common scenarios
- [ ] Add property-based tests with hypothesis
- [ ] Add e2e tests against staging API
- [ ] Add memory leak detection
- [ ] Add SSL/TLS cert validation tests

## Contributing

When adding new features:

1. Add unit test for each public method
2. Add integration test for workflows
3. Test both async and sync paths
4. Test success and error cases
5. Update this TESTING.md
6. Ensure coverage > 80%
7. Run `pytest` and `mypy` before submitting PR

## Running Full Test Suite

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run all tests with coverage
pytest --cov=sgrs_client --cov-report=html

# Type check
mypy src/sgrs_client --strict

# Format check
black --check src tests

# Lint
ruff check src tests
```

## Test Maintenance

- Update mocks when API schema changes
- Maintain parity between unit and integration tests
- Keep test data realistic (use actual API examples)
- Document new test patterns in this file
- Archive old test scenarios (don't delete)
