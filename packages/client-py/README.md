# sgrs-client

Python HTTP client for the SGRS REST API — feature-parity with
[`@sgrs/client-ts`](../client-ts).

## Installation

```bash
pip install sgrs-client
```

## Quick Start

### Async Usage

```python
import asyncio
from sgrs_client import create_client

async def main():
    client = create_client(
        base_url="http://localhost:3003",
        tenant_id="acme",        # sent as X-Tenant-ID on authenticated requests
        api_key="sk-...",        # optional; sent as Authorization: Bearer
    )

    response = await client.list_scopes()
    if response.ok:
        for scope in response.data:
            print(scope.id, scope.state)
    else:
        print(f"Error: {response.error}")

    await client.close()

asyncio.run(main())
```

### Sync Usage

Every async method has a `*_sync` counterpart:

```python
from sgrs_client import create_client

client = create_client(base_url="http://localhost:3003", tenant_id="acme")

response = client.get_scope_sync("my-scope")
print(response.data if response.ok else response.error)

client._sync_client.close()
```

### Context Manager

```python
import asyncio
from sgrs_client import create_client

async def main():
    async with create_client(base_url="http://localhost:3003", tenant_id="acme") as client:
        response = await client.get_scope("my-scope")
        print(response.data if response.ok else response.error)

asyncio.run(main())
```

## Configuration

| Argument     | Type    | Default | Notes |
|--------------|---------|---------|-------|
| `base_url`   | `str`   | —       | Base URL of the SGRS API. |
| `tenant_id`  | `str?`  | `None`  | Sent as `X-Tenant-ID` on authenticated requests. Validated against the `TenantId` contract (lowercase `a-z`, `0-9`, inner hyphens; max 64). Raises `ValueError` if invalid. Not sent on `check_health`. |
| `api_key`    | `str?`  | `None`  | Sent as `Authorization: Bearer <api_key>`. |
| `timeout`    | `float` | `30.0`  | Request timeout in seconds. |
| `verify_ssl` | `bool`  | `True`  | Verify TLS certificates. |
| `nats`       | `NatsConfig?` | `None` | Optional real-time NATS transport (`pip install 'sgrs-client[nats]'`). |

All authenticated requests send `X-Tenant-ID` when `tenant_id` is configured.
`check_health()` never sends the tenant header.

## API surface

Every method is async; append `_sync` for the blocking variant. All results are
an `ApiResponse` with `ok`, `status_code`, `data`, and `error` (an `ApiError`
with `code`, `message`, `status_code`, `details`).

### Scopes

```python
await client.list_scopes()                        # GET    /api/scopes
await client.get_scope("scope-id")                # GET    /api/scopes/{id}
await client.create_scope("scope-id", "Name", "tag", state="active")  # POST /api/scopes
await client.update_scope("scope-id", name="New", tag="t")            # PUT  /api/scopes/{id}  (full replace)
await client.patch_scope("scope-id", score=0.75)  # PATCH  /api/scopes/{id}  (partial)
await client.delete_scope("scope-id")             # DELETE /api/scopes/{id}
```

### Models

```python
from sgrs_client import ConnectModelRequest

await client.list_models()                        # GET    /api/models
await client.connect_model(ConnectModelRequest(provider="openai", api_key="sk-...", model="gpt-4"))  # POST /api/models
await client.get_model("mh_xxx")                  # GET    /api/models/{handle}
await client.revoke_model("mh_xxx")               # DELETE /api/models/{handle}
```

### Finality

```python
await client.get_finality_status("scope-id")      # GET  /api/finality/{id}
await client.upsert_finality("scope-id", score=0.9, per_dimension={}, monotonicity_rounds=1,
                             plateau_ema=0.0, convergence_rate=0.0, state="near-final", veto_active=False)  # POST /api/finality/{id}
await client.get_finality_history("scope-id", limit=500)   # GET /api/finality/{id}/history
await client.get_finality_certificate("scope-id", round=1) # GET /api/finality/{id}/certificate/{round}
await client.verify_finality_certificate(cert)             # POST /api/finality/verify
```

> Note: `get_finality_certificate` and `verify_finality_certificate` mirror the
> `@sgrs/client-ts` surface. They are not yet mounted in `apps/api`; they are
> provided for parity and forward-compatibility.

### Agents, Health, Ingest

```python
from sgrs_client import IngestDocumentRequest

await client.list_agents()                        # GET  /api/agents
await client.get_agent("ag-...")                  # GET  /api/agents/{id}
await client.check_health()                       # GET  /api/health  (no tenant header)
await client.ingest_document(IngestDocumentRequest(scope_id="scope-id", name="memo.pdf", text="..."))  # POST /api/ingest
```

### Governance read helpers

```python
await client.list_claims("scope-id")              # GET /api/claims/{id}
await client.list_contradictions("scope-id")      # GET /api/contradictions/{id}
await client.list_risks("scope-id")               # GET /api/risks/{id}
await client.list_documents("scope-id")           # GET /api/documents/{id}
await client.get_latest_epoch("scope-id")         # GET /api/epochs/{id}/latest
```

## Features

- **Feature parity** with `@sgrs/client-ts` — same resources, paths, and headers.
- **Type-safe**: responses validated with Pydantic models derived from `@sgrs/api-schema`.
- **Async-first** with a `*_sync` variant for every method.
- **Multi-tenant**: `X-Tenant-ID` on authenticated calls; validated at construction.
- **Structured errors**: `ApiResponse` / `ApiError` with stable codes
  (`REQUEST_TIMEOUT`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `HTTP_<status>`, …).
- **Real-time events** (optional): NATS transport via `client.events`.

## Documentation (Sphinx)

From the **repository root**, `pnpm docs:py` runs `scripts/docs-py.sh`, which maintains `packages/client-py/.venv` so installs work on PEP-668–managed Pythons:

```bash
pnpm docs:py
```

Generated HTML: `packages/client-py/docs/_build/html/` (Sphinx sources in `packages/client-py/docs/`).

## License

MIT - see LICENSE file
