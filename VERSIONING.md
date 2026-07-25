# Release versioning (SGRS product)

This repo is the **product layer** (API, Studio, SDKs). The governance kernel is [swarm-of-governed-agents](https://github.com/DealExMachina/swarm-of-governed-agents).

**Canonical cross-repo policy:** [kernel docs/release-versioning.md](https://github.com/DealExMachina/swarm-of-governed-agents/blob/main/docs/release-versioning.md)

---

## This repo

| Artifact | Location |
|---|---|
| Monorepo version | root `package.json` |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Publishable packages | `@sgrs/api-schema`, `@sgrs/client-ts`, `@sgrs/client-nats`, `sgrs-client` (PyPI) |
| Kernel integration pin | [integration/open-swarm-compat.json](integration/open-swarm-compat.json) |

---

## PR authors

1. User-visible change → bullet under **`[Unreleased]`** in [CHANGELOG.md](CHANGELOG.md).
2. Touch a **publishable package** → also run `pnpm changeset` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Maintainers (release cut)

1. Merge pending changesets or finalize CHANGELOG section for the target version.
2. `pnpm changeset version` (when publishing npm/PyPI) **or** manual bump of root + package `version` fields.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. `pnpm release` when publishing packages to npm/PyPI.
6. If kernel client semver changed upstream, run `pnpm align:open-swarm` and update `integration/open-swarm-compat.json`.

---

## Current compatibility (2026-07-25)

| sgrs | Kernel swarm | `@sgrs/kernel-client` |
|---|---|---|
| **0.2.0** | **0.3.0** | **0.1.1** |
