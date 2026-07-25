#!/usr/bin/env bash
# Align @sgrs/kernel-client version with sgrs-kernel-client in an open-governed-swarm-of-agents checkout
# (open repo policy: both packages share the same MAJOR.MINOR.PATCH).
set -euo pipefail

OPEN_SWARM_DIR="${1:-${OPEN_SWARM_REPO:-}}"
if [[ -z "${OPEN_SWARM_DIR}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  OPEN_SWARM_DIR="${ROOT}/../open-governed-swarm-of-agents"
fi

TS_PKG="${OPEN_SWARM_DIR}/packages/sgrs-client/package.json"
PY_PROJECT="${OPEN_SWARM_DIR}/packages/sgrs-client-py/pyproject.toml"

if [[ ! -f "${TS_PKG}" || ! -f "${PY_PROJECT}" ]]; then
  echo "error: open-swarm checkout not found at ${OPEN_SWARM_DIR}" >&2
  exit 1
fi

TS_VER="$(node -p "require('${TS_PKG}').version")"
PY_VER="$(grep '^version' "${PY_PROJECT}" | head -1 | sed 's/.*"\(.*\)".*/\1/')"

if [[ "${TS_VER}" == "${PY_VER}" ]]; then
  echo "==> kernel clients already aligned at ${TS_VER}"
  exit 0
fi

node -e "
  const fs = require('fs');
  const pkgPath = process.argv[1];
  const target = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = target;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
" "${TS_PKG}" "${PY_VER}"

echo "==> aligned @sgrs/kernel-client ${TS_VER} -> ${PY_VER} (matches sgrs-kernel-client)"
