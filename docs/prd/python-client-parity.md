# PRD — `sgrs-client` (Python) parity with `@sgrs/client-ts`

**Status:** Proposed
**Owner:** TBD (implementation by sub-agent)
**Scope:** `packages/client-py` (published to PyPI as `sgrs-client`)
**Related:** `packages/client-ts` (`@sgrs/client-ts`), `packages/api-schema`,
`apps/api`, `docs/integrations/*`

---

## 1. Summary

The Python SDK's HTTP layer has drifted from the live API and from the
TypeScript SDK. It targets stale `/api/v1/...` paths, omits the required
`X-Tenant-ID` header, leaves `list_scopes` unimplemented, and is missing several
resources (ingest, agents, health, model list/revoke, and finality
verify/history/upsert). The NATS events layer is already at parity.

This PRD specifies the work to bring `sgrs-client` to **feature and behavioral
parity** with `@sgrs/client-ts` so both libraries expose the same operations,
paths, headers, and error semantics. The goal is **consistency across libs**:
an engineer moving between the TS and Python SDKs should find the same resources,
the same method names (idiomatic per language), and the same request/response
shapes.

---

## 2. Background & motivation

- The framework integration guides (`docs/integrations/`) currently work around
  the Python gaps by calling `POST /api/ingest` and `GET /api/claims/...` with
  raw `httpx`. Once the SDK reaches parity, the Python guides (LangGraph,
  Pydantic AI) should use the SDK directly.
- The TS client is the de-facto reference surface. `packages/api-schema`
  (OpenAPI 3.1 + Zod) is the source of truth for request/response shapes.
- Divergent clients cause silent breakage: the current Python methods would
  `404` (wrong paths) or `401/400` (missing tenant header) against a running
  API, despite type-checking fine.

### Ground-truth references

- Live routes: `apps/api/src/app.ts` (mounts `/api/*`, tenant middleware).
- Reference client: `packages/client-ts/src/client.ts`.
- Shapes: `packages/api-schema/src/index.ts` and `packages/api-schema/openapi.json`.

---

## 3. Current state (audit)

### 3.1 Configuration & transport (`packages/client-py/src/sgrs_client/client.py`)

| Aspect | TS `@sgrs/client-ts` | Python `sgrs-client` today |
|---|---|---|
| Base URL | `baseUrl` | `base_url` — OK |
| Tenant | `tenantId` → `X-Tenant-ID` (validated) | **missing entirely** |
| API key | `apiKey` → `Authorization: Bearer` | `api_key` — OK |
| Timeout | `timeout` ms (default 30000) | `timeout` seconds (default 30) — OK |
| NATS | `nats` | `nats` — OK (parity) |
| Custom transport | `fetch` override | `verify_ssl` only |

### 3.2 HTTP methods

| Resource / op | TS path | Python method | Python path today | Status |
|---|---|---|---|---|
| scopes.list | `GET /api/scopes` | `list_scopes` | — | **raises `NotImplementedError`** |
| scopes.get | `GET /api/scopes/:id` | `get_scope` | `GET /api/v1/scopes/{id}` | **wrong path** |
| scopes.create | `POST /api/scopes` | `create_scope` | `POST /api/v1/scopes` | **wrong path** |
| scopes.update (PUT full) | `PUT /api/scopes/:id` | — | — | **missing** |
| scopes.patch (PATCH partial) | `PATCH /api/scopes/:id` | `update_scope` | `PATCH /api/v1/scopes/{id}` | **wrong path; naming mismatch** |
| scopes.delete | `DELETE /api/scopes/:id` | — | — | **missing** |
| models.list | `GET /api/models` | — | — | **missing** |
| models.connect | `POST /api/models` | `connect_model` | `POST /api/v1/models/connect` | **wrong path** |
| models.get | `GET /api/models/:handle` | `get_model` | `GET /api/v1/models/{handle}` | **wrong path** |
| models.revoke | `DELETE /api/models/:handle` | — | — | **missing** |
| finality.status | `GET /api/finality/:id` | `get_finality_status` | `GET /api/v1/finality/{id}` | **wrong path** |
| finality.upsert | `POST /api/finality/:id` | — | — | **missing** |
| finality.certificate | `GET /api/finality/:id/certificate/:round` | `get_finality_certificate` | `GET /api/v1/.../certificate/{round}` | **wrong path** |
| finality.verify | `POST /api/finality/verify` | — | — | **missing** |
| finality.history | `GET /api/finality/:id/history?limit=` | — | — | **missing** |
| agents.list | `GET /api/agents` | — | — | **missing** |
| agents.get | `GET /api/agents/:id` | — | — | **missing** |
| health.check | `GET /api/health` (no auth/tenant) | — | — | **missing** |
| ingest.document | `POST /api/ingest` | — | — | **missing** |

