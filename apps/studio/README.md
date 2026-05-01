# @sgrs/studio

Next.js 16 front-end for the SGRS product.

## Modes

- **Business** — scope graph + live metrics counter + collapsible document panel + activity/progress side panel
- **Configure** — governance, finality, agents, models, scopes, access
- **Debug** — graph + V(t) metrics + per-dim + governance trace + event stream

## Business Mode Components

### ScopeCounter (`components/ScopeCounter.tsx`)

Displays live scope-level metrics in a thin horizontal bar above the graph:

- **Round**: Current epoch round number
- **Score**: Convergence score with trend arrow (↑/↓)
- **δ**: Convergence rate (delta)
- **Claims**: Total claims indexed from source documents
- **Issues**: Count of open contradictions + high-severity drifts
- **Risk**: Current risk level (low/medium/high/critical)
- **State**: Scope status badge (active/near-final/resolved/etc.)

All values flash (700ms highlight) when changed, providing real-time visual feedback. Change detection uses a `useRef` pattern to avoid unnecessary re-renders.

### LeftDocsPanel (`components/LeftDocsPanel.tsx`)

Collapsible left-side panel for browsing source documents analyzed by the swarm:

- **Collapsed state** (36px): Document status indicator dots only
- **Expanded state** (224px): Full document cards with metadata
- **Hover tooltips**: Document name, status, claim count, avg confidence, ingestion time, top 2 claims
- **Document types**: PDF (red), DOCX (blue), XLSX (green), TXT/URL (amber)
- **Smooth animation**: CSS `transition-[width]` for 200ms expand/collapse
- **Future feature**: "Add document" button placeholder for document upload

Uses flex layout to allow parent to reflow smoothly as panel width changes.

### SSE Integration

All components integrate with live server-sent events via NATS:

- **ScopeCounter** receives: `scope.epoch.completed` (score updates), `scope.finality.*` events
- **Business sidebar tabs** receive: `scope.claim.added`, `scope.drift.detected`, `scope.contradiction.*`, `scope.risk.identified`, `scope.document.indexed`
- Single wildcard subscription (`sgrs.scope.{tenant}.>`) covers all event types automatically

Events apply instantly to local state without waiting for the next polling cycle.

## BFF

Backend-for-Frontend routes live under `app/api/*`. The model provider keys
never reach the client bundle; they live server-side and are referenced by
opaque `model_handle` identifiers.

## Dev

```
pnpm dev
```

Ports and `.env.local` layout: see the repo root **`ROUTING_ARCHITECTURE.md`**.

## License

BUSL-1.1 — see `LICENSE`.
