# Migration Guide: v0.0.0 → v0.1.0

## Overview

Version 0.1.0 introduces the Governance Domain feature with a redesigned Business Mode layout. This guide covers breaking changes and migration steps.

## Breaking Changes

### BusinessMode Layout Redesign

**Before (v0.0.0)**:
```
┌─────────────────────────────┐
│                             │
│  Graph (full width)         │
│                             │
├─────────────────────────────┤
│  DocumentStrip (bottom)     │  ← 108px fixed height
└─────────────────────────────┘
```

CSS Grid layout with two rows, DocumentStrip spanning bottom.

**After (v0.1.0)**:
```
┌─────┬──────────────────┬──────────┐
│Doc  │ ScopeCounter (top)          │
│Pan  ├──────────────────┤  Right   │
│el   │  Graph (flex-1)  │ Sidebar  │
│     │                  │  340px   │
│     │                  │          │
└─────┴──────────────────┴──────────┘
```

Flex layout with three columns; LeftDocsPanel on left (animating width), graph in center, sidebar on right.

### Props Changes

**BusinessMode** props unchanged, but component structure different:

```typescript
// Props still the same
interface Props {
  scope: ScopeItem;
  finalityStatus: ApiFinalityStatus | null;
  finalityLoading: boolean;
  activityEvents: SgrsEvent[];
  domain: UseDomainDataResult;
}
```

The internal layout and child components are reorganized:

**Old child components**:
- Graph
- DocumentStrip (removed)
- ProgressCard
- ClaimsPanel, IssuesPanel, SummaryPanel, OverviewPanel

**New child components**:
- LeftDocsPanel (new)
- ScopeCounter (new)
- Graph
- ProgressCard
- ClaimsPanel, IssuesPanel, SummaryPanel, OverviewPanel (same, now in right sidebar)

### CSS Classes Removed

Remove any custom CSS targeting:
- `.DocumentStrip` — No longer exists
- Grid-based children layout (now flex-based)

## What's New

### Required Props

No new props required for BusinessMode. It now expects:

```typescript
// Already provided by Shell/parent
- scope: ScopeItem
- finalityStatus: ApiFinalityStatus | null
- finalityLoading: boolean
- activityEvents: SgrsEvent[]
- domain: UseDomainDataResult  // Now includes documents, claims, risks, etc.
```

### New Hooks

If you're not using the BusinessMode component directly, integrate these hooks:

```typescript
// Finality tracking
const finality = useFinality(scope.id, tenantId);

// All governance domain data at once
const domain = useDomainData(scope.id, tenantId);

// Scopes management
const { scopes, patchScope, deleteScope } = useScopes(tenantId);
```

### New Components

**ScopeCounter** — Displays live metrics
```typescript
import { ScopeCounter } from "@/components/ScopeCounter";

<ScopeCounter
  finalityStatus={finality.status}
  claims={domain.claims.length}
  openContradictions={domain.contradictions.filter(c => c.status === "open").length}
  risks={domain.risks}
  currentRound={domain.epochSummary?.round ?? null}
/>
```

**LeftDocsPanel** — Document browser
```typescript
import { LeftDocsPanel } from "@/components/LeftDocsPanel";

const claimsByDoc = Object.fromEntries(
  domain.documents.map(d => [
    d.name,
    domain.claims.filter(c => c.source === d.name),
  ]),
);

<LeftDocsPanel
  documents={domain.documents}
  claimsByDoc={claimsByDoc}
/>
```

## API Changes

### New Endpoints

Add routes for new data:

```typescript
// GET /api/claims/:scopeId — List claims
// GET /api/drifts/:scopeId — List drifts
// GET /api/contradictions/:scopeId — List contradictions
// PATCH /api/contradictions/:id — Resolve contradiction (HITL)
// GET /api/risks/:scopeId — List risks
// GET /api/documents/:scopeId — List documents
// GET /api/finality/:scopeId — Get finality status
// GET /api/epochs/:scopeId/latest — Get latest epoch
```

All routes require tenant and scope isolation validation.

### Schema Changes

Import new types:

```typescript
import type { Claim, Drift, Contradiction, Risk, SgrsDocument, FinalityStatus, EpochSummary } from "@sgrs/api-schema";
```

## Database Schema

### New Tables (if using Drizzle)

Run migrations to create:
- `claims` — Indexed facts
- `drifts` — Deviation detection
- `contradictions` — Conflicting claims
- `risks` — Identified risks
- `documents` — Source documents
- `epoch_summaries` — Epoch results

