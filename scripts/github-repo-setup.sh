#!/usr/bin/env bash
# One-time org-admin setup: public visibility, GitHub Pages (Actions), branch rules.
# Requires: gh CLI authenticated as a user with admin on DealExMachina/sgrs.
set -euo pipefail

REPO="${REPO:-DealExMachina/sgrs}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET_JSON="${SCRIPT_DIR}/github-branch-ruleset.json"

echo "==> Repository: ${REPO}"

visibility="$(gh api "repos/${REPO}" --jq .visibility)"
echo "    Current visibility: ${visibility}"

if [[ "${visibility}" != "public" ]]; then
  echo "==> Making repository public..."
  gh repo edit "${REPO}" \
    --visibility public \
    --accept-visibility-change-consequences
else
  echo "==> Repository already public."
fi

echo "==> Enabling GitHub Pages (deploy via GitHub Actions)..."
if gh api "repos/${REPO}/pages" --jq .status 2>/dev/null; then
  gh api "repos/${REPO}/pages" -X PUT \
    -f build_type=workflow \
    >/dev/null
else
  gh api "repos/${REPO}/pages" -X POST \
    -f build_type=workflow \
    >/dev/null
fi
echo "    Pages build_type=workflow"

existing_ruleset_id="$(
  gh api "repos/${REPO}/rulesets" --jq \
    '.[] | select(.name == "Protect main and dev") | .id' 2>/dev/null | head -1 || true
)"

if [[ -n "${existing_ruleset_id}" ]]; then
  echo "==> Updating branch ruleset (id=${existing_ruleset_id})..."
  gh api "repos/${REPO}/rulesets/${existing_ruleset_id}" -X PUT \
    --input "${RULESET_JSON}" >/dev/null
else
  echo "==> Creating branch ruleset for main and dev..."
  gh api "repos/${REPO}/rulesets" -X POST \
    --input "${RULESET_JSON}" >/dev/null
fi

echo "==> Done."
echo "    - Public repo: https://github.com/${REPO}"
echo "    - Pages settings: https://github.com/${REPO}/settings/pages"
echo "    - Re-run docs deploy: gh workflow run docs-pages.yml --repo ${REPO}"
