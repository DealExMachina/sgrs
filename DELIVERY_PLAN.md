# SGRS — Lib Delivery Plan

> Working document: roadmap for publishable libs and delivery hardening. **Note:** Sections below mix timeless goals with a point-in-time audit; when in doubt, verify with `pnpm typecheck`, `pnpm test`, and the packages in `packages/`.

---

## 1. Stated Objectives (from [README.md](README.md))

The repo is the **product surface** for the SGRS kernel (a separate Rust + TS orchestration repo at `DealExMachina/open-governed-swarm-of-agents`). It ships:

| Path | Name | License | Public artifact? |
|---|---|---|---|
| `apps/studio` | Next.js Studio (Business / Configure / Debug modes) | MIT | no — SaaS app |
| `apps/api` | Hono REST API server | MIT | no — runs as service |
| `packages/api-schema` | OpenAPI 3.1 + Zod (source of truth) | MIT | **later** (npm) |
| `packages/client-ts` | `@sgrs/client` for JS/TS — HTTP + optional NATS events | MIT | **yes** (npm) |
| `packages/client-py` | `sgrs-client` for Python — HTTP + optional NATS events | MIT | **yes** (PyPI) |
| `packages/client-nats` | Compat package re-exporting `@sgrs/client-ts/events` | MIT (aligned with client-ts) | optional — see §5 |
| `packages/db` | Drizzle ORM + DuckDB analytics | MIT | no — internal |
| `packages/graph` | Cytoscape React wrapper | MIT | no — internal |
| `packages/ui` | Design tokens + shared components | MIT | no — internal |
| `examples/` | 6 domain seed scenarios | MIT | docs only |

**The "deliver the libs" scope is therefore three packages**: `@sgrs/api-schema`, `@sgrs/client-ts`, `sgrs-client` (Py). Everything else is internal or deferred.

---

## 2. Implementation Assessment

### 2.1 `@sgrs/api-schema` — source of truth (MIT, will publish later)

- **Surface**: single `src/index.ts` (275 LOC). Exhaustive Zod schemas for Scope / Model / Agent / Finality / and the full governance domain (Claim, Drift, Contradiction, Risk, SgrsDocument, EpochSummary).
- **Pattern**: every name declared as both `const X = z.…` (runtime schema) and `type X = z.infer<typeof X>` — Zod's standard idiom. TS declaration-merges them so a single `export { X }` re-export carries both.
- **Status**: Zod schemas and tracked **`packages/api-schema/openapi.json`** are the contract; automate regeneration in CI/build when you tighten the pipeline (still a Phase 1 item).
- **Versioning**: package version and `zod` should stay aligned workspace-wide (`zod` 4.x in current tree — keep validator and schemas on the same major).
- **ESM**: `"type": "module"`, `exports: { ".": { types, import } }`. ESM-only ✓. But the build uses base `moduleResolution: bundler`, which is too loose for a published library — see §4.

### 2.2 `@sgrs/client-ts` — TypeScript SDK (MIT, will publish)

- **Surface** (`src/`): HTTP client (`client.ts`), NATS transport (`events/api.ts`), typed event union + Zod validators (`events/schema.ts`), subject builders (`events/subjects.ts`), schema re-exports from `@sgrs/api-schema` (`schema.ts`), public barrel (`index.ts`).
- **Subpath exports**: `.`, `./schema`, `./events` ✓.
- **NATS optional**: optional peer dependency; dynamic `import()` in `events/api.ts` keeps HTTP-only bundles lean ✓.
- **Hardening**: audited guarantees documented in source (tenant ownership, subscription cleanup, cleartext warnings, etc.).
- **Tests**: `src/__tests__/` — client, events, integration; benches may use a separate Vitest profile.
- **Quality gate**: run `pnpm typecheck` and `pnpm --filter @sgrs/client-ts test` before publish; resolve any drift between `nats` package types and `events/api.ts`.

### 2.3 `sgrs-client` Python (MIT, will publish)

- **Surface** (`src/sgrs_client/`):
  - `client.py` (402 LOC) — HTTP client (httpx, async + sync helpers).
  - `events/api.py` (655 LOC) — NATS transport (mirrors TS surface).
  - `events/schema.py` (235 LOC) — Pydantic models for events.
  - `events/subjects.py` (201 LOC) — subject builders.
  - `schema.py` (106 LOC) — Pydantic models for the REST API.
