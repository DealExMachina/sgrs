# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** Email [security@dealexmachina.com](mailto:security@dealexmachina.com) with:

- A description of the issue
- Steps to reproduce (or a proof of concept)
- The affected package(s) and version(s)
- Your preferred disclosure timeline

You will receive an acknowledgement within 48h.

## Supply-Chain Controls

This repository is hardened against supply-chain attacks:

### Publishing
- All releases are published via GitHub Actions OIDC. No long-lived registry tokens exist.
- npm packages are published with [`--provenance`](https://docs.npmjs.com/generating-provenance-statements); the published signature is verifiable from the registry.
- PyPI packages are published with [Trusted Publishing + attestations](https://docs.pypi.org/trusted-publishers/).
- Each release ships a [CycloneDX](https://cyclonedx.org/) SBOM.
- Artifacts are signed with [cosign](https://docs.sigstore.dev/) keyless (OIDC-bound).

### Dependencies
- Lockfiles are committed. CI runs `pnpm install --frozen-lockfile`.
- `osv-scanner` runs on every PR. Releases are blocked on HIGH/CRITICAL findings.
- Dependabot opens PRs for all direct dependencies. Critical deps require manual approval.
- The `packages/client-ts` library has **zero runtime dependencies** beyond `zod` (peer).
- The `packages/client-py` library has two runtime dependencies: `httpx` and `pydantic`.

### Build
- All CI jobs run with `permissions: contents: read` by default. Write permissions are scoped per-job.
- Release jobs are isolated — publishing a TS package does not have access to the Python OIDC, and vice versa.
- Default branch protection: signed commits, 2 reviewers, linear history, no force pushes.
- `SOURCE_DATE_EPOCH` is pinned for reproducibility.

### Runtime
- No `eval`, no dynamic `import()` from user input.
- All HTTP clients have default timeouts and max body sizes.
- Finality certificates are Ed25519-signed; clients verify signatures locally.
- Model API keys never leave the backend — the UI only ever sees opaque `model_handle` identifiers.

## Supported Versions

Pre-alpha — no versions are supported for production use yet. The `main` branch is the only source of truth.
