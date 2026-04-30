# Performance Examples - SGRS Client SDKs

Practical code examples demonstrating performance best practices for both TypeScript and Python clients.

---

## TypeScript Examples

### Example 1: Basic Client Setup with Optimal Configuration

```typescript
import { createClient } from '@sgrs/client-ts';

// Optimal configuration for production
const client = createClient({
  baseUrl: 'https://api.sgrs.example.com',
  apiKey: process.env.SGRS_API_KEY,
  timeout: 30000, // 30 seconds
  // Optionally provide custom fetch (for testing, edge-computing)
  // fetch: customFetchImplementation,
});

// Client is now ready for use across your application
export default client;
```

### Example 2: Efficient Batch Scope Retrieval

```typescript
import client from './client.js';

async function getScopesOptimized(scopeIds: string[]): Promise<Scope[]> {
  // Concurrent batches instead of sequential requests
  const batchSize = 10;
  const results: Scope[] = [];

  for (let i = 0; i < scopeIds.length; i += batchSize) {
    const batch = scopeIds.slice(i, i + batchSize);
    
    // All requests in batch run in parallel
    const batchResults = await Promise.all(
      batch.map(id => client.scopes.get(id))
    );

    // Collect results
    results.push(
      ...batchResults
        .filter(r => r.ok && r.data)
        .map(r => r.data!)
    );
  }

  return results;
}

// Usage
const scopes = await getScopesOptimized([
  'scope-1', 'scope-2', 'scope-3', // ... many more
]);
```

**Performance:**
- **Sequential (bad):** 100 scopes × 50ms = 5000ms
- **Batched (good):** 5 batches × 50ms = 250ms
- **Improvement:** 20x faster

### Example 3: Concurrent Scope Management Workflow

```typescript
interface ScopeUpdate {
  id: string;
  score: number;
  cycles: number;
}

async function updateScopesParallel(updates: ScopeUpdate[]): Promise<void> {
  // Update all scopes in parallel
  const updatePromises = updates.map(update =>
    client.scopes.update(update.id, {
      score: update.score,
      cycles: update.cycles,
    })
  );

  const results = await Promise.all(updatePromises);

  // Check for errors
  const errors = results.filter(r => !r.ok);
  if (errors.length > 0) {
    console.error(`Failed to update ${errors.length} scopes:`, errors);
    // Implement retry logic as needed
  }
}

// Usage: Update 50 scopes concurrently
await updateScopesParallel([
  { id: 'scope-1', score: 0.75, cycles: 2 },
  { id: 'scope-2', score: 0.82, cycles: 3 },
  // ... 48 more updates
]);
```

**Performance:**
- **Sequential:** 50 × 50ms = 2500ms
- **Parallel:** ~50ms (all complete in single network RTT)
- **Improvement:** 50x faster

### Example 4: Implementing Response Caching

```typescript
import client from './client.js';
import { Scope } from '@sgrs/client-ts';

class CachedScopeClient {
  private cache = new Map<string, { data: Scope; timestamp: number }>();
  private ttl = 5 * 60 * 1000; // 5 minute TTL

  async getScope(scopeId: string): Promise<Scope | null> {
    // Check cache
    const cached = this.cache.get(scopeId);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log(`Cache hit for ${scopeId}`);
      return cached.data;
    }

    // Fetch from API
    const response = await client.scopes.get(scopeId);
    if (!response.ok || !response.data) {
      return null;
    }

    // Store in cache
    this.cache.set(scopeId, {
      data: response.data,
      timestamp: Date.now(),
    });

    return response.data;
  }

  invalidate(scopeId: string): void {
    this.cache.delete(scopeId);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const cachedClient = new CachedScopeClient();

// First call: Network request (~50ms)
const scope1 = await cachedClient.getScope('scope-1');

// Second call within 5 minutes: Cache hit (<1ms)
const scope2 = await cachedClient.getScope('scope-1');
```

**Performance Impact:**
- Cache miss: 50ms
- Cache hit: <1ms
- 80% cache hit rate: Average 10.4ms (5x improvement)

