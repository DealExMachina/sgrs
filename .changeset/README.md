# Changesets

We use [Changesets](https://github.com/changesets/changesets) for **publishable packages** (`@sgrs/client-ts`, `@sgrs/client-nats`, `@sgrs/api-schema`, `sgrs-client` on PyPI).

## On every PR

1. Add bullets under **`[Unreleased]`** in [CHANGELOG.md](../CHANGELOG.md) (required for all user-visible changes).
2. Run `pnpm changeset` when you change a publishable package (required before npm/PyPI release).

Internal packages (`@sgrs/studio`, `@sgrs/ui`, `@sgrs/graph`) are ignored by the changeset config.

Maintainers: see [VERSIONING.md](../VERSIONING.md) and [kernel release-versioning.md](https://github.com/DealExMachina/swarm-of-governed-agents/blob/main/docs/release-versioning.md).
