# Changelog

All notable changes to the SGRS **product** monorepo are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/) — see [VERSIONING.md](VERSIONING.md) and the kernel policy in [release-versioning.md](https://github.com/DealExMachina/swarm-of-governed-agents/blob/main/docs/release-versioning.md).

## [Unreleased]

### Added

- (none)

---

## [0.2.0] — 2026-07-25

### Added

- **`examples/scenario-app`** — end-to-end demo against the product API (scopes, documents, claims, risks, finality); `[kernel-sim]` when feed server is offline; [FINDINGS.md](examples/scenario-app/FINDINGS.md) records API/SDK gaps.
- **Provenance & traceability:** `documents.provenance`, `claims.document_id`, `risks.document_id`; migration `packages/db/drizzle/0002_governance_provenance.sql`; api-schema + route updates.
- MIT LICENSE files for `apps/api`, `packages/db`, `packages/docs`, `packages/client-nats`.

### Fixed

- **`@sgrs/client-ts` `scopes.create`:** `id` is required in the request body (matches server `CreateScopeBody`).
- **Finality API:** round `per_dimension` scores to six decimal places on upsert and GET (eliminates float echo noise).

### Changed

- `pnpm align:open-swarm` script path defaults to sibling `open-governed-swarm-of-agents` checkout.
- Integration pin: kernel client **0.1.1** ([integration/open-swarm-compat.json](integration/open-swarm-compat.json)).

### Compatibility

- Validated against kernel [swarm-of-governed-agents **0.3.0**](https://github.com/DealExMachina/swarm-of-governed-agents/blob/main/CHANGELOG.md#030---2026-07-25).

---

## [0.1.0] — 2026-04-30

### Added

- Governance domain: claims, drifts, contradictions, risks, documents, epoch summaries, finality tracking.
- Business Mode UX: ScopeCounter, LeftDocsPanel, SSE integration (14 event types).
- API routes, Drizzle schema, Studio hooks, 16 integration tests.

### Breaking Changes

None — additive release.

---

[Unreleased]: https://github.com/DealExMachina/sgrs/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/DealExMachina/sgrs/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/DealExMachina/sgrs/releases/tag/v0.1.0
