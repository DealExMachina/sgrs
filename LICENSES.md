# Licensing

This monorepo uses **per-package licensing**. See each package's `LICENSE` file for the full text.

| Package | License | Rationale |
|---|---|---|
| `apps/studio` | Business Source License 1.1 | Product surface. Converts to Apache-2.0 on 2030-04-24. |
| `packages/ui` | Business Source License 1.1 | Tightly coupled to the product. Converts on 2030-04-24. |
| `packages/graph` | Business Source License 1.1 | Tightly coupled to the product. Converts on 2030-04-24. |
| `packages/api-schema` | MIT | Public API contract — implementers must be free to build against it. |
| `packages/client-ts` (`@sgrs/client`) | MIT | Public client library. Maximum adoption. |
| `packages/client-py` (`sgrs-client`) | MIT | Public client library. Maximum adoption. |
| `examples/` | MIT | Seed data for public exploration and reproduction. |

## BSL 1.1 — Additional Use Grant

For the BSL-licensed packages, the Additional Use Grant is:

> You may make production use of the Licensed Work, provided that your use does not include offering the Licensed Work to third parties as a hosted or embedded product that competes with Deal ex Machina's commercial SGRS offerings.

Non-commercial use, internal production use, evaluation, and development are all permitted.

## Change Date and License

- **Change Date:** 2030-04-24 (four years after initial publication)
- **Change License:** Apache License, Version 2.0

On the Change Date, the BSL-licensed packages automatically become available under Apache-2.0.