- **Tests**: 4 files (client, events, integration, performance) — same shape as TS.
- **Stated path**: README says client-py is "via openapi.json emitted from here [api-schema]". **Reality: the Python types are hand-written**, not generated. Two valid resolutions in §6 Phase 1.
- **Packaging**: `pyproject.toml` + `pytest.ini`, MIT `LICENSE`.

### 2.4 `apps/api` — REST surface (MIT, internal)

- **11 route files**, ~1,435 LOC under `src/routes/`. Endpoints (verbs collated):

  | Resource | Endpoints |
  |---|---|
  | health | `GET /api/health` |
  | scopes | `GET /` `POST /` `GET /:id` `PUT /:id` `PATCH /:id` `DELETE /:id` |
  | models | `GET /` `POST /` `GET /:handle` `DELETE /:handle` |
  | finality | `GET /:scopeId/latest` `GET /:scopeId/history` `POST /:scopeId` (upsert) |
  | agents | (read endpoints) |
  | claims | `GET /:scopeId` `POST /` `GET /:scopeId/by-doc` |
  | drifts | `GET /:scopeId` `POST /` |
  | contradictions | `GET /:scopeId` `POST /` `PATCH /:id` (HITL resolve) |
  | risks | `GET /:scopeId` `POST /` |
  | documents | `GET /:scopeId` `POST /` `PATCH /:id` |
  | epochs | `GET /:scopeId` `POST /` `POST /:id/comments` |

- **Middleware chain**: `errorHandler` → `auth` (constant-time HMAC) → `tenant` (X-Tenant-ID) → handler. `errorHandler` registered as `app.onError`. Auth fails-fast in production if `API_KEY` unset.
- **Validation**: `@hono/zod-validator` on every mutating endpoint, schemas from `@sgrs/api-schema`.
- **Audit**: mutations write to DuckDB analytics + fire-and-forget NATS publish (graceful no-op if NATS disabled).
- **Health**: pings DB with `SELECT 1`; degrades to 503 on driver error.
- **Gaps**: expand automated coverage for governance routes beyond smoke tests as you harden for production.

### 2.5 SSE / streams — `apps/studio/app/api/stream/[tenant]/route.ts` (140 LOC)

Honestly very well built. Flagging both the strengths and the few rough edges:

- Subscribes via `EventsApi.onAllScopeEvents(tenant, …)` — single NATS wildcard `sgrs.scope.{tenant}.>`, forward-compatible with new event types.
- **Disable detection**: returns `503 {code: "NATS_DISABLED"}` JSON when `NATS_URL` isn't set. Clients can short-circuit instead of reconnect-looping.
- **Eager connect**: connects to NATS *before* opening the stream so connect failures surface as 503 (not mid-stream EventSource error).
- **Keep-alive**: `: ping\n\n` SSE comment every 25s — defeats most proxy/LB idle timeouts.
- **Headers**: `text/event-stream`, `no-cache, no-transform`, `keep-alive`, `X-Accel-Buffering: no` (nginx/ALB hint). Correct.
- **Cleanup**: cancels NATS subscriptions in `cancel()` *and* on `req.signal` `abort` — covers both browser disconnect and server shutdown.
- **Defensive enqueue**: `controller.enqueue` wrapped in try/catch — quietly drops messages if controller is already closed mid-flight.
- **Runtime**: `runtime = "nodejs"`, `dynamic = "force-dynamic"` ✓.

**Rough edges worth noting:**
- One `EventsApi` instance per SSE connection. At scale that's one NATS connection per browser — fine for tens, painful for thousands. Consider pooling a single `EventsApi` per tenant in a module-level cache later.
- No backpressure: if the client is slow, events accumulate in the NATS subscription buffer, then potentially in `controller.enqueue` queue. NATS slow-consumer detection exists in `client-ts` (the `slowConsumer` status hook) but isn't wired here.
- No reconnect/last-event-id replay. `EventSource` will retry, but missed events during the gap are lost. Documented as acceptable for the current product target — flag for kernel parity later.

---

## 3. Examples Directory

`examples/` contains six real domain scenarios — not stubs:

