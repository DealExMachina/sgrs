# SGRS scenario app

A small, self-contained example that exercises the SGRS product API end to end:

1. Creates governance **scopes** (`client.scopes.create`)
2. Puts source **documents** into each scope (`POST /api/documents`)
3. Records the governance **outcome** — claims, risks, contradictions, and
   finality `V(t)` across convergence rounds
4. Runs a **BotHITL** review — a bot standing in for the human-in-the-loop
   reviewer that resolves open contradictions (`PATCH /api/contradictions/:id`),
   comments on the epoch summary (`POST /api/epochs/:id/comments`), and lifts the
   veto to move an escalated scope forward
5. Prints an **outcome report** per scope (documents, claims, risks, HITL
   decisions, convergence trend, verdict)

The demo shows two outcomes: one scope converges cleanly to near-final; the other
escalates on a critical contradiction (veto active) and is then unblocked and
resolved by the BotHITL reviewer.

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
