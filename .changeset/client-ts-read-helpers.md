---
"@sgrs/client-ts": minor
---

## Governance read helpers

Add read-only helpers for the public governance domain routes so the TypeScript
and Python SDKs stay in lockstep and framework integration guides can drop raw
`fetch`/`httpx` calls:

- `client.claims.list(scopeId)` — `GET /api/claims/:scopeId`
- `client.contradictions.list(scopeId)` — `GET /api/contradictions/:scopeId`
- `client.risks.list(scopeId)` — `GET /api/risks/:scopeId`
- `client.documents.list(scopeId)` — `GET /api/documents/:scopeId`
- `client.epochs.latest(scopeId)` — `GET /api/epochs/:scopeId/latest`

Also re-exports the corresponding `@sgrs/api-schema` types (`Claim`,
`Contradiction`, `Risk`, `SgrsDocument`, `EpochSummary`, and supporting enums)
from `@sgrs/client-ts/schema`.
