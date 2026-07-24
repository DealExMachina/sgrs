# SGRS scenario app

A small, self-contained example that exercises the SGRS product API end to end:

1. Creates governance **scopes** (`client.scopes.create`)
2. Puts source **documents** into each scope (`POST /api/documents`)
3. Records the governance **outcome** — claims, risks, and finality `V(t)` across
   convergence rounds
4. Prints an **outcome report** per scope (documents, claims, risks, convergence
   trend, verdict)

The real governance kernel (the external swarm in
[open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents))
is what normally extracts claims, flags risks, and computes finality. It is not
part of this repo, so this example plays that role locally to produce a
deterministic demonstration of the product surface. The steps that stand in for
the kernel are marked `[kernel-sim]` in the output.

## Run it

Start an API server (from the repo root), pointing at a file-backed database so
migrations and the server share the same instance:

```bash
pnpm --filter '@sgrs/api^...' build            # build workspace deps once
cd apps/api
DATABASE_URL=/tmp/sgrs-demo \
ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
PORT=3003 \
pnpm exec tsx src/index.ts
```

Then, in another shell, run the scenario:

```bash
pnpm --filter @sgrs/example-scenario start
```

## Configuration

| Env var          | Default                 | Purpose                              |
| ---------------- | ----------------------- | ------------------------------------ |
| `SGRS_API_URL`   | `http://localhost:3003` | Base URL of the SGRS API             |
| `SGRS_TENANT_ID` | `acme`                  | Tenant id sent as `X-Tenant-ID`      |
| `SGRS_API_KEY`   | _(unset)_               | Bearer token, if the API enforces it |
