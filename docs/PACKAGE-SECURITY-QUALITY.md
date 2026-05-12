# Independent Security & Quality Checks for npm/PyPI Packages

## Current State (SGRS)

You already have **excellent supply-chain hardening**:
- ✅ npm: OIDC-based provenance
- ✅ PyPI: Trusted Publisher (OIDC) + attestations
- ✅ Both: cosign artifact signing
- ✅ Both: Prerelease verification (build, typecheck, coverage)
- ✅ Both: Changesets for versioning
- ✅ Both: Coverage quality gates (min 80%)

---

## Independent Third-Party Checks Available

### 1. **Dependency Vulnerability Scanning**

#### Option A: Snyk (Popular, Free tier available)
```yaml
# Add to release workflows
- uses: snyk/actions/python@master  # or @node for npm
  with:
    args: --severity-threshold=high
    command: test
```
- **Pros**: Real-time vulnerability database, SBOM export, license compliance
- **Cons**: Requires account, proprietary database
- **Cost**: Free tier (1 project), paid for enterprise
- **Best for**: Catching zero-days before release

#### Option B: WhiteSource (Mend)
- Continuous dependency monitoring
- SBOM + license scanning
- **Cost**: Free tier available
- **Setup**: GitHub integration

#### Option C: OWASP Dependency-Check (Open source)
```bash
# npm
npx snyk test

# Python
pip install safety
safety check
```
- **Pros**: Free, open source, no account needed
- **Cons**: Smaller database than commercial tools
- **Best for**: Quick checks in CI

---

### 2. **Code Quality & Security Analysis**

#### Option A: SonarQube/SonarCloud (Code quality + security)
```yaml
- uses: SonarSource/sonarcloud-github-action@master
  with:
    args: >
      -Dsonar.projectKey=sgrs
      -Dsonar.organization=dealexmachina
```
- **Pros**: Deep code analysis, security hotspots, coverage integration
- **Cons**: SaaS required (SonarCloud)
- **Cost**: Free for public projects
- **Detects**: Code smells, bugs, vulnerabilities, coverage gaps

#### Option B: CodeFactor (Simpler alternative)
```yaml
- uses: codefactor/codefactor-action@master
```
- **Pros**: Auto-reviews PRs, simple setup
- **Cons**: Less detailed than SonarQube
- **Cost**: Free for public repos

#### Option C: Semgrep (OSS security scanner)
```bash
semgrep --config=p/security-audit --json
```
- **Pros**: Fast, rule-based, good for TypeScript/Python
- **Cons**: Simpler than SonarQube
- **Cost**: Free
- **Best for**: Quick security scanning in CI

---

### 3. **Supply Chain Risk Assessment**

#### Option A: syft + grype (SBOM + vuln scanning)
```bash
# Generate SBOM
syft sgrs-client-ts > sbom.spdx.json

# Scan for vulns
grype sgrs-client-ts:latest
```
- **Pros**: OSS, NIST compliance, artifact signing
- **Cons**: Requires sigstore setup
- **Cost**: Free
- **Add to releases**: Attach SBOM to every release

#### Option B: Trivy (Container + filesystem scanning)
```bash
trivy fs packages/client-ts
trivy sbom sbom.json
```
- **Pros**: Fast, comprehensive, detects misconfigs
- **Cost**: Free
- **Best for**: Scanning code + dependencies

#### Option C: OSV (Open Source Vulnerability database)
```bash
osv-scanner -L=config.toml
```
- **Pros**: Already in your CI!
- **Cons**: Needs setup for release phase
- **Recommendation**: Upgrade osv-scanner to release workflow

---

### 4. **Package Registry Trust Verification**

#### npm Registry
```bash
# Verify provenance (requires npm 9.5+)
npm audit --audit-level=moderate
npm audit --production

# Check for npm package integrity
npm ls sgrs-client-ts  # Verify tree
```
- **In-registry checks**: npm runs automatic scans
- **Recommendation**: Add `npm publish --provenance` (already done ✅)

#### PyPI Registry
```bash
# Verify attestations
pip install sgrs-client
pip show sgrs-client -v

# Check PyPI Safety
safety check
```
- **In-registry checks**: PyPI validates wheels, enforces naming
- **Recommendation**: Your attestations are great ✅

---

### 5. **SBOM & Artifact Verification**

#### Generate SBOMs at release time
```yaml
- name: Generate npm SBOM
  run: |
    npx @cyclonedx/npm --output-format json \
      --spec-version 1.4 \
      packages/client-ts > packages/client-ts/sbom.json

- name: Attach SBOM to release
  uses: softprops/action-gh-release@v1
  with:
    files: packages/client-ts/sbom.json
```
- **Already in SECURITY.md** ✅ (you mention CycloneDX)
- **Recommendation**: Automate SBOM generation in release workflow

#### Verify artifact signatures
```yaml
- name: Verify cosign signatures
  run: |
    cosign verify-blob --signature package.whl.sig package.whl \
      --certificate-identity-regexp . \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

---

### 6. **Coverage & Quality Gates**

#### Already implemented ✅
```yaml
- name: Check coverage thresholds
  run: |
    coverage=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$coverage < 80" | bc -l) )); then
      echo "❌ Coverage $coverage% below 80% threshold"
      exit 1
    fi