### Example 5: Error Handling with Retry Logic

```typescript
import client from './client.js';

async function getWithRetry(
  scopeId: string,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<Scope | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await client.scopes.get(scopeId);

    if (response.ok && response.data) {
      return response.data;
    }

    // Check if error is retryable
    const isRetryable =
      response.status >= 500 || // Server errors
      response.status === 429; // Rate limited

    if (!isRetryable || attempt === maxRetries) {
      console.error(`Failed to get scope ${scopeId}:`, response.error);
      return null;
    }

    // Exponential backoff
    const backoff = delayMs * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, backoff));
  }

  return null;
}

// Usage
const scope = await getWithRetry('scope-1');
```

### Example 6: Rate Limiting with Semaphore

```typescript
import client from './client.js';

class Semaphore {
  private permits: number;
  private waitingQueue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waitingQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const waiting = this.waitingQueue.shift();
    if (waiting) {
      this.permits--;
      waiting();
    }
  }
}

// Create semaphore allowing 10 concurrent requests
const semaphore = new Semaphore(10);

async function fetchScopeWithLimit(scopeId: string) {
  await semaphore.acquire();
  try {
    return await client.scopes.get(scopeId);
  } finally {
    semaphore.release();
  }
}

// Usage: Process 100 scopes with max 10 concurrent requests
const scopeIds = Array.from({ length: 100 }, (_, i) => `scope-${i}`);
const results = await Promise.all(
  scopeIds.map(fetchScopeWithLimit)
);
```

**Performance Benefit:**
- Prevents connection exhaustion
- Maintains stable resource usage
- Avoids server overload errors

---

## Python Examples

### Example 1: Async Context Manager Setup

```python
import asyncio
from sgrs_client import create_client

async def main():
    # Async context manager automatically closes connection
    async with create_client(
        base_url='https://api.sgrs.example.com',
        api_key='your-api-key',
        timeout=30.0,
    ) as client:
        # Client ready for concurrent operations
        scope = await client.get_scope('scope-1')
        print(f"Scope: {scope.data}")

asyncio.run(main())
```

### Example 2: Concurrent Scope Operations

```python
import asyncio
from sgrs_client import create_client

async def get_multiple_scopes(scope_ids: list[str]) -> dict:
    async with create_client(base_url='https://api.example.com') as client:
        # Fetch all scopes concurrently
        responses = await asyncio.gather(
            *[client.get_scope(id) for id in scope_ids],
            return_exceptions=True
        )
        
        # Process results
        results = {}
        for scope_id, response in zip(scope_ids, responses):
            if isinstance(response, Exception):
                results[scope_id] = {'error': str(response)}
            elif response.ok and response.data:
                results[scope_id] = {'data': response.data}
            else:
                results[scope_id] = {'error': response.error}
        
        return results

# Usage
scope_ids = [f'scope-{i}' for i in range(50)]
results = asyncio.run(get_multiple_scopes(scope_ids))
```

**Performance:**
- Sequential: 50 × 50ms = 2500ms
- Concurrent: ~50-100ms
- Improvement: 25-50x faster

### Example 3: Batch Processing with Semaphore

```python
import asyncio
from sgrs_client import create_client
from sgrs_client.schema import Scope

async def process_scopes_limited(
    scope_ids: list[str],
    max_concurrent: int = 10
) -> list[Scope]:
    # Semaphore limits concurrent requests
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def get_with_limit(scope_id: str) -> Scope | None:
        async with semaphore:
            async with create_client(base_url='...') as client:
                response = await client.get_scope(scope_id)
                return response.data if response.ok else None
    
    # Process all scopes with concurrency limit
    tasks = [get_with_limit(id) for id in scope_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out None values and exceptions
    return [r for r in results if isinstance(r, Scope)]

# Usage
scopes = asyncio.run(
    process_scopes_limited([f'scope-{i}' for i in range(100)])
)
```

### Example 4: Async Caching Implementation