```typescript
// apps/api/src/db/schema.ts
export const claims = pgTable("claims", { ... });
export const drifts = pgTable("drifts", { ... });
// ... etc
```

## SSE Event Changes

### New Event Types

If you're listening to SSE streams, handle 14 new event types:

```typescript
onAllScopeEvents.subscribe("sgrs.scope.{tenant}.>", (event) => {
  switch (event.type) {
    case "scope.claim.added":
      handleClaimAdded(event.payload);
      break;
    case "scope.drift.detected":
      handleDriftDetected(event.payload);
      break;
    case "scope.contradiction.detected":
      handleContradictionDetected(event.payload);
      break;
    // ... 11 more types
  }
});
```

Single subscription covers all scope-level events in that tenant.

## Testing Updates

### Mock Data

Development mode now includes mock data for governance domain:

```typescript
const MOCK_DOCUMENTS = [
  { id: "doc-1", name: "Q4-2025-Report.pdf", type: "pdf", status: "indexed", ... },
];

const MOCK_CLAIMS = [
  { id: "claim-1", text: "2025 Q4 revenue...", confidence: 0.92, source: "Q4-2025-Report.pdf" },
];
```

### Test Coverage

New test suites for:
- Claims listing and filtering
- Drift detection
- Contradiction HITL workflow
- Risk assessment
- Document indexing
- Finality convergence

## Step-by-Step Migration

### 1. Update Dependencies

```bash
pnpm install  # All packages updated to 0.1.0
```

### 2. Update BusinessMode Usage

Ensure parent component provides all required props:

```typescript
// Before: Only needed scope, finalityStatus, etc.
<BusinessMode
  scope={scope}
  finalityStatus={finalityStatus}
  finalityLoading={finalityLoading}
  activityEvents={activityEvents}
  domain={domain}  // NEW: Now includes all governance data
/>
```

### 3. Update CSS Selectors

Remove custom CSS targeting removed elements:

```css
/* ❌ Remove */
.DocumentStrip { /* ... */ }
.grid-cols-[1fr_340px] { /* ... */ }
.grid-rows-[1fr_108px] { /* ... */ }

/* ✅ Keep */
.flex { /* Flex layout now */}
.w-\[340px\] { /* Sidebar width */}
```

### 4. Add API Routes

Implement new endpoints in `apps/api`:

```typescript
// apps/api/src/routes.ts
app.get('/api/claims/:scopeId', (c) => {
  // Return claims for scope
});

app.get('/api/documents/:scopeId', (c) => {
  // Return documents for scope
});

// ... other routes
```

### 5. Wire SSE Events (Optional)

If using useEventStream, connect domain hooks:

```typescript
const domain = useDomainData(scope.id, tenantId);
const finality = useFinality(scope.id, tenantId);

useEventStream({
  onClaimAdded: domain.applyClaimEvent,
  onDriftDetected: domain.applyDriftEvent,
  onContradictionDetected: domain.applyContradictionEvent,
  onContradictionResolved: domain.applyContradictionEvent,
  onRiskIdentified: domain.applyRiskEvent,
  onDocumentIndexed: domain.applyDocumentEvent,
  onEpochCompleted: domain.applyEpochEvent,
  onFinalityChanged: finality.applyEvent,
  onFinalityNearFinal: finality.applyEvent,
});
```

### 6. Test Layout

Visually verify:
- LeftDocsPanel collapses/expands smoothly
- ScopeCounter metrics display and flash on change
- Graph takes up remaining space
- Right sidebar shows 4 tabs (Overview, Facts, Issues, Summary)

## Troubleshooting

### ScopeCounter not flashing
- Ensure `useRef` hooks are defined in CounterCell subcomponent
- Check that `setFlashing(true)` is firing
- Verify CSS class `opacity-50 animate-pulse` is applied

### LeftDocsPanel not animating
- Check parent uses flex layout (`flex h-full overflow-hidden`)
- Verify CSS class `transition-[width] duration-200` is present
- Ensure `isExpanded` state is toggling correctly

### Missing domain data
- Verify `useDomainData` is called with correct `scopeId` and `tenantId`
- Check API endpoints are implemented and returning data
- Confirm `Promise.allSettled` is handling partial failures

## Rollback

If you need to revert to v0.0.0:

```bash
git checkout v0.0.0  # Or use pnpm to downgrade specific packages
pnpm install
```

The old layout and DocumentStrip component are still available in the v0.0.0 tag.

## Questions?

Refer to:
- `DEVELOPMENT.md` — Component architecture and patterns
- `README.md` — Feature overview
- `apps/studio/README.md` — Component documentation
- `CHANGELOG.md` — Complete release notes