### 3.3 Response handling

- `_async_request` / `_sync_request` only validate `dict` bodies; list responses
  are wrapped as `{"data": data}`, which does not match list endpoints. List
  parsing must be first-class.

### 3.4 Schema models (`packages/client-py/src/sgrs_client/schema.py`)

Present: `Scope`, `ConnectModelRequest`, `ModelHandle`, `Agent`,
`FinalityStatus`, `FinalityCertificate`.

Missing (needed for parity / retriever ergonomics): `TenantId`,
`IngestDocumentRequest`, `IngestDocumentResponse`. `ScopeId` regex differs from
`api-schema` (`^[a-z0-9][a-z0-9-]*$` allows a trailing hyphen; source of truth is
`^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$`) and must be aligned.

---

## 4. Goals / non-goals

### Goals

1. Python SDK exposes the **same resource operations** as `@sgrs/client-ts`.
2. All HTTP methods hit the **correct `/api/*` paths** and send `X-Tenant-ID`.
3. **Consistent** request/response models validated against `api-schema`.
4. **Consistent error semantics**: an `ApiResponse`-style result with
   `ok`, `status`, `data`, `error` (do not change the existing shape gratuitously).
5. Async-first with sync variants, matching current Python ergonomics.
6. Docs (`packages/client-py/README.md`) and the Python integration guides
   updated to use the SDK instead of `httpx`.
7. A contract test that guards against future path/header drift.

### Non-goals

- No changes to the API server (`apps/api`) or to `@sgrs/client-ts` behavior
  (aside from optional read-resource additions — see §7 open decision).
- No change to the NATS events layer (already at parity).
- No new auth model; keep `Authorization: Bearer` + `X-Tenant-ID`.

---

## 5. Requirements

### 5.1 Configuration (`Client` / `create_client`)

- Add `tenant_id: Optional[str]` to `Client.__init__` and `create_client`.
- Validate `tenant_id` against the `TenantId` pattern (mirror the TS client,
  which throws on invalid tenant ids); raise `ValueError` with a clear message.
- Send `X-Tenant-ID: <tenant_id>` on all authenticated requests. **Do not** send
  it on `health.check`.
- Keep `api_key` → `Authorization: Bearer`. Keep `timeout` (seconds) and
  `verify_ssl`.
- Preserve the existing NATS config path unchanged.

### 5.2 API surface (target)

Implement every operation in the §3.2 TS column. Recommended design for
**cross-lib consistency**: expose resource namespaces mirroring the TS client,
while keeping Python's async/sync duality.

Preferred (namespaced, mirrors TS):

```python
client.scopes.list() / .get(id) / .create(body) / .update(id, body) / .patch(id, body) / .delete(id)
client.models.list() / .connect(req) / .get(handle) / .revoke(handle)
client.finality.status(id) / .upsert(id, body) / .certificate(id, round) / .verify(cert) / .history(id, limit=500)
client.agents.list() / .get(id)
client.health.check()
client.ingest.document(req)
```

Each resource method has an async form (primary) and a `*_sync` form (or a
`client.sync.<resource>.<op>()` mirror). **The sub-agent must choose one sync
convention and apply it uniformly.**

> Back-compat: the existing flat methods (`get_scope`, `create_scope`,
> `update_scope`, `connect_model`, `get_model`, `get_finality_status`,
> `get_finality_certificate`) are already broken (wrong paths), so they may be
> re-pointed to the correct paths and kept as thin deprecated aliases, or
> removed. Since `sgrs-client` is pre-1.0 (`0.1.0`) and pre-alpha, **removal with
> a changeset is acceptable**; if kept, mark with `DeprecationWarning`.

### 5.3 Paths & methods (authoritative)

Use exactly these (no `v1`), URL-encoding path params:

- `GET/POST /api/scopes`, `GET/PUT/PATCH/DELETE /api/scopes/{scopeId}`
- `GET/POST /api/models`, `GET/DELETE /api/models/{handle}`
- `GET/POST /api/finality/{scopeId}`, `GET /api/finality/{scopeId}/certificate/{round}`,
  `POST /api/finality/verify`, `GET /api/finality/{scopeId}/history?limit=`
- `GET /api/agents`, `GET /api/agents/{id}`
- `GET /api/health`
- `POST /api/ingest`

### 5.4 Schema models

Add/align Pydantic models to match `api-schema`:

- Add `TenantId`, `IngestDocumentRequest`, `IngestDocumentResponse`.
- Align `ScopeId` regex to the source of truth.
- Ensure `create`/`update`/`patch` bodies omit server-managed fields
  (`id`, `created_at`, `updated_at`) exactly as the TS client does.
