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
#   BYPASS_USER=jeanbapt      GitHub user login allowed to bypass rules (default: current gh user)
#   BYPASS_APPS=cursor,claude comma-separated GitHub App slugs with bypass (default: cursor,claude)
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
  command -v jq >/dev/null 2>&1 || die "jq is required to build the ruleset payload."

  local gh_login gh_user_id bypass_apps ruleset_payload tmp_ruleset slug app_id
  gh_login="$(gh api user --jq .login)"
  gh_user_id="$(gh api user --jq .id)"
  bypass_apps="${BYPASS_APPS:-cursor,claude}"

  echo "    Bypass user: ${gh_login} (id=${gh_user_id})"
  echo "    Bypass apps: ${bypass_apps}"

  tmp_ruleset="$(mktemp)"
  jq --argjson user_id "${gh_user_id}" \
    '.bypass_actors = [{actor_id: $user_id, actor_type: "User", bypass_mode: "always"}]' \
    "${RULESET_JSON}" > "${tmp_ruleset}"

  IFS=',' read -r -a app_slugs <<< "${bypass_apps}"
  for slug in "${app_slugs[@]}"; do
    slug="$(echo "${slug}" | xargs)"
    [[ -n "${slug}" ]] || continue
    app_id="$(gh api "apps/${slug}" --jq .id 2>/dev/null || true)"
    if [[ -z "${app_id}" ]]; then
      echo "    WARN: could not resolve GitHub App slug '${slug}' (skipping bypass)" >&2
      continue
    fi
    echo "    Bypass app: ${slug} (id=${app_id})"
    jq --argjson app_id "${app_id}" \
      '.bypass_actors += [{actor_id: $app_id, actor_type: "Integration", bypass_mode: "always"}]' \
      "${tmp_ruleset}" > "${tmp_ruleset}.next"
    mv "${tmp_ruleset}.next" "${tmp_ruleset}"
  done

  existing_ruleset_id="$(
    gh api "repos/${REPO}/rulesets" --jq \
      '.[] | select(.name == "Protect main and dev") | .id' 2>/dev/null | head -1 || true
  )"

  if [[ -n "${existing_ruleset_id}" ]]; then
    echo "    Updating ruleset id=${existing_ruleset_id}..."
    gh api "repos/${REPO}/rulesets/${existing_ruleset_id}" -X PUT \
      --input "${tmp_ruleset}" >/dev/null \
      || die "Failed to update ruleset (need admin + rulesets permission on ${REPO})."
  else
    echo "    Creating ruleset..."
    gh api "repos/${REPO}/rulesets" -X POST \
      --input "${tmp_ruleset}" >/dev/null \
      || die "Failed to create ruleset (need admin on ${REPO})."
  fi
  rm -f "${tmp_ruleset}"
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
