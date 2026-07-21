#!/usr/bin/env bash
# One-time GitHub org-admin setup: public visibility, Pages (Actions), branch rules.
# Requires: gh CLI logged in as a *user* with admin on the repo (not a CI/integration token).
#
# Usage:
#   bash scripts/github-repo-setup.sh
#   pnpm setup:github
#
# Optional env:
#   REPO=DealExMachina/sgrs   target repository
#   SKIP_PAGES=1              skip GitHub Pages configuration
#   SKIP_RULESET=1            skip branch protection ruleset
set -euo pipefail

REPO="${REPO:-DealExMachina/sgrs}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESET_JSON="${SCRIPT_DIR}/github-branch-ruleset.json"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_gh_user() {
  if ! command -v gh >/dev/null 2>&1; then
    die "Install GitHub CLI: https://cli.github.com/"
  fi
  if ! gh auth status -h github.com >/dev/null 2>&1; then
    die "Not logged in. Run: gh auth login"
  fi
  if ! gh api user --jq .login >/dev/null 2>&1; then
    die "gh is not using a user token (integration/CI tokens cannot run this script).
Re-authenticate with an org admin account:
  gh auth login -h github.com"
  fi
  echo "    gh user: $(gh api user --jq .login)"
}

pages_configured() {
  gh api "repos/${REPO}/pages" --silent >/dev/null 2>&1
}

configure_pages() {
  echo "==> Enabling GitHub Pages (deploy via GitHub Actions)..."
  if pages_configured; then
    gh api "repos/${REPO}/pages" -X PUT -f build_type=workflow >/dev/null \
      || die "Failed to update Pages (need admin on ${REPO})."
  else
    gh api "repos/${REPO}/pages" -X POST -f build_type=workflow >/dev/null \
      || die "Failed to enable Pages (need admin on ${REPO})."
  fi
  echo "    Pages build_type=workflow"
}

configure_ruleset() {
  echo "==> Configuring branch ruleset (main + dev)..."
  [[ -f "${RULESET_JSON}" ]] || die "Missing ${RULESET_JSON}"

  existing_ruleset_id="$(
    gh api "repos/${REPO}/rulesets" --jq \
      '.[] | select(.name == "Protect main and dev") | .id' 2>/dev/null | head -1 || true
  )"

  if [[ -n "${existing_ruleset_id}" ]]; then
    echo "    Updating ruleset id=${existing_ruleset_id}..."
    gh api "repos/${REPO}/rulesets/${existing_ruleset_id}" -X PUT \
      --input "${RULESET_JSON}" >/dev/null \
      || die "Failed to update ruleset (need admin + rulesets permission on ${REPO})."
  else
    echo "    Creating ruleset..."
    gh api "repos/${REPO}/rulesets" -X POST \
      --input "${RULESET_JSON}" >/dev/null \
      || die "Failed to create ruleset (need admin on ${REPO})."
  fi
}

echo "==> Repository: ${REPO}"
require_gh_user

visibility="$(gh api "repos/${REPO}" --jq .visibility)"
echo "    Current visibility: ${visibility}"

if [[ "${visibility}" != "public" ]]; then
  echo "==> Making repository public..."
  gh repo edit "${REPO}" \
    --visibility public \
    --accept-visibility-change-consequences \
    || die "Failed to change visibility (need admin on ${REPO})."
else
  echo "==> Repository already public."
fi

if [[ "${SKIP_PAGES:-0}" != "1" ]]; then
  configure_pages
else
  echo "==> Skipping Pages (SKIP_PAGES=1)."
fi

if [[ "${SKIP_RULESET:-0}" != "1" ]]; then
  configure_ruleset
else
  echo "==> Skipping ruleset (SKIP_RULESET=1)."
fi

echo "==> Done."
echo "    - Repo: https://github.com/${REPO}"
echo "    - Pages: https://github.com/${REPO}/settings/pages"
echo "    - Deploy docs: gh workflow run docs-pages.yml --repo ${REPO}"
