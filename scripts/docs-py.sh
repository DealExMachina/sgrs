#!/usr/bin/env bash
# Build Sphinx HTML for packages/client-py. Uses packages/client-py/.venv (created on first run) so PEP 668 systems work without extra setup.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="${ROOT}/packages/client-py"
VENV="${PKG}/.venv"
cd "${PKG}"

if [[ ! -d "${VENV}" ]]; then
  python3 -m venv "${VENV}"
fi

"${VENV}/bin/python" -m pip install -q -U pip
"${VENV}/bin/python" -m pip install -q '.[docs]'
exec "${VENV}/bin/python" -m sphinx.cmd.build -W -b html docs docs/_build/html
