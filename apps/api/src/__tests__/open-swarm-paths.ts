import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Monorepo root (`apps/api/src/__tests__` → four levels up). */
export const SGRS_REPO_ROOT = join(__dirname, "../../../..");

/**
 * Local checkout of https://github.com/DealExMachina/open-governed-swarm-of-agents
 * (integration clients: @sgrs/kernel-client, sgrs-kernel-client).
 * CI clones to `open-governed-swarm-of-agents/` at repo root; override with OPEN_SWARM_REPO.
 */
export const OPEN_SWARM_REPO =
  process.env.OPEN_SWARM_REPO ??
  join(SGRS_REPO_ROOT, "open-governed-swarm-of-agents");

export const OPEN_SWARM_TS_CLIENT = join(
  OPEN_SWARM_REPO,
  "packages/sgrs-client/src/index.ts",
);

export const OPEN_SWARM_PY_CLIENT = join(
  OPEN_SWARM_REPO,
  "packages/sgrs-client-py/src/sgrs_client/__init__.py",
);

export const SGRS_ADMIN_ROUTER = join(
  SGRS_REPO_ROOT,
  "apps/api/src/routes/admin/index.ts",
);

export const hasOpenSwarmTsClient = existsSync(OPEN_SWARM_TS_CLIENT);

export const hasOpenSwarmSyncFixtures =
  existsSync(OPEN_SWARM_TS_CLIENT) &&
  existsSync(OPEN_SWARM_PY_CLIENT) &&
  existsSync(SGRS_ADMIN_ROUTER);