- Export new models from `sgrs_client/__init__.py` and `__all__`.

### 5.5 Response handling & errors

- Support both object and array JSON bodies natively (typed `list[Model]`).
- Preserve the `ApiResponse(ok, status_code, data, error)` result shape and
  `ApiError(code, message, status_code, details)`.
- Map timeouts to a stable error code (mirror TS `REQUEST_TIMEOUT`) and network
  failures to `NETWORK_ERROR`/`REQUEST_ERROR` consistently.

### 5.6 Documentation

- Update `packages/client-py/README.md` to document `tenant_id`, the full
  resource surface, and health/ingest/agents examples.
- Update `docs/integrations/langgraph.md` and `docs/integrations/pydantic-ai.md`
  to use the SDK for ingest and (if §7 is accepted) claims, removing the `httpx`
  workarounds. Keep the guides' structure (retriever + swarm participant).
- Regenerate Sphinx reference (`pnpm docs:py`) if signatures change.

### 5.7 Tests

- Unit tests for each resource method (async + sync): correct method, path,
  headers (assert `X-Tenant-ID` present; absent on health), body serialization,
  and response parsing (including list endpoints).
- Tenant validation test (invalid tenant id raises).
- A **contract/drift test**: assert every path the client calls exists in
  `packages/api-schema/openapi.json` **or** in the live `apps/api` route table,
  so future path drift fails CI. (Note: today `openapi.json` documents only
  `/api/ingest` + admin/internals; see §7.)
- Keep coverage above the repo thresholds (lines/functions/statements 80%,
  branches 75%).

---

## 6. Acceptance criteria

1. Every operation in the §5.2 target surface is implemented (async + sync) and
   hits the §5.3 paths with `X-Tenant-ID` on authenticated calls.
2. `list_scopes` (and all list endpoints) return typed lists; no
   `NotImplementedError` remains.
3. Invalid `tenant_id` is rejected at construction.
4. `packages/client-py` unit tests pass; coverage thresholds met.
5. `docs/integrations/{langgraph,pydantic-ai}.md` use the SDK (no `httpx` for
   ingest; claims per §7) and still cover both the retriever and swarm-participant
   tutorials.
6. `packages/client-py/README.md` documents the full surface incl. `tenant_id`.
7. A changeset is added for `sgrs-client` (see §8) describing the change and any
   breaking removals.
8. `pnpm lint`, `pnpm test:py`, and (if applicable) `pnpm run docs:py` succeed.

---

## 7. Open decisions (resolve before/at implementation)

1. **Claims/contradictions/risks/documents/epochs read endpoints.** Neither SDK
   wraps these today; the integration docs use raw HTTP for them. For true
   cross-lib consistency, the recommendation is to add read-only helpers to
   **both** `@sgrs/client-ts` and `sgrs-client` (e.g. `client.claims.list(scopeId)`,
   `contradictions.list`, `risks.list`, `documents.list`, `epochs.latest`). This
   keeps the two libs aligned and lets the retriever guides drop raw HTTP.
   - Decision: **accept (add to both)** or **defer (SDKs stay at current TS
     surface; docs keep raw HTTP for claims)**. If accepted, this expands scope
     to `client-ts` + a changeset there too.
2. **OpenAPI coverage.** The public read routes (`/api/claims`, etc.) are not in
   `openapi.json`. If the contract test (§5.7) should cover them, the API's
   OpenAPI generation must be extended first (owner: API team) — otherwise the
   drift test validates only documented paths. Decide whether this is in scope or
   tracked separately.
3. **Sync API convention.** `*_sync` methods vs a `client.sync.*` mirror — pick
   one and apply uniformly.
4. **Back-compat.** Remove the old flat methods (clean, pre-1.0) vs keep as
   deprecated aliases. Recommendation: keep thin aliases for one minor with
   `DeprecationWarning`, given low cost.

---

## 8. Release & rollout

- Bump `sgrs-client` per Changesets (`pnpm changeset`). Given corrected paths and
  the new required-for-use `tenant_id`, treat as a **minor** for pre-1.0 (or
  document as breaking in the changeset if old methods are removed).
- No coordinated API release required (server already exposes `/api/*`).
- If §7.1 is accepted, ship the matching `@sgrs/client-ts` read helpers in the
  same PR (or a paired PR) with its own changeset so the libs stay in lockstep.

---

## 9. Out of scope

- Kernel control-plane clients in `open-governed-swarm-of-agents`
  (`@sgrs/kernel-client`, `sgrs-kernel-client`) — unrelated to the product SDK.
- Studio and API server behavior changes (beyond optional OpenAPI extension in
  §7.2, which is a separate, owned task).
