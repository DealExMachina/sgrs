#!/usr/bin/env bash
# Local developer setup: deps, .env.local, data dirs.
# Usage: bash scripts/setup-local.sh   (or: pnpm setup)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    echo "  $2" >&2
    exit 1
  fi
}

echo "==> SGRS local setup (${ROOT})"

require_cmd node "Install Node.js 20.19+: https://nodejs.org/"
node <<'NODE'
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`Node 20.19+ required (found ${process.version})`);
  process.exit(1);
}
NODE

require_cmd pnpm "Enable pnpm: corepack enable && corepack prepare pnpm@9.15.0 --activate"

echo "==> Installing dependencies (pnpm install)..."
pnpm install

if [[ ! -f "${ROOT}/.env.local" ]]; then
  echo "==> Creating .env.local from .env.example..."
  cp "${ROOT}/.env.example" "${ROOT}/.env.local"
  echo "    Edit ${ROOT}/.env.local (ENCRYPTION_KEY, API keys, kernel URLs)."
else
  echo "==> .env.local already exists (skipped)."
fi

mkdir -p "${ROOT}/data"
echo "==> Ensured data/ directory exists."

OPEN_SWARM_DIR="${OPEN_SWARM_REPO:-${ROOT}/open-governed-swarm-of-agents}"
if [[ -f "${OPEN_SWARM_DIR}/packages/sgrs-client/src/index.ts" ]]; then
  echo "==> Open-swarm checkout found at ${OPEN_SWARM_DIR}"
  echo "    Align kernel client semver: pnpm align:open-swarm"
else
  echo "==> Optional (integration smoke tests):"
  echo "    git clone https://github.com/DealExMachina/open-governed-swarm-of-agents.git"
  echo "    export OPEN_SWARM_REPO=\"\$PWD/open-governed-swarm-of-agents\""
fi

echo ""
echo "==> Done. Next steps:"
echo "    pnpm dev          # Studio :3001, API :3003 (from .env.local)"
echo "    pnpm test         # all workspace tests"
echo "    pnpm test:py      # Python client tests"
