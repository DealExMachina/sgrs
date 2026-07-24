# Scenario findings

Issues surfaced by running the end-to-end scenario (`run.ts`) against the SGRS
product API. This is the point of the exercise: exercise the product surface,
then fix — or at least record — every discrepancy found.

## 1. SDK `scopes.create` omitted the server-required `id` — FIXED

- Symptom: `client.scopes.create` typed its body as
  `Omit<Scope, "id" | "created_at" | "updated_at">`, and the JSDoc claimed "the
  server assigns the id". The server (`POST /api/scopes`, `CreateScopeBody`)
  actually **requires** `id`. Calling the SDK as typed produces a `400`
  validation error at runtime, and passing `id` fails to type-check.
- Fix: `scopes.create` now takes `Omit<Scope, "created_at" | "updated_at">`
  (i.e. `id` is required), matching the server contract. JSDoc updated. SDK
  tests (`client.test.ts`, `integration.test.ts`, `performance.bench.ts`) updated
  to pass an `id`.
- Files: `packages/client-ts/src/client.ts`, `packages/client-ts/src/__tests__/*`.

## 2. No document provenance / traceability link — FIXED

- Symptom: documents carried only a random UUID and a display `name`; claims and
  risks referenced their origin only through a free-text `source` string. There
  was no stable provenance identifier and no durable link from a claim/risk back
  to the exact document row it came from. Traceability relied on string-matching
  `claim.source` to `document.name`, which is fragile (renames, duplicate names).
- Fix (product-layer, additive + backward compatible):
  - `documents.provenance` (nullable) — a stable provenance reference: content
    hash, source URI, or external id (e.g. `sha256:…`, `s3://…`, `https://…`).
  - `claims.document_id` and `risks.document_id` (nullable) — link each claim /
    risk to the originating `documents.id`.
  - Threaded through `@sgrs/api-schema` (`SgrsDocument`, `Claim`, `Risk`) and the
    `documents` / `claims` / `risks` routes.
  - New migration `packages/db/drizzle/0002_governance_provenance.sql`.
- The scenario now sets `provenance` on every document, stamps `document_id` on
  every claim and risk, and its report runs a traceability audit
  (`claims/risks linked to a source document: N/N`).
- Files: `packages/db/src/schema.ts`, `packages/db/drizzle/0002_*.sql`,
  `packages/api-schema/src/index.ts`, `apps/api/src/routes/{documents,claims,risks}.ts`.

## 3. `/api/ingest` requires the external kernel feed server — RECORDED

- `POST /api/ingest` proxies to the swarm feed server (`FEED_SERVER_URL`, default
  `:3002`), which lives in the external kernel repo
  (`open-governed-swarm-of-agents`) and is not part of this product repo. With no
  feed server running, ingest fails. The scenario therefore uses the product-side
  document/claim/risk/finality routes directly and simulates the kernel's output
  (`[kernel-sim]` in the log). Not a product bug — recorded so the demo's scope is
  explicit.

## 4. Finality `per_dimension` floating-point noise — RECORDED (not fixed)

- Upserting finality with computed per-dimension values echoes raw floats such as
  `0.49999999999999994`. Cosmetic; consider rounding to a fixed precision at the
  API boundary or in the client display. Left as-is to avoid changing numeric
  semantics.