```
examples/
  docs-clinical-trial/  evidence_schemas.yaml  finality.yaml  governance.yaml
  docs-financial/       evidence_schemas.yaml  finality.yaml  governance.yaml
  docs-green-bond/      evidence_schemas.yaml  finality.yaml  governance.yaml
  docs-horizon/         evidence_schemas.yaml  finality.yaml  governance.yaml
  docs-insurance/       evidence_schemas.yaml  finality.yaml  governance.yaml
  docs-solvency2/       evidence_schemas.yaml  finality.yaml  governance.yaml
```

These are configuration presets the kernel consumes. They're MIT-licensed and tracked, but no published artifact references them — they're documentation-as-code.

---

## 4. Strict-ESM TypeScript Posture (delivery requirement)

The user wants the TypeScript artifacts shipped strictly ESM. Current state vs target:

| Concern | Current | Target for publishable libs (api-schema, client-ts) |
|---|---|---|
| `"type": "module"` | ✅ everywhere | keep |
| `"exports"` field with `types` + `import` only | ✅ on api-schema and client-ts | keep |
| `module` | `ESNext` (base) | `NodeNext` *for libs* (or keep ESNext if only consumers via bundlers — but NodeNext is stricter and matches Node's runtime resolver) |
| `moduleResolution` | `bundler` (base) | **`NodeNext`** for the published libs. `bundler` allows extension-less relative imports that fail under pure Node ESM resolution. |
| `.js` extensions on relative imports | mostly present (e.g. `apps/api` does this) | **enforce on libs** — required by NodeNext |
| `verbatimModuleSyntax` | not set | **`true`** — enforces `import type` discipline; required for clean ESM emit and matches what Zod-style "value-and-type-same-name" exports need |
| `isolatedModules` | ✅ | keep |
| `strict` | ✅ | keep |
| `noUncheckedIndexedAccess` | ✅ | keep |
| `noImplicitOverride` | ✅ | keep |
| `exactOptionalPropertyTypes` | not set | **`true` for libs** — pairs with the optional-fields discipline already used in Zod schemas |
| `declaration` + `declarationMap` | ✅ | keep |
| `target` | `ES2022` | `ES2022` is fine; bumping to `ES2023` is ok if Node 20 minimum |

**Concrete change**: split tsconfigs into a publishable-lib variant (`tsconfig.lib.json` or per-lib override) that sets `module: NodeNext`, `moduleResolution: NodeNext`, `verbatimModuleSyntax: true`, `exactOptionalPropertyTypes: true`. Apps and internal packages can stay on the looser bundler-style base.

---

## 5. `packages/client-nats` — disposition

**Current:** `@sgrs/client-nats` is a thin **compatibility shim** that re-exports `EventsApi` and types from **`@sgrs/client-ts/events`**. Canonical implementation remains in **`@sgrs/client-ts`**.

**Options:**

- **Option A (recommended)** — Prefer `@sgrs/client-ts/events` everywhere; drop `@sgrs/client-nats` once no dependents remain.
- **Option B** — Keep the shim until external consumers migrate; avoid duplicating NATS logic in a second implementation.

Treat extra publishable artifact for NATS-only as unnecessary unless consumer demand appears.

---

## 6. Lib Delivery Plan — Phased

### Phase 0 — Foundation (must precede any publish)

Goal: green typecheck, green tests, strict-ESM lib tsconfigs, dep coherence.

1. **Coordinated dep bump** to a coherent latest-stable combo. Skip Tailwind 4, TS 6, ESLint 10 — ecosystem catch-up gaps. Bump:
   - `zod` 3.23.8 → 4.x across all workspaces (api-schema is the canonical source — fix the pin first).
   - `@hono/zod-validator` 0.4.3 → 0.7.x (zod 4 support).
   - `hono` 4.7.5 → 4.12.x; `@hono/node-server` 1.13.7 → 2.x (verify the listen API change).
   - `vitest` 1.0.4 → 4.x (and `@vitest/coverage-v8`); update `performance.bench.ts` for the new `BenchFunction` type.
   - `drizzle-orm` 0.41 → 0.45, `drizzle-kit` 0.30 → 0.31, `@electric-sql/pglite` 0.2.17 → 0.4.x, `@duckdb/node-api` 1.4.0-r.1 → 1.5.2-r.1.
   - `react`/`react-dom` 19.0 → 19.2; `@types/*` to matching latest.
   - `nats` 2.28 → 2.29; `tsx` 4.19 → 4.21; `turbo` 2.3 → 2.9.
   - `typescript` 5.7.2 → 5.9.x (latest 5.x — TS 6 deferred).

2. **Lib tsconfigs**: introduce `tsconfig.lib.json` (or per-lib overrides) for `api-schema` and `client-ts` enforcing strict ESM (§4). Add `.js` extensions to any relative imports in `client-ts/src/**` that lack them.

3. **Fix typecheck failures**:
   - `client-ts/src/schema.ts` — drop the `type Foo,` re-export lines (declaration-merging carries types through a single `export { Foo }`). *(already drafted in this session.)*
   - `client-ts/src/events/api.ts:231` — investigate `status.type` enum drift in nats v2.29 vs v2.28; replace string literal with the canonical typed value.
   - `client-ts/src/events/api.ts:579` — fix the exhaustive-switch narrowing on the governance scope event union.
   - `client-ts/src/__tests__/performance.bench.ts` — port to vitest 4 BenchFunction (drop `Promise<string>` returns; align mock fetch with the current `Response` interface) or move bench to a separate config that's excluded from `tsc`.

4. **`@hono/zod-validator` 0.7 vs current usage**: smoke-check the route handlers — the validator's middleware signature changed minimally between 0.4 and 0.7, but worth a grep.

5. **Resolve `client-nats` disposition** per §5. Prefer `@sgrs/client-ts/events` in new code; remove `@sgrs/client-nats` when no dependents remain.

### Phase 1 — Ship `@sgrs/api-schema@0.1.0` (npm, MIT)

Highest leverage: it's the upstream source of truth for the other two libs.

1. **Keep `openapi.json` authoritative** — the file ships in `packages/api-schema`. Prefer **automated generation from Zod** on each build (`build:openapi`); options include `zod-to-openapi`, `@asteasolutions/zod-to-openapi`, or a small internal generator. Fail CI on drift once the script is wired.

2. **Bake the OpenAPI document into the build pipeline**:
   - `pnpm --filter @sgrs/api-schema build` runs `tsc` *and* `build:openapi`.
   - Add a CI step in `release-ts.yml` to `pnpm build` before `changeset publish`.

3. **Pin zod 4.x as a peer dep** (recommended) so consumers control the resolution.

4. **Author the first changeset**: `pnpm changeset` with `@sgrs/api-schema: minor` + a release note. Keep it 0.1.0, not 1.0.0 — surface will iterate.

5. **Verify npm name availability**: check `@sgrs` org registration on npm (the README says yes; confirm with `npm org ls sgrs` or a test publish to dry-run).

6. **First publish** via `release-ts.yml` (already wired with OIDC provenance). Tag `release-ts-YYYYMMDD-HHMMSS`.

### Phase 2 — Ship `@sgrs/client-ts@0.1.0` (npm, MIT)

Depends on Phase 1 (api-schema published so workspace `*` can be replaced with a real version on publish).

1. **Replace `workspace:*` on `@sgrs/api-schema`** with a real semver (changeset's `pnpm publish` does this automatically with `--no-git-checks`, but verify the resulting tarball pins to `^0.1.0`).

2. **Tighten public surface**: confirm `index.ts` only re-exports the intended public API (no leaking internal `subjects.ts` helpers). The hardened `events/api.ts` is already publishable; the subpath export `./events` is the right entry.

3. **Documentation**:
   - Add a "NATS optional" section to the README explaining the dynamic import.
   - Add a "TLS-only in production" note (hardening guarantee H-2).
   - Add a tenant-isolation note covering `assertOwnedByTenant`.

4. **Bench coverage**: keep `performance.bench.ts` excluded from `tsc -p tsconfig.json` (move under `bench/` or use a separate `tsconfig.bench.json`); run via `pnpm --filter @sgrs/client-ts vitest bench`. Don't ship benches in the tarball — exclude from `files`.

5. **Author changeset** for `@sgrs/client-ts: minor` (0.1.0) + release note.

6. **Publish** via `release-ts.yml`.

### Phase 3 — Ship `sgrs-client@0.1.0` (PyPI, MIT)

Depends on Phase 1 (api-schema's `openapi.json` is the design contract).

1. **Decision**: hand-written or generated?
   - **Hand-written** (status quo): keep the current Pydantic models in sync manually. Faster to ship, brittle long-term.
   - **Generated**: regenerate `schema.py` from `openapi.json` via `datamodel-code-generator` or `openapi-python-client`. Slower to set up, near-zero drift later.

   Recommend **hand-written for v0.1, generated for v0.2**. Treat `openapi.json` as the authoritative diff target — every PR that touches `api-schema/src/index.ts` must regenerate `openapi.json` and the diff against `client-py/schema.py` is reviewed manually at v0.1.

2. **License fix** (Phase 0 already aligns LICENSE; double-check the pyproject `license` table reflects MIT).

3. **PyPI trusted publisher** — confirm `sgrs-client` project is registered on PyPI with `DealExMachina/sgrs` as a trusted publisher (configured in PyPI project settings, not the repo). `release-py.yml` is already OIDC-ready.

4. **Author changeset** for the Python package. `release-py.yml` triggers on `.changeset/**` changes — but changesets is npm-tooling. We need a small adapter: either a hand-maintained `packages/client-py/CHANGELOG.md` + version in `pyproject.toml`, or a custom script that reads changesets and bumps `pyproject.toml`. Phase 3 adds that script.

5. **Publish**, tag `release-py-YYYYMMDD-HHMMSS`.

### Phase 4 — Ongoing

- Add an "API surface diff" CI check that fails if `apps/api` route shapes drift from `api-schema` schemas.
- Add a contract test suite that spins up `apps/api` against PGlite and runs `client-ts` + `client-py` integration tests against it. The `client-ts` integration tests already exist in spirit.
- Replace `console.error` structured logs with pino/winston before any non-local API deployment.
- Replace the `"studio-user"` placeholder author/resolver IDs with session-derived user IDs (cloud-deploy blocker; not lib-delivery blocker).
- Pool `EventsApi` per tenant in the SSE route once concurrent SSE connections matter.

---

## 7. Critical Files Referenced

- [README.md](README.md) — stated objectives.
- [tsconfig.base.json](tsconfig.base.json) — the loose-ESM baseline; needs a strict-lib variant.
- [packages/api-schema/src/index.ts](packages/api-schema/src/index.ts) — Zod source of truth.
- [packages/api-schema/openapi.json](packages/api-schema/openapi.json) — OpenAPI document (keep in sync with Zod).
- [packages/api-schema/package.json](packages/api-schema/package.json) — ships `openapi.json` in the package `files` list.
- [packages/client-ts/src/schema.ts](packages/client-ts/src/schema.ts) — re-exports from api-schema.
- [packages/client-ts/src/events/api.ts](packages/client-ts/src/events/api.ts) — NATS layer; watch for `nats` major upgrades.
- [packages/client-ts/src/__tests__/performance.bench.ts](packages/client-ts/src/__tests__/performance.bench.ts) — optional bench; keep compatible with the repo Vitest version or exclude from `tsc`.
- [apps/studio/app/api/stream/[tenant]/route.ts](apps/studio/app/api/stream/[tenant]/route.ts) — well-built SSE; one-connection-per-client at scale is the only real concern.
- [apps/api/src/app.ts](apps/api/src/app.ts) — middleware wiring.
- [apps/api/src/routes/](apps/api/src/routes/) — 11 route files, governance domain mostly untested.
- [.github/workflows/release-ts.yml](.github/workflows/release-ts.yml) — OIDC + provenance ready.
- [.github/workflows/release-py.yml](.github/workflows/release-py.yml) — OIDC + cosign ready, needs PyPI trusted-publisher config.
- [.changeset/](.changeset/) — only `README.md` + `config.json`; no version-bumps staged.

---

## 8. Risks & Open Questions

1. **OpenAPI generator choice** (Phase 1) — affects how the spec evolves. Pick before starting the phase.
2. **client-py: hand-written vs generated** — locked in for v0.1; revisit at v0.2.
3. **client-nats disposition** — shim re-exports `client-ts/events`; fold imports into `@sgrs/client-ts` when practical.
4. **PyPI trusted-publisher prerequisite** — needs DealExMachina admin to register the project before `release-py.yml` will succeed.
5. **Zod 3 → 4 migration** — small but real surface change (e.g., `z.record(K, V)` arity); api-schema must be touched, not just dep bumped.
6. **`@hono/zod-validator` major drift** — 0.4 → 0.7 may have minor signature changes; verify in apps/api routes before merging the bump.
7. **Versioning policy** — start at 0.1.0 (recommended) vs 1.0.0 (signals API stability). Pre-alpha repo status argues for 0.1.x.