```python
import asyncio
from datetime import datetime, timedelta
from sgrs_client import create_client
from sgrs_client.schema import Scope

class CachedAsyncClient:
    def __init__(self, base_url: str, ttl_seconds: int = 300):
        self.base_url = base_url
        self.ttl_seconds = ttl_seconds
        self.cache: dict[str, tuple[Scope, datetime]] = {}
    
    async def get_scope(self, scope_id: str) -> Scope | None:
        # Check cache
        if scope_id in self.cache:
            scope, timestamp = self.cache[scope_id]
            if datetime.now() - timestamp < timedelta(seconds=self.ttl_seconds):
                return scope
        
        # Fetch from API
        async with create_client(base_url=self.base_url) as client:
            response = await client.get_scope(scope_id)
        
        if response.ok and response.data:
            # Cache result
            self.cache[scope_id] = (response.data, datetime.now())
            return response.data
        
        return None
    
    def invalidate(self, scope_id: str) -> None:
        self.cache.pop(scope_id, None)
    
    def clear(self) -> None:
        self.cache.clear()

# Usage
cached_client = CachedAsyncClient('https://api.example.com')

# First call: Network request
scope1 = await cached_client.get_scope('scope-1')

# Subsequent calls within TTL: Cache hit
scope2 = await cached_client.get_scope('scope-1')
```

### Example 5: Error Handling with Async Retry

```python
import asyncio
from sgrs_client import create_client

async def get_with_retry(
    scope_id: str,
    max_retries: int = 3,
    delay_ms: float = 100
) -> dict | None:
    async with create_client(base_url='...') as client:
        for attempt in range(1, max_retries + 1):
            response = await client.get_scope(scope_id)
            
            if response.ok and response.data:
                return response.data.model_dump()
            
            # Check if error is retryable
            is_retryable = (
                response.status_code >= 500 or  # Server errors
                response.status_code == 429      # Rate limited
            )
            
            if not is_retryable or attempt == max_retries:
                print(f"Failed: {response.error}")
                return None
            
            # Exponential backoff
            backoff = delay_ms * (2 ** (attempt - 1))
            await asyncio.sleep(backoff / 1000)
    
    return None

# Usage
scope = asyncio.run(get_with_retry('scope-1'))
```

### Example 6: Sync Operations for Scripts

```python
from sgrs_client import create_client

def process_scopes_sync(scope_ids: list[str]) -> list[dict]:
    results = []
    
    with create_client(base_url='https://api.example.com') as client:
        for scope_id in scope_ids:
            response = client.get_scope_sync(scope_id)
            
            if response.ok and response.data:
                results.append(response.data.model_dump())
            else:
                print(f"Error: {response.error}")
    
    return results

# Usage: For CLI scripts, background jobs
scopes = process_scopes_sync([f'scope-{i}' for i in range(100)])
```

### Example 7: FastAPI Integration

```python
from fastapi import FastAPI, HTTPException
from sgrs_client import create_client
from contextlib import asynccontextmanager

# Global client (created once, reused)
_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup: Create client
    global _client
    _client = create_client(
        base_url='https://api.sgrs.example.com',
        api_key='your-api-key',
        timeout=30.0,
    )
    yield
    # Cleanup: Close client
    await _client.close()

app = FastAPI(lifespan=lifespan)

@app.get("/scope/{scope_id}")
async def get_scope_endpoint(scope_id: str):
    response = await _client.get_scope(scope_id)
    
    if not response.ok or not response.data:
        raise HTTPException(
            status_code=response.status_code,
            detail=response.error.message
        )
    
    return response.data

@app.post("/scopes/bulk")
async def bulk_get_scopes(scope_ids: list[str]):
    responses = await asyncio.gather(
        *[_client.get_scope(id) for id in scope_ids],
        return_exceptions=True
    )
    
    return {
        'success': [
            r.data.model_dump() 
            for r in responses 
            if hasattr(r, 'ok') and r.ok
        ],
        'failed': [
            {'id': id, 'error': r.error.message}
            for id, r in zip(scope_ids, responses)
            if hasattr(r, 'ok') and not r.ok
        ]
    }
```

