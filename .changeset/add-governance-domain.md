---
"@sgrs/api": minor
"@sgrs/studio": minor
"@sgrs/api-schema": minor
"@sgrs/client-ts": minor
"@sgrs/client-nats": minor
"@sgrs/db": minor
---

## Governance Domain with Live Metrics and Document Panel

### API & Schema
- **New endpoints**: `GET /api/claims`, `GET /api/drifts`, `GET /api/contradictions`, `GET /api/risks`, `GET /api/documents`, `GET /api/finality/:scopeId`, `GET /api/epochs/:scopeId/latest`
- **New Zod schemas**: Claim, Drift, Contradiction, Risk, SgrsDocument, FinalityStatus, EpochSummary with full type exports
- **SSE event types**: 14 new event types for scope lifecycle (claim.added, drift.detected, contradiction.detected, contradiction.resolved, risk.identified, document.indexed, epoch.completed, finality.changed, finality.near-final, scope.created, scope.updated, scope.deleted)
- **Database tables**: Claims, Drifts, Contradictions, Risks, Documents, EpochSummaries with indexes on scope_id and created_at

### Studio UI
- **ScopeCounter**: Live metrics bar displaying Round, Score, Δ (convergence rate), Claims count, Issues count, Risk level, and State. Values flash (700ms) when changed, with trend indicators (↑↓) for score convergence.
- **LeftDocsPanel**: Collapsible left-side document browser (36px collapsed, 224px expanded) with smooth width animation. Shows document type badges (PDF/DOCX/XLSX/TXT/URL), status indicators, claim counts, confidence metrics. Hover tooltips display document name, status, claims, avg confidence, and ingestion time.
- **BusinessMode redesign**: Layout changed from grid with bottom DocumentStrip to flex layout with LeftDocsPanel on left, center graph column with ScopeCounter, and right sidebar with 4 tabs (Overview/Facts/Issues/Summary).

### Real-time Integration
- **NATS SSE subscriptions**: Single wildcard subscription (`sgrs.scope.{tenant}.>`) covers all 14 event types automatically
- **Change detection**: `useRef` pattern in ScopeCounter for per-cell value comparison without extra re-renders
- **Optimistic updates**: UI components apply SSE events instantly to local state; polling acts as background resync

### Backward Compatibility
- Existing endpoints and scopes continue to work unchanged
- New hooks (`useFinality`, `useDomainData`) are optional; legacy components unaffected
- Mock data fallback for development mode

### Dependencies
- No new production dependencies
- Uses existing: React, Next.js, NATS, Zod, Drizzle ORM, DuckDB
