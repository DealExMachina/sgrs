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

## Status

Private, pre-alpha. Not for production.
