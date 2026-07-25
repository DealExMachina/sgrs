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

## Governance write helpers

Close the remaining API-coverage gaps by wrapping the create/patch governance
routes so integrations no longer need any raw `fetch` calls:

- `client.claims.create(body)` — `POST /api/claims`
- `client.claims.byDoc(scopeId)` — `GET /api/claims/:scopeId/by-doc` (returns a
  `Record<string, Claim[]>` grouped by source document)
- `client.drifts.list(scopeId)` — `GET /api/drifts/:scopeId`
- `client.drifts.create(body)` — `POST /api/drifts`
- `client.contradictions.create(body)` — `POST /api/contradictions`
- `client.contradictions.resolve(id, body)` — `PATCH /api/contradictions/:id`
- `client.risks.create(body)` — `POST /api/risks`
- `client.documents.create(body)` — `POST /api/documents`
- `client.documents.patch(id, body)` — `PATCH /api/documents/:id`
- `client.epochs.list(scopeId)` — `GET /api/epochs/:scopeId`
- `client.epochs.create(body)` — `POST /api/epochs`
- `client.epochs.addComment(id, body)` — `POST /api/epochs/:id/comments`

New request-body types (`CreateClaimBody`, `CreateDriftBody`,
`CreateContradictionBody`, `CreateRiskBody`, `CreateDocumentBody`,
`PatchDocumentBody`, `CreateEpochBody`) are exported from the package root, and
`Drift`, `DriftSeverity`, `ResolveContradictionBody`, and `AddEpochCommentBody`
are re-exported from `@sgrs/client-ts/schema`.
