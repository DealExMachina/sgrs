# How to contribute

Thanks for helping improve SGRS. This repository is the **product layer** (Studio, REST API, client libraries). The orchestration kernel lives in [open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents) — contribute kernel/runtime changes there; contribute product, API, and SDK changes here.

## Before you start

- Read [DEVELOPMENT.md](./DEVELOPMENT.md) for Studio patterns and API conventions.
- Read [ROUTING_ARCHITECTURE.md](./ROUTING_ARCHITECTURE.md) for ports, env vars, and proxy/SSE flows.
- Security issues: **do not** open a public issue. See [SECURITY.md](./SECURITY.md).

## Prerequisites

- **Node.js** 20.19+
- **pnpm** 9.15+
- **Python** 3.11+ and **[uv](https://docs.astral.sh/uv/)** (for `packages/client-py`)
- Optional: a local clone of [open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents) for integration smoke tests (CI checks it out automatically)

## Setup

```bash
git clone https://github.com/DealExMachina/sgrs.git
cd sgrs
pnpm setup    # or: bash scripts/setup-local.sh
pnpm dev
```

This copies [`.env.example`](./.env.example) → **`.env.local`** at the **repo root** (used by `apps/api` via `tsx --env-file=../../.env.local`). Adjust `PORT`, `ENCRYPTION_KEY`, and kernel URLs as needed.

Default dev ports: Studio **3001**, SGRS API **3003**. See [README.md](./README.md#quickstart-dev).

**GitHub admin setup** (public repo, Pages, branch protection) — org admin only, requires `gh auth login` with a user account:

```bash
pnpm setup:github    # or: bash scripts/github-repo-setup.sh
```

### Integration client sync tests

Some API tests compare this repo’s admin proxy with the kernel integration clients in the open repo. Locally:

```bash
git clone https://github.com/DealExMachina/open-governed-swarm-of-agents.git
export OPEN_SWARM_REPO="$PWD/open-governed-swarm-of-agents"
pnpm test
```

## Branching and pull requests

1. Fork the repository (or branch from `dev` if you are a maintainer).
2. Create a feature branch from `dev` (e.g. `feat/my-change`).
3. Open a pull request targeting **`dev`** (or **`main`** for release/hotfix workflows agreed with maintainers).
4. Ensure CI is green before requesting review.

`main` and `dev` are protected: changes land via pull request with required status checks.

## Checks to run locally

Run these before pushing:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:py          # Python client
pnpm run docs         # OpenAPI + TypeDoc (if you touched API schema or TS client)
pnpm format:check     # or pnpm format to fix
```

For coverage locally: `pnpm test:coverage`.

## What to change where

| Area | Path | Notes |
|------|------|--------|
| REST API | `apps/api` | Hono routes; keep OpenAPI in sync via `packages/api-schema` |
| Studio UI | `apps/studio` | Next.js app |
| API contract | `packages/api-schema` | Source of truth (OpenAPI + Zod) |
| TypeScript SDK | `packages/client-ts` | Published as `@sgrs/client-ts` |
| Python SDK | `packages/client-py` | Published as `sgrs-client`; update `uv.lock` when deps change |
| Shared UI | `packages/ui`, `packages/graph` | Reused by Studio |
| Docs site | `packages/docs` | Generated; run `pnpm docs` |

If you change **control-plane routes** (`/v1/*`) exposed via the admin proxy, keep them aligned with [open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents) (`@sgrs/kernel-client`, `sgrs-kernel-client`). The smoke tests in `apps/api/src/__tests__/client-sync*.smoke.test.ts` enforce this.

## Published packages and changesets

npm and PyPI releases use [Changesets](https://github.com/changesets/changesets). When your PR changes a published package (`client-ts`, `client-py`, `api-schema`), add a changeset:

```bash
pnpm changeset
```

Follow the prompts (patch/minor/major + summary). Maintainers run versioning and release workflows on merge to `main`.

## Code style

- Match existing patterns in the package you edit.
- TypeScript: strict types; avoid drive-by refactors.
- Format with Prettier (`pnpm format`).
- Prefer focused PRs: one logical change per pull request.

## License

By contributing, you agree that your contributions are licensed under the same terms as the project ([MIT](./LICENSE)).
