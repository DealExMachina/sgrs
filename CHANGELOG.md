# Changelog

All notable changes to SGRS Studio are documented in this file.

## [0.1.0] — 2026-04-30

### 🎉 Major Features

#### Governance Domain Implementation
Complete implementation of the governance domain tracking system for SGRS scopes:

- **Live Claims Tracking** — Real-time indexing of claims extracted from analyzed documents with confidence scores
- **Drift Detection** — Automatic detection of contradictions between current claims and previous facts, with severity levels
- **Contradiction Management** — HITL (Human-in-the-Loop) interface for resolving contradictions with status tracking
- **Risk Assessment** — Dynamic risk level calculation based on active contradictions and drift severity
- **Document Indexing** — Source document tracking with status (processing/indexed), type detection, and claim attribution
- **Epoch Summaries** — End-of-epoch results with user-editable comments for governance audit trail
- **Finality Tracking** — Real-time finality convergence status with score, rate, and state transitions

#### Business Mode UX Redesign

**Live Metrics Counter** (`ScopeCounter`)
- Real-time metric bar above the graph showing:
  - Current epoch round number
  - Convergence score with trend indicator (↑ improving, ↓ declining)
  - Convergence rate (δ) 
  - Total claims indexed from documents
  - Open contradictions + high-severity drifts (issues count)
  - Current risk level (low/medium/high/critical)
  - Scope state badge (active/near-final/resolved/escalated/archived)
- Flash highlight (700ms) on value changes for immediate visual feedback
- Change detection via `useRef` pattern for efficient re-render optimization

**Collapsible Document Panel** (`LeftDocsPanel`)
- Left-side panel for browsing source documents analyzed by the swarm
- Two states: collapsed (36px) showing status dots, expanded (224px) showing full document cards
- Smooth 200ms width animation using CSS `transition-[width]` (flex layout for automatic reflow)
- Document metadata:
  - Type badge (PDF/red, DOCX/blue, XLSX/green, TXT/amber, URL/amber)
  - Processing status indicator (queued/processing/indexed)
  - Claim count from this document
  - Average confidence score
- Hover tooltips showing:
  - Document name and full path
  - Processing status and timestamps
  - Associated claim count and average confidence
  - Top 2 claims extracted from document
  - Ingestion timestamp
- Future feature: "Add document" button placeholder for document upload workflow

**BusinessMode Layout Redesign**
- Layout changed from CSS Grid with bottom DocumentStrip to flex-based layout
- Three-column layout:
  1. LeftDocsPanel (animating width, 0 to 224px)
  2. Center column (flex-1): ScopeCounter + Graph
  3. Right sidebar (fixed w-[340px]): ProgressCard + Tab Panel
- Sidebar tabs now badge-enabled:
  - **Facts**: Claims count badge
  - **Issues**: Open contradictions + high drifts count badge
  - **Summary**: Epoch completion indicator
  - **Overview**: Activity feed

### 🔌 Real-time SSE Integration

- **Single NATS subscription** using wildcard pattern `sgrs.scope.{tenant}.>` covers all 14 event types automatically
- **14 SSE Event Types**:
  - Scope lifecycle: `scope.created`, `scope.updated`, `scope.deleted`
  - Claims: `scope.claim.added`
  - Drifts: `scope.drift.detected`
  - Contradictions: `scope.contradiction.detected`, `scope.contradiction.resolved`
  - Risks: `scope.risk.identified`
  - Documents: `scope.document.indexed`
  - Epochs: `scope.epoch.completed`
  - Finality: `scope.finality.changed`, `scope.finality.near-final`
- **Optimistic state updates**: UI applies events instantly without waiting for next poll
- **Polling as background resync**: 30-second polls for Claims/Drifts/Risks, 5-second for Finality status

### 📊 New React Hooks

- **`useScopes(tenantId)`** — Fetch and manage scopes with optimistic create/update/delete
- **`useFinality(scopeId, tenantId)`** — Poll finality status with SSE push integration
- **`useDomainData(scopeId, tenantId)`** — Single hook providing claims, drifts, contradictions, risks, documents, and epoch summaries with per-type SSE dispatchers
- **`useEventStream(tenantId, onEvent)`** — Wire SSE subscriptions to domain hooks (future: extract to separate hook)

### 🛢️ Database Schema

New tables in @sgrs/db (Drizzle ORM):
- `claims`: Indexed facts with confidence scores and document sources
- `drifts`: Detected deviations from previous facts with severity
- `contradictions`: Conflicting claims with HITL resolution status
- `risks`: Identified risks with severity and mitigation status
- `documents`: Source documents with type, status, and ingestion metadata
- `epoch_summaries`: End-of-epoch results with user comments

All tables indexed on `scope_id` and `created_at` for efficient querying.

### 📡 API Endpoints

**Governance Domain** (all scoped to tenant and scope):
- `GET /api/scopes` — List all scopes
- `GET /api/claims/:scopeId` — List claims for a scope
- `GET /api/drifts/:scopeId` — List detected drifts
- `GET /api/contradictions/:scopeId` — List contradictions
- `GET /api/risks/:scopeId` — List identified risks
- `GET /api/documents/:scopeId` — List analyzed documents
- `GET /api/finality/:scopeId` — Get current finality status
- `GET /api/epochs/:scopeId/latest` — Get most recent epoch summary

**Scope Management**:
- `POST /api/scopes` — Create new scope
- `PATCH /api/scopes/:id` — Update scope
- `DELETE /api/scopes/:id` — Delete scope

### ✅ Testing

- 16 API integration tests (auth, scopes, finality, tenant isolation)
- All tests passing
- Mock data for development (MOCK_DOCUMENTS, MOCK_CLAIMS, etc.)

### 🔒 Type Safety

- Full TypeScript strict mode across all components
- Zod schemas as source of truth for API contracts
- Discriminated unions for SSE event routing
- Type guards for event type narrowing

### 🚀 Performance

- Change detection via `useRef` (no double-render)
- `Promise.allSettled` for partial failure tolerance on parallel API fetches
- Memoized API client instances (`useMemo`)
- Smooth CSS transitions (no JS animation frame blocking)
- Exhaustive switch statements for compile-time event type coverage

### 📝 Documentation

- Updated root README.md with Business Mode features
- Updated apps/studio/README.md with component documentation
- Updated packages to version 0.1.0 (semver minor bump)
- Changeset entry for governance domain feature

### ⚠️ Breaking Changes

None. All existing endpoints and scopes continue to work. New features are additive.

### 🔗 Related Issues

Part of the "Governance Domain Phase 1" initiative to enable business users to see facts, contradictions, and risks as the swarm progresses toward finality.

---

**Installation**: No new dependencies required. Uses existing React 19, Next.js 16, NATS 2.29, TypeScript 5.9.

**Migration**: No migration needed for existing scopes. New domain data populates as scopes are created and analyzed.
