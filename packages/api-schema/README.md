# @sgrs/api-schema

Zod schemas and OpenAPI 3.1 spec for the SGRS REST API.

This package is the canonical contract for:
- public tenant routes (`/api/*`)
- admin routes (`/admin/*`)
- internals routes (`/internals/*`, marked with `x-internal: true` in OpenAPI)

Product SDKs in the `sgrs` repository (`@sgrs/client-ts` and `sgrs-client`) should
align with this contract.

Static HTML for the OpenAPI document (Redoc) plus TypeDoc for the TS client is produced by **`pnpm docs`** in the repo root (package `@sgrs/docs`).

## License

MIT — see `LICENSE`.
