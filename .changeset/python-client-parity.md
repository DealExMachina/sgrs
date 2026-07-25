---
"sgrs-client": minor
---

## Python SDK parity with `@sgrs/client-ts`

Brings the Python `sgrs-client` HTTP layer to feature and behavioral parity with
the TypeScript client. The previous methods targeted stale `/api/v1/...` paths,
omitted the required `X-Tenant-ID` header, and left `list_scopes` unimplemented.

### Configuration

- **Added `tenant_id`** to `Client.__init__` and `create_client`. It is
  validated against the `TenantId` contract (lowercase `a-z`, `0-9`, inner
  hyphens; max 64) and raises `ValueError` when invalid. It is sent as
  `X-Tenant-ID` on every authenticated request and is **never** sent on
  `check_health()`.

### Paths & full surface

- All methods now hit the correct `/api/*` routes (no `v1`); path params are
  URL-encoded.
- `list_scopes` / `list_scopes_sync` are implemented (typed list parsing) — no
  more `NotImplementedError`.
- New methods (each with a `*_sync` variant): `patch_scope`, `delete_scope`,
  `list_models`, `revoke_model`, `upsert_finality`, `verify_finality_certificate`,
  `get_finality_history`, `list_agents`, `get_agent`, `check_health`,
  `ingest_document`, and the governance read helpers `list_claims`,
  `list_contradictions`, `list_risks`, `list_documents`, `get_latest_epoch`.

### Governance write helpers

- New create/patch methods (each with a `*_sync` variant) closing the remaining
  API-coverage gap: `create_claim`, `list_claims_by_doc` (returns a
  `dict[str, list[Claim]]` grouped by source document), `list_drifts`,
  `create_drift`, `create_contradiction`, `resolve_contradiction`,
  `create_risk`, `create_document`, `patch_document`, `list_epochs`,
  `create_epoch`, and `add_epoch_comment`.

### Schema models

- Added `TenantId`, `IngestDocumentRequest`, `IngestDocumentResponse`, `Claim`,
  `Contradiction`, `Risk`, `SgrsDocument`, `EpochSummary`, `EpochSummaryComment`
  and supporting literals; exported from the package root.
- Added the `Drift` read model (+ `DriftSeverity`), the
  `ResolveContradictionBody` and `AddEpochCommentBody` bodies, and the
  `CreateClaimBody`, `CreateDriftBody`, `CreateContradictionBody`,
  `CreateRiskBody`, `CreateDocumentBody`, `PatchDocumentBody` and
  `CreateEpochBody` request models; all exported from the package root.
- Aligned the `ScopeId` regex to the source of truth
  (`^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$`).

### Errors

- Request timeouts now map to `REQUEST_TIMEOUT` (408) and connection failures to
  `NETWORK_ERROR`, mirroring the TS client. The `ApiResponse` / `ApiError`
  shapes are unchanged.

### Breaking behavioral changes (pre-1.0)

The existing flat methods were re-pointed to the correct paths instead of being
kept as deprecated aliases (the package is pre-1.0 and the old paths were
non-functional):

- `create_scope(scope_id, name, tag, **kwargs)` — now requires `scope_id`
  (the server contract requires `id` in the body).
- `update_scope(scope_id, **fields)` — now issues `PUT` (full replace). Use the
  new `patch_scope(scope_id, **fields)` for partial `PATCH` updates (the old
  `update_scope` behavior).
