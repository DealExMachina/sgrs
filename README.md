# SGRS

Orchestration kernel (Rust + TypeScript swarm, `docker compose`, feed API, agents): **[DealExMachina/open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents)** — see its [Quick start](https://github.com/DealExMachina/open-governed-swarm-of-agents#quick-start) and [deployment guide](https://github.com/DealExMachina/open-governed-swarm-of-agents/blob/main/docs/deployment.md).

This repo is the **product** layer: multi-tenant Studio, REST API, and client libraries for browsers and backends. **Licensed under [MIT](./LICENSE)** — distinct from the research kernel’s terms (see [Licensing](#licensing) below).

## Layout

| Path | Name | License | Packages |
|---|---|---|---|
| `apps/api` | SGRS REST API (Hono) | MIT | not on npm |
| `apps/studio` | SGRS Studio (Next.js) | MIT | not on npm |
| `packages/ui` | Design tokens + shared components | MIT | not on npm |
| `packages/graph` | Cytoscape React wrapper + layouts | MIT | not on npm |
| `packages/api-schema` | OpenAPI 3.1 + Zod (source of truth) | MIT | planned / workspace |
| `packages/client-ts` | TypeScript client | MIT | [`@sgrs/client-ts` on npm](https://www.npmjs.com/package/@sgrs/client-ts) |
| `packages/client-py` | Python client | MIT | [`sgrs-client` on PyPI](https://pypi.org/project/sgrs-client/) |
| `packages/docs` | Generated API + SDK reference (OpenAPI, TypeDoc) | MIT | [GitHub Pages site](https://dealexmachina.github.io/sgrs/) |
| `examples/` | Seed scenarios + governance presets | MIT | — |

## Client libraries

Install from the registry once published (CI uses [release-ts.yml](.github/workflows/release-ts.yml) and [release-py.yml](.github/workflows/release-py.yml)):

```bash
npm install @sgrs/client-ts
```

```bash
pip install sgrs-client
```

Generated reference: run `pnpm docs` (OpenAPI + TypeDoc) and `pnpm docs:py` (Sphinx) locally, or use the [hosted docs](https://dealexmachina.github.io/sgrs/).

## Quickstart (dev)

Prereqs: Node 20.19+, pnpm 9.15+, Python 3.11+ (for `client-py`).

**Ports:** Studio **3001**; SGRS API **3003**; kernel demo UI **3005**; kernel resolution MCP **3006**. See [ROUTING_ARCHITECTURE.md](./ROUTING_ARCHITECTURE.md). SDK `baseUrl`: `http://localhost:3003`. Port **3000** is OpenFGA in the full swarm stack, not the product API.

```bash
git clone https://github.com/DealExMachina/sgrs.git
cd sgrs
pnpm setup    # install deps + create .env.local from .env.example
pnpm dev      # Turbo: Studio :3001; API uses PORT from .env.local (default 3003)
```

## Framework integrations

Plug SGRS into an existing agent framework. Each guide has a short tutorial for using SGRS **as a governed retriever** (vetted claims as grounding context) and **as a participant in the swarm** (an external worker that contributes claims and honors the governance veto):

| Framework | Language | Guide |
|---|---|---|
| LangGraph | Python | [docs/integrations/langgraph.md](./docs/integrations/langgraph.md) |
| Pydantic AI | Python | [docs/integrations/pydantic-ai.md](./docs/integrations/pydantic-ai.md) |
| Mastra | TypeScript | [docs/integrations/mastra.md](./docs/integrations/mastra.md) |
| Agentica | TypeScript | [docs/integrations/agentica.md](./docs/integrations/agentica.md) |

Start with the [integrations overview](./docs/integrations/README.md) for shared concepts, the endpoint reference, and governance rules every integration should follow.

## Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute (setup, PR flow, checks)
- [docs/integrations/](./docs/integrations/README.md) — integrate SGRS with LangGraph, Pydantic AI, Mastra, and Agentica
- [DEVELOPMENT.md](./DEVELOPMENT.md) — Studio hooks, patterns, API route list
- [ROUTING_ARCHITECTURE.md](./ROUTING_ARCHITECTURE.md) — ports, env vars, proxy and SSE flows
- [PERFORMANCE_GUIDANCE.md](./PERFORMANCE_GUIDANCE.md) — client timeouts, concurrency, and performance checks
- **`pnpm docs`** — API (OpenAPI / Redoc) + SDK TypeDoc → `packages/docs/dist/` ([`packages/docs/README.md`](./packages/docs/README.md))
- **`pnpm docs:py`** — Python `sgrs-client` Sphinx site → `packages/client-py/docs/_build/html/`
- [MIGRATION.md](./MIGRATION.md) — schema and upgrade notes where applicable
- **Published reference (GitHub Pages):** [dealexmachina.github.io/sgrs](https://dealexmachina.github.io/sgrs/) — deployed from [.github/workflows/docs-pages.yml](.github/workflows/docs-pages.yml)

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

## Licensing

**This repository (`sgrs`) is [MIT](./LICENSE).** The Studio app, REST API, client libraries (`@sgrs/client-ts`, `sgrs-client`), and all packages listed in the layout table below are released under the MIT License. See [LICENSES.md](./LICENSES.md) for per-package details.

| Repository | Role | License |
|---|---|---|
| **This repo** (`DealExMachina/sgrs`) | Product layer — Studio, API, SDKs | **MIT** |
| [open-governed-swarm-of-agents](https://github.com/DealExMachina/open-governed-swarm-of-agents) | Research / orchestration kernel (swarm, feed, agents) | Split — see [kernel LICENSES.md](https://github.com/DealExMachina/open-governed-swarm-of-agents/blob/main/LICENSES.md) (AGPL-3.0 orchestration, ELv2 Rust core; kernel *clients* are MIT) |

Do not assume the kernel’s copyleft terms apply to this product repo. Integration with the kernel is via HTTP APIs and optional local checkout for smoke tests — not by merging kernel source into this tree.

**Enterprise / production:** features aimed at regulated or production deployments may ship under separate commercial terms in a future edition. This open-source MIT tree remains the public product surface for development and integration; enterprise-specific capabilities will be documented when offered.

## Status

Public, pre-alpha. Not for production.
