#!/usr/bin/env bash
# Build Sphinx HTML for packages/client-py using uv + uv.lock.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="${ROOT}/packages/client-py"
cd "${PKG}"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

uv sync --locked --extra docs
exec uv run --extra docs python -m sphinx.cmd.build -W -b html docs docs/_build/html
