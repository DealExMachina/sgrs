# SGRS Development Guide

## New Patterns & Components (v0.1.0)

### Change Detection Without Extra Re-renders: useRef Pattern

**Problem**: Detecting when a value changes to trigger side effects (like flashing a cell) normally requires useState for both previous and current values, causing two re-renders.

**Solution**: Use `useRef` to hold the previous value (doesn't trigger re-render), then compare in useEffect:

```typescript
// ✅ Efficient: only re-renders once per actual change
const prevRef = useRef<number>(value);

useEffect(() => {
  if (prevRef.current !== value) {
    setFlashing(true);
    prevRef.current = value;
    
    const timeout = setTimeout(() => setFlashing(false), 700);
    return () => clearTimeout(timeout);
  }
}, [value]);
```

Used in: **ScopeCounter** for each metric cell (Round, Score, Δ, Claims, Issues, Risk)

### Smooth CSS Width Animation: Flex vs Grid

**Problem**: Using CSS Grid with `auto` columns doesn't animate width transitions because the grid computes track sizes pre-render.

**Solution**: Use flex layout where the panel controls its own width via CSS class transition:

```typescript
// ✅ Works: flex accommodates width changes smoothly
<div className="flex h-full overflow-hidden">
  <div className={cn(
    "transition-[width] duration-200 ease-in-out",
    isExpanded ? "w-56" : "w-9"  // CSS classes, not inline styles
  )} />
  {/* Siblings automatically reflow */}
</div>
```

Used in: **LeftDocsPanel** for expand/collapse animation

### Tooltip Positioning Outside Parent Clipping

**Problem**: Tooltips positioned inside a parent with `overflow-hidden` get clipped at the parent's left edge.

**Solution**: Position tooltip `left-full` (CSS `left: 100%`) to place it rightward of the parent:

```typescript
// ✅ Visible: positioned to the right of the panel
<div
  className="absolute left-full top-0 ml-2"
  style={{ width: '240px' }}
>
  {/* Tooltip content */}
</div>
```

Used in: **LeftDocsPanel** hover tooltips

### Discriminated Union Event Routing

**Problem**: SSE event stream contains 14 different event types; need type-safe routing.

**Solution**: Use TypeScript discriminated unions with exhaustive switch:

```typescript
type SgrsEvent = 
  | { type: "scope.claim.added"; payload: Claim; scopeId: string }
  | { type: "scope.drift.detected"; payload: Drift; scopeId: string }
  | { type: "scope.contradiction.detected"; payload: Contradiction; scopeId: string }
  // ... 11 more types

// Exhaustive switch — TypeScript ensures all types handled
const applyEvent = (event: SgrsEvent) => {
  switch (event.type) {
    case "scope.claim.added":
      dispatch({ type: "CLAIM_ADDED", payload: event.payload });
      break;
    // ... compiler error if any type missing
  }
};
```

Used in: **useDomainData** with 6 per-type dispatchers, **useFinality**, **useScopes**

### Partial Failure Tolerance: Promise.allSettled

**Problem**: Fetching 6 different domain collections; if one API fails, all data is lost.

**Solution**: Use `Promise.allSettled` to handle each result independently:

```typescript
const [claims, drifts, contradictions, risks, documents, epochResult] =
  await Promise.allSettled([
    api.claims.list(scopeId),
    api.drifts.list(scopeId),
    api.contradictions.list(scopeId),
    api.risks.list(scopeId),
    api.documents.list(scopeId),
    api.epochs.latest(scopeId),
  ]);

dispatch({
  type: "FETCH_DONE",
  payload: {
    claims: claims.status === "fulfilled" ? claims.value : [],
    drifts: drifts.status === "fulfilled" ? drifts.value : [],
    // ... graceful fallback to empty arrays
  },
});
```

Used in: **useDomainData** for 6-way parallel fetch

### Mock Data for Development

All domain hooks support mock data via `isDemo` flag:

```typescript
const MOCK_DOCUMENTS = [
  { id: "doc-1", name: "Q4-2025-Report.pdf", type: "pdf", status: "indexed", claims_count: 12 },
  // ...
];

export function useDomainData(scopeId: string | null, tenantId: string) {
  const isDemo = !scopeId || scopeId === "demo";
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL,
    documents: isDemo ? MOCK_DOCUMENTS : [],
  });
  // ...
}
```

Enables UI development without live API.

## Component Architecture

### ScopeCounter

**Purpose**: Display live scope metrics in a thin bar above the graph.

**Props**:
- `finalityStatus: ApiFinalityStatus | null` — Current finality convergence data
- `claims: number` — Total claims indexed
- `openContradictions: number` — Unresolved contradictions
- `risks: Risk[]` — Identified risks
- `currentRound: number | null` — Epoch round number

**Change Detection**:
- Each metric cell (`CounterCell` subcomponent) uses useRef to detect value changes
- Flash state triggers CSS class for 700ms
- Trend arrows computed from convergence_rate (↑ if > 0.01, ↓ if < -0.01)

**State Labels**:
- Derived from `finalityStatus.state` (active/near-final/resolved/escalated/archived)
- Pinned to far right of counter bar

### LeftDocsPanel

**Purpose**: Browse source documents with inline metadata and hover tooltips.

**Props**:
- `documents: ApiSgrsDocument[]` — List of analyzed documents
- `claimsByDoc: Record<string, ApiClaim[]>` — Claims grouped by source document

**States**:
- `isExpanded: boolean` — Controls width (w-9 collapsed, w-56 expanded)

**Subcomponents**:
- `DocTypeChip` — Colored badge (pdf/docx/xlsx/txt/url)
- `DocTooltip` — Positioned right of panel, shows full metadata
- `DocRow` — Status dot always visible, full content in expanded state

**CSS**:
- `transition-[width] duration-200 ease-in-out` for smooth animation
- Parent uses flex layout so siblings reflow automatically

## Hooks Reference

### useScopes(tenantId)

Fetch and manage scopes with create/update/delete optimism.

```typescript
const { scopes, isLoading, error, refresh, patchScope, deleteScope, applyEvent } =
  useScopes('horizon');
```

**Features**:
- Auto-fetch on mount and when tenantId changes
- Manual refresh via `refresh()`
- Optimistic state update on patch/delete
- `applyEvent(SgrsEvent)` for SSE integration

### useFinality(scopeId, tenantId, pollIntervalMs = 5_000)

Poll finality status with optional SSE push integration.

```typescript
const { status, isLoading, error, refresh, applyEvent } =
  useFinality(scope.id, tenantId);
```

**Features**:
- Pass `scopeId = null` to suspend fetching
- 404 responses treated as "no data yet" (kernel hasn't run)
- SSE events apply instantly; poll acts as background resync
- `applyEvent()` filters to matching scopeId automatically

### useDomainData(scopeId, tenantId)

Single hook providing all governance domain data with per-type SSE dispatchers.

```typescript
const domain = useDomainData(scope.id, tenantId);
// domain.claims, domain.drifts, domain.contradictions, domain.risks, domain.documents, domain.epochSummary
// domain.applyClaimEvent(), domain.applyDriftEvent(), etc.
```

**Features**:
- 6 parallel API fetches via `Promise.allSettled`
- Per-type SSE dispatchers for fine-grained updates
- `resolveContradiction()` for optimistic HITL updates
- `addEpochComment()` for editing epoch summaries

**Polling**: 30 seconds for claims/drifts/risks, 5 seconds for finality

## API Routes Structure

All routes are scoped to tenant and scope:

```
GET /api/scopes              — List all scopes for tenant
POST /api/scopes             — Create new scope

GET /api/claims/:scopeId     — List claims
GET /api/drifts/:scopeId     — List drifts
GET /api/contradictions/:scopeId — List contradictions
PATCH /api/contradictions/:id — Resolve contradiction (HITL)
GET /api/risks/:scopeId      — List risks
GET /api/documents/:scopeId  — List documents
GET /api/finality/:scopeId   — Get finality status
GET /api/epochs/:scopeId/latest — Get latest epoch summary
```

## Event Types

14 SSE event types in `@sgrs/client-nats`:

```typescript
type SgrsEvent =
  // Scope lifecycle
  | { type: "scope.created"; scopeId: string; payload: Scope }
  | { type: "scope.updated"; scopeId: string; payload: Scope }
  | { type: "scope.deleted"; scopeId: string }
  
  // Domain events
  | { type: "scope.claim.added"; scopeId: string; payload: Claim }
  | { type: "scope.drift.detected"; scopeId: string; payload: Drift }
  | { type: "scope.contradiction.detected"; scopeId: string; payload: Contradiction }
  | { type: "scope.contradiction.resolved"; scopeId: string; payload: Contradiction }
  | { type: "scope.risk.identified"; scopeId: string; payload: Risk }
  | { type: "scope.document.indexed"; scopeId: string; payload: SgrsDocument }
  
  // Finality events
  | { type: "scope.epoch.completed"; scopeId: string; payload: EpochSummary }
  | { type: "scope.finality.changed"; scopeId: string; payload: FinalityStatus }
  | { type: "scope.finality.near-final"; scopeId: string; payload: FinalityStatus }
```

## Testing

### Mock Data

Development components use `MOCK_*` arrays:

```typescript
const MOCK_DOCUMENTS = [
  { id: "doc-1", name: "Q4-2025-Report.pdf", type: "pdf", status: "indexed", claims_count: 12, ... },
  { id: "doc-2", name: "Analysis.docx", type: "docx", status: "indexed", claims_count: 8, ... },
];

const isDemo = !scopeId || scopeId === "demo";
```

### Integration Tests

Run API tests:

```bash
pnpm test  # Runs all vitest suites
```

Tests validate:
- Scope CRUD
- Tenant isolation
- Finality status fetching
- Claims/drifts/contradictions/risks listing

## Performance Notes

- **ScopeCounter**: useRef pattern avoids double-render on value change
- **LeftDocsPanel**: Flex layout animates smoothly; parent reflow is automatic
- **useDomainData**: Promise.allSettled prevents entire fetch failure
- **API client**: Memoized instance per tenantId prevents unnecessary recreations
- **CSS transitions**: Hardware-accelerated (no JS animation frame blocking)

## Future Enhancements

- Document upload UI ("Add document" button in LeftDocsPanel)
- Document removal with swarm recalibration
- Risk mitigation workflow
- Epoch summary export to PDF/email
- Real-time search/filter in document panel
- Governance audit trail export

## File Structure

```
apps/studio/
├── lib/
│   ├── hooks/
│   │   ├── useScopes.ts          (scope CRUD)
│   │   ├── useFinality.ts        (finality polling)
│   │   └── useDomainData.ts      (all domain data)
│   └── api-client.ts             (API client factory)
└── components/
    ├── ScopeCounter.tsx          (metrics bar)
    ├── LeftDocsPanel.tsx         (document browser)
    ├── BusinessMode.tsx          (main layout)
    └── modes/
        ├── panels/
        │   ├── OverviewPanel.tsx
        │   ├── ClaimsPanel.tsx
        │   ├── IssuesPanel.tsx
        │   └── SummaryPanel.tsx
        └── ...
```