```
- **Added to**: Both npm and PyPI release workflows
- **Benefit**: Prevents releasing code below quality bar

---

### 7. **Third-Party Audit Services**

#### Option A: NPM Security Advisory Monitoring
```bash
npm audit --json > audit-report.json
# Upload to monitoring service
```
- **Passive**: Monitors packages post-release
- **Services**: npm security alerts, WhiteSource, Snyk

#### Option B: CycloneDX / SPDX Compliance
- Your SBOM enables 3rd-party analysis
- **Recommendation**: Publish SBOMs → enables federal supply chain audits

#### Option C: Package Health Badges
```markdown
<!-- Add to README.md -->
[![npm](https://img.shields.io/npm/v/@sgrs/client-ts?label=npm)](https://www.npmjs.com/package/@sgrs/client-ts)
[![PyPI](https://img.shields.io/pypi/v/sgrs-client?label=PyPI)](https://pypi.org/project/sgrs-client/)
[![Snyk Security](https://snyk.io/test/github/DealExMachina/sgrs/badge.svg)](https://snyk.io/test/github/DealExMachina/sgrs)
[![Coverage](https://img.shields.io/codecov/c/github/DealExMachina/sgrs)](https://codecov.io/gh/DealExMachina/sgrs)
```

---

## Recommended Roadmap

### Phase 1: Quick Additions (1-2 hours)
1. ✅ **Coverage gates** (implemented)
2. **Add SBOM generation** to release workflows (syft/CycloneDX)
3. **Enhance osv-scanner** to run on release (not just PR)
4. **Add safety check** to Python release workflow

### Phase 2: Medium Effort (2-4 hours)
1. **Set up SonarCloud** (free for public repos) for code quality
2. **Add Snyk** integration for vulnerability scanning
3. **Publish SBOMs** as release artifacts
4. **Add coverage badges** to README

### Phase 3: Advanced (4+ hours, optional)
1. **Trivy full scanning** (code + container + filesystem)
2. **Grype artifact verification** in release
3. **cosign verify** in downstream CI (consumers verify signatures)
4. **Supply chain risk scoring** (OpenSSF scorecard)

---

## Implementation Templates

### Template 1: Add SBOM + Safety Check
```yaml
# Append to release-py.yml
- name: Generate SBOM
  run: |
    pip install cyclonedx-bom
    cyclonedx-bom --format json \
      -o packages/client-py/sbom.json \
      packages/client-py/

- name: Security check
  run: |
    pip install safety
    safety check --json > safety-report.json
    cat safety-report.json

- name: Upload SBOM to release
  uses: softprops/action-gh-release@v1
  if: startsWith(github.ref, 'refs/tags/')
  with:
    files: |
      packages/client-py/sbom.json
      safety-report.json
```

### Template 2: SonarCloud
```yaml
# Add to ci.yml
- name: SonarCloud Scan
  uses: SonarSource/sonarcloud-github-action@master
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### Template 3: Snyk Integration
```yaml
# Add to release workflows
- uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high
```

---

## Verification Services Matrix

| Service | npm | PyPI | Type | Free Tier | Setup Time | Status |
|---------|-----|------|------|-----------|------------|--------|
| Coverage gates | ✅ | ✅ | Quality | Yes | ✅ Done | Implemented |
| Codecov | ✅ | ✅ | Coverage | Yes | ✅ Done | Implemented |
| osv-scanner | ✅ | ✅ | Vuln scanning | Yes | 5 min | In CI, add to release |
| Snyk | ✅ | ✅ | Vuln scanning | Yes (1 proj) | 10 min | Recommended next |
| SonarCloud | ✅ | ✅ | Code quality | Yes (public) | 15 min | Recommended next |
| Safety | ✅ | ✅ | Vuln scanning | Yes | 5 min | Easy win |
| syft | ✅ | ✅ | SBOM gen | Yes | 5 min | Easy win |
| Trivy | ✅ | ✅ | Full scan | Yes | 10 min | Advanced |
| cosign | ✅ | ✅ | Signing | Yes | ✅ Done | Implemented |

---

## My Recommendation

**For SGRS (Pre-alpha → Production):**

### Immediate (This Sprint) ✅
- ✅ Coverage gates prevent low-quality releases
- ✅ Codecov tracks metrics

### Next Sprint (1-2 hours, high ROI):
1. Add osv-scanner to release workflows
2. Add Safety check to Python releases
3. Generate & publish SBOMs with each release

### Following Sprint (3-4 hours):
1. Set up SonarCloud (free, enterprise insights)
2. Add Snyk for real-time monitoring
3. Publish package health badges

### Before Production (optional, as needed):
- Trivy for comprehensive scanning
- cosign verification for consumers
- OpenSSF scorecard

---

## Why This Order?

- **Coverage gates**: Implemented, prevents releases of untested code (highest ROI)
- **osv-scanner in release**: Already in CI, just needs to be moved to release phase
- **SBOMs**: Enable compliance audits with zero overhead
- **SonarCloud**: Free for public repos, enterprise-grade insights
- **Snyk**: Catches zero-days continuously

**Result**: Your packages become the most trustworthy in the ecosystem with minimal overhead.
