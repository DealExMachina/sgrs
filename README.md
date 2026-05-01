# SGRS

Orchestration kernel (Rust + TypeScript swarm, `docker compose`, feed API, agents): **[DealExMachina/open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents)** — see its [Quick start](https://github.com/DealExMachina/open-governed-swarm-of-agents#quick-start) and [deployment guide](https://github.com/DealExMachina/open-governed-swarm-of-agents/blob/main/docs/deployment.md).

This repo is the **product** layer: multi-tenant Studio, REST API, and client libraries for browsers and backends.

## Layout

| Path | Name | License | Packages |
|---|---|---|---|
| `apps/api` | SGRS REST API (Hono) | BSL 1.1 | not on npm |
| `apps/studio` | SGRS Studio (Next.js) | BSL 1.1 | not on npm |
| `packages/ui` | Design tokens + shared components | BSL 1.1 | not on npm |
| `packages/graph` | Cytoscape React wrapper + layouts | BSL 1.1 | not on npm |
| `packages/api-schema` | OpenAPI 3.1 + Zod (source of truth) | MIT | planned / workspace |
| `packages/client-ts` | TypeScript client | MIT | [`@sgrs/client-ts` on npm](https://www.npmjs.com/package/@sgrs/client-ts) |
| `packages/client-py` | Python client | MIT | [`sgrs-client` on PyPI](https://pypi.org/project/sgrs-client/) |
| `packages/docs` | Generated API + SDK reference (OpenAPI, TypeDoc) | BSL 1.1 | [GitHub Pages site](https://dealexmachina.github.io/sgrs/) (enable Pages in repo settings) |
| `examples/` | Seed scenarios + governance presets | MIT | — |

## Client libraries

Install from the registry once published (CI uses [release-ts.yml](.github/workflows/release-ts.yml) and [release-py.yml](.github/workflows/release-py.yml)):

```bash
npm install @sgrs/client-ts
```

```bash
pip install sgrs-client
```

Generated reference: run `pnpm docs` (OpenAPI + TypeDoc) and `pnpm docs:py` (Sphinx) locally, or use the [hosted docs](https://dealexmachina.github.io/sgrs/) when GitHub Pages is enabled for this repository.

## Quickstart (dev)

Prereqs: Node 20.19+, pnpm 9.15+, Python 3.11+ (for `client-py`).

```bash
pnpm install
pnpm dev   # Turbo: Studio on :3001; API uses PORT from .env.local — use 3003 to match proxies (see docs)
```

## Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) — Studio hooks, patterns, API route list
- [ROUTING_ARCHITECTURE.md](./ROUTING_ARCHITECTURE.md) — ports, env vars, proxy and SSE flows
- [PERFORMANCE_GUIDANCE.md](./PERFORMANCE_GUIDANCE.md) — client timeouts, concurrency, and performance checks
- **`pnpm docs`** — API (OpenAPI / Redoc) + SDK TypeDoc → `packages/docs/dist/` ([`packages/docs/README.md`](./packages/docs/README.md))
- **`pnpm docs:py`** — Python `sgrs-client` Sphinx site → `packages/client-py/docs/_build/html/`
- [MIGRATION.md](./MIGRATION.md) — schema and upgrade notes where applicable
- **Published reference (GitHub Pages):** [dealexmachina.github.io/sgrs](https://dealexmachina.github.io/sgrs/) — deployed from [.github/workflows/docs-pages.yml](.github/workflows/docs-pages.yml) when Pages is enabled

## Development modes

The studio has three distinct modes, chosen by persona:

- **Business** — read the current state of a scope (graph, live metrics, risks, contradictions, HITL, source documents)
- **Configure** — tune governance, finality, agents, models
- **Debug** — full kernel visibility (governance trace, events, per-dim finality)

Scopes are fully isolated: each scope has its own lifecycle, finality certificates, and events.

### Business Mode Features

**Live Metrics Counter**
A real-time metric bar above the graph displays:
- Current epoch round
- Convergence score with trend (↑ improving, ↓ declining)
- Convergence rate (δ)
- Total claims analyzed
- Open contradictions and high drifts (issues)
- Risk level

Values flash when changed, providing immediate visual feedback as the swarm progresses.

**Collapsible Document Panel**
A left-side panel provides access to source documents:
- Expandable (224px) / collapsible (36px) with smooth width animation
- Shows document type, status, claim count, confidence metrics
- Hover tooltips with document name, top claims, and ingestion details
- Document types: PDF, DOCX, XLSX, TXT, URL (color-coded)

**Live Sidebar Tabs**
Right sidebar with four tabs:
- **Facts** — continuously updated claims with confidence levels
- **Issues** — contradictions (requiring HITL resolution) and high-severity drifts
- **Summary** — epoch results with user-editable comments
- **Overview** — activity feed and risk assessment

## Security

See [SECURITY.md](./SECURITY.md). Disclose privately to security@dealexmachina.com.

## Terms (experimental)

Use of Studio, API, and clients is **at your own risk** while pre-production. See the kernel repo disclaimer: [experimental-terms.md](https://github.com/DealExMachina/open-governed-swarm-of-agents/blob/main/docs/experimental-terms.md).

## Status

Private, pre-alpha. Not for production.
