# SGRS

Product surface for the [Swarm of Governed Agents](https://github.com/DealExMachina/open-governed-swarm-of-agents) (SGRS) kernel — a governed agent swarm you can operate from a browser, via REST API, or from TypeScript and Python.

The kernel (Rust + TypeScript orchestration) lives in the companion repo. This repo is the product layer on top: a multi-tenant SaaS studio, a stable public REST API, and two hardened client libraries.

## Layout

| Path | Name | License | Published |
|---|---|---|---|
| `apps/studio` | SGRS Studio (Next.js) | BSL 1.1 | no |
| `packages/ui` | Design tokens + shared components | BSL 1.1 | no |
| `packages/graph` | Cytoscape React wrapper + layouts | BSL 1.1 | no |
| `packages/api-schema` | OpenAPI 3.1 + Zod (source of truth) | MIT | later |
| `packages/client-ts` | `@sgrs/client` for JS/TS | MIT | yes |
| `packages/client-py` | `sgrs-client` for Python | MIT | yes |
| `examples/` | Seed scenarios + governance presets | MIT | no |

## Quickstart (dev)

Prereqs: Node 20.18+, pnpm 9.15+, Python 3.11+ (for `client-py`).

```bash
pnpm install
pnpm dev                # starts apps/studio on :3000
```

## Development modes

The studio has three distinct modes, chosen by persona:

- **Business** — read the current state of a scope (graph, risks, contradictions, HITL)
- **Configure** — tune governance, finality, agents, models
- **Debug** — full kernel visibility (governance trace, events, per-dim finality)

Scopes are fully isolated: each scope has its own lifecycle, finality certificates, and events.

## Security

See [SECURITY.md](./SECURITY.md). Disclose privately to security@dealexmachina.com.

## Status

Private, pre-alpha. Not for production.