**Benefits:**
- Single client across application
- Proper async/await patterns
- Efficient concurrent handling
- Automatic cleanup on shutdown

### Example 8: Celery Task with Async Client

```python
from celery import Celery
import asyncio
from sgrs_client import create_client

app = Celery('tasks', broker='redis://localhost:6379')

@app.task(bind=True)
def process_scopes_async(self, scope_ids: list[str]):
    """Celery task using async client"""
    
    async def _process():
        async with create_client(base_url='...') as client:
            # Process concurrently
            responses = await asyncio.gather(
                *[client.get_scope(id) for id in scope_ids],
                return_exceptions=True
            )
            
            # Collect results
            results = {}
            for scope_id, response in zip(scope_ids, responses):
                if hasattr(response, 'ok') and response.ok:
                    results[scope_id] = response.data.model_dump()
                else:
                    results[scope_id] = None
            
            return results
    
    # Run async code in sync context
    return asyncio.run(_process())

# Usage
task = process_scopes_async.delay([f'scope-{i}' for i in range(100)])
```

---

## Performance Comparison: Good vs Bad Patterns

### Pattern 1: Sequential vs Concurrent

**❌ Bad - Sequential (5000ms)**
```typescript
const scopes = [];
for (const id of scopeIds) {
  const response = await client.scopes.get(id); // 50ms each
  scopes.push(response.data);
}
// Total: 100 × 50ms = 5000ms
```

**✅ Good - Concurrent (100ms)**
```typescript
const responses = await Promise.all(
  scopeIds.map(id => client.scopes.get(id))
);
const scopes = responses
  .filter(r => r.ok && r.data)
  .map(r => r.data!);
// Total: ~50ms (batched) to ~100ms (all at once)
```

### Pattern 2: New Client Per Request vs Reuse

**❌ Bad - New Client (5500ms)**
```typescript
for (const id of scopeIds) {
  const client = new Client({ baseUrl: '...' }); // 10ms overhead
  const scope = await client.scopes.get(id); // 50ms
  scopes.push(scope.data); // 60ms per iteration × 100
}
// Total: 100 × 60ms = 6000ms
```

**✅ Good - Reuse Client (100ms)**
```typescript
const client = new Client({ baseUrl: '...' });
const responses = await Promise.all(
  scopeIds.map(id => client.scopes.get(id))
);
// Total: ~100ms (no per-request overhead)
```

### Pattern 3: Sync vs Async (Python)

**❌ Bad - Sync Loop (5000ms)**
```python
for scope_id in scope_ids:  # 100 IDs
    scope = client.get_scope_sync(scope_id)  # 50ms each
    process(scope)
# Total: 100 × 50ms = 5000ms
```

**✅ Good - Async Concurrent (100ms)**
```python
results = await asyncio.gather(
    *[client.get_scope(id) for id in scope_ids]
)
# Total: ~50-100ms (all concurrent)
```

---

## Monitoring Performance

### TypeScript: Measure Request Latency

```typescript
async function measureLatency() {
  const startTime = performance.now();
  
  const response = await client.scopes.get('scope-1');
  
  const endTime = performance.now();
  const latencyMs = endTime - startTime;
  
  console.log(`Request latency: ${latencyMs.toFixed(2)}ms`);
  return { response, latencyMs };
}
```

### Python: Measure Request Latency

```python
import time

async def measure_latency():
    start_time = time.time()
    
    response = await client.get_scope('scope-1')
    
    end_time = time.time()
    latency_ms = (end_time - start_time) * 1000
    
    print(f"Request latency: {latency_ms:.2f}ms")
    return response, latency_ms
```

---

## References

- **Performance Guidance:** `PERFORMANCE_GUIDANCE.md`
- **TypeScript Tests:** `packages/client-ts/src/__tests__/performance.bench.ts`
- **Python Tests:** `packages/client-py/tests/test_performance.py`
