# Testing Guide - @sgrs/client-ts

Comprehensive unit and integration tests for the TypeScript SGRS API client.

## Test Structure

```
src/__tests__/
├── client.test.ts       # Unit tests for Client class
└── integration.test.ts  # Integration tests with mocked API responses
```

## Running Tests

### Install dependencies
```bash
cd packages/client-ts
pnpm install
```

### Run all tests
```bash
pnpm test
```

### Run tests with UI
```bash
pnpm test:ui
```

### Run tests in watch mode
```bash
pnpm test -- --watch
```

### Run with coverage
```bash
pnpm test -- --coverage
```

## Test Coverage

### Unit Tests (`client.test.ts`)

**Constructor & Initialization**
- Initialize with required config
- Accept optional apiKey
- Normalize baseUrl (remove trailing slash)

**Scopes API**
- `list()` - successful response, HTTP errors, network errors, timeouts
- `get()` - correct path construction, URL encoding of special characters
- `create()` - POST with request body
- `update()` - PATCH with partial data
- `delete()` - DELETE with correct path

**Models API**
- `connect()` - model connection with validation
- `get()` - retrieve model by handle
- `list()` - list all connected models
- `revoke()` - revoke model access

**Finality API**
- `status()` - get finality status for scope
- `certificate()` - retrieve certificate by round
- `verify()` - verify certificate signature

**Health Check**
- `check()` - basic health endpoint

**Request Headers**
- Authorization header when apiKey is set
- Correct Content-Type and Accept headers
- No auth header when apiKey is absent

**Factory Function**
- `createClient()` creates Client instance
- Pass configuration correctly

### Integration Tests (`integration.test.ts`)

**Scope Management Workflow**
- List, get, create, update, delete scopes
- Realistic M&A governance scenario (Project Horizon)

**LLM Model Management Workflow**
- Connect model with request validation
- List, get, revoke models
- OpenAI provider integration

**Finality Certificate Workflow**
- Get finality status with all dimensions
- Retrieve and verify certificates
- Check veto flags and convergence rates

**Error Handling Scenarios**
- 404 Not Found errors
- 400 Bad Request with validation details
- 500 Internal Server Error

**Edge Cases**
- Empty response bodies (204 No Content)
- Special characters in IDs (URL encoding)
- Multiple API calls in sequence

## Test Patterns

### Mocking Fetch
```typescript
const mockFetch = vi.fn();
mockFetch.mockResolvedValueOnce({
  ok: true,
  status: 200,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => ({ /* response data */ }),
});

const client = new Client({
  baseUrl: "http://localhost:3003",
  fetch: mockFetch,
});
```

### Testing Async Operations
```typescript
it("should handle successful response", async () => {
  const result = await client.scopes.list();
  expect(result.ok).toBe(true);
  expect(result.status).toBe(200);
});
```

### Testing Error Scenarios
```typescript
it("should handle HTTP errors", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({
      code: "NOT_FOUND",
      message: "Scope not found",
    }),
  });

  const result = await client.scopes.list();
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe("NOT_FOUND");
});
```

## Test Utilities

**Helper: `createMockFetch()`**
Creates a mock fetch implementation that responds to specific endpoints:
```typescript
const { mockFetch, calls } = createMockFetch({
  "GET scopes": { ok: true, status: 200, data: [] },
  "POST scopes": { ok: true, status: 201, data: newScope },
});
```

Returns:
- `mockFetch` - Mock fetch function ready for client
- `calls` - Array tracking all request calls made

## Verification Checklist

- [x] Constructor accepts all config options
- [x] All API endpoints are callable
- [x] Request/response types are correct
- [x] Error responses are structured properly
- [x] Special characters in IDs are URL-encoded
- [x] Authorization header is set when apiKey is provided
- [x] Timeouts are handled correctly
- [x] Network errors are caught and reported
- [x] Status codes are correctly reported
- [x] Integration tests cover realistic workflows
- [x] Edge cases are handled (empty bodies, special chars, etc.)

## CI/CD Integration

Tests are configured to run in GitHub Actions CI pipeline (`.github/workflows/ci.yml`):

```yaml
- run: pnpm test  # Run all tests in the workspace
```

Tests must pass before:
- Pull requests are merged
- Release workflows trigger
- Production deployments proceed

## Debugging Tips

### Verbose output
```bash
pnpm test -- --reporter=verbose
```

### Focus on specific test
```bash
pnpm test -- --grep "should handle HTTP errors"
```

### Debug in Node inspector
```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs
```

## Future Improvements

- [ ] Add performance benchmarks
- [ ] Add stress tests (many concurrent requests)
- [ ] Add compatibility tests for Node.js versions
- [ ] Add browser compatibility tests
- [ ] Add snapshot tests for response structures
- [ ] Add e2e tests against real API (staging)

## Contributing

When adding new API endpoints:

1. Add unit test for each method
2. Add integration test for each workflow
3. Test both success and error cases
4. Document the new test in this file
5. Ensure all tests pass before submitting PR
