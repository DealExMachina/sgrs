# AGENTS.md

## Cursor Cloud specific instructions

SGRS is a pnpm + Turbo monorepo. The product layer is two services plus SDK/support packages. Standard commands live in `package.json` (root scripts) and `README.md` / `DEVELOPMENT.md` / `CONTRIBUTING.md`; prefer those instead of duplicating here.

### Services

| Service | Path | Dev command | Port |
|---|---|---|---|
| SGRS API (Hono + Drizzle/PGlite + DuckDB) | `apps/api` | `pnpm --filter @sgrs/api dev` | 3003 |
| SGRS Studio (Next.js) | `apps/studio` | `pnpm --filter @sgrs/studio dev` | 3001 |

Run both together from the repo root with `pnpm dev` (Turbo starts both apps plus package watchers). Studio proxies same-origin `/api/*` to the API on 3003, so both must be up for the UI to load data.

### Non-obvious startup caveats

- __`apps/api/data/` must exist before starting the API.__ `.env.local` sets `DATABASE_URL=./data/sgrs.db`, and the API dev process runs with cwd `apps/api`, so PGlite writes to `apps/api/data/sgrs.db` (not the repo-root `data/`). If that directory is missing the API dies at startup with `ENOENT ... mkdir '/workspace/apps/api/data/sgrs.db'`. Fix: `mkdir -p apps/api/data`. This directory is gitignored and persists in the VM snapshot.
- __`.env.local` needs a real `ENCRYPTION_KEY`.__ `pnpm setup` copies `.env.example`, which contains a placeholder key that fails the startup validator (`ENCRYPTION_KEY` must decode to exactly 32 bytes base64). If `.env.local` is missing or regenerated with the placeholder, set a valid key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` then put it in `.env.local`. `.env.local` is gitignored and persists in the VM snapshot.
- __Node 22 is fine.__ `.nvmrc` pins 20.19.0 but `engines` only requires `node >=20.19`; the VM's Node 22 satisfies this and all lint/test/build/run steps pass on it.

### Optional dependencies (safe to skip for product dev)

- __NATS__ (`NATS_URL`) is optional. Unset by default, so real-time SSE is disabled — the API logs `NATS_URL not set — real-time events disabled` and the Studio falls back to polling / mock demo data. This is expected, not a failure.
- __Kernel feed / full swarm stack__ (`FEED_SERVER_URL`, from the separate `open-governed-swarm-of-agents` repo) is optional; only needed for live swarm data and admin `/v1/*` proxy routes. Without it, panels show empty/mock data.

### Python SDK

`packages/client-py` (`sgrs-client`) uses `uv`. `pnpm test:py` runs `uv sync` + `pytest`. `uv` is a system tool (installed to `~/.local/bin`), not managed by `pnpm install`.

### Verified commands (all pass)

- Lint: `pnpm lint` (0 errors; a few React-hook warnings are pre-existing)
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test` (TS/vitest), `pnpm test:py` (Python/pytest)
- Build: `pnpm build`
- Run: `pnpm dev` (Studio :3001, API :3003)
