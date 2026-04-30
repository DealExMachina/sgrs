/**
 * Event builder helpers for NATS publishing from API route handlers.
 *
 * Each function returns a fully-typed, envelope-wrapped SGRS event ready to
 * pass to `eventsApi.publishScopeEvent()` or `eventsApi.publishModelEvent()`.
 *
 * Using a dedicated module keeps route handlers clean and keeps
 * `createBaseEvent()` in a single location.
 */

import { createBaseEvent } from "@sgrs/client-ts";
import type {
  ScopeCreatedEvent,
  ScopeUpdatedEvent,
  ScopeDeletedEvent,
  FinalityChangedEvent,
  FinalityNearFinalEvent,
  ModelConnectedEvent,
  ModelRevokedEvent,
  ClaimAddedEvent,
  DriftDetectedEvent,
  ContradictionDetectedEvent,
  ContradictionResolvedEvent,
  RiskIdentifiedEvent,
  DocumentIndexedEvent,
  EpochCompletedEvent,
} from "@sgrs/client-ts";
import type {
  Scope, FinalityStatus, ModelHandle,
  Claim, Drift, Contradiction, Risk, SgrsDocument, EpochSummary,
} from "@sgrs/api-schema";
import type { z } from "zod";

type ApiScope = z.infer<typeof Scope>;
type ApiFinalityStatus = z.infer<typeof FinalityStatus>;
type ApiModelHandle = z.infer<typeof ModelHandle>;

// ─── Scope events ─────────────────────────────────────────────────────────────

export function scopeCreated(tenant: string, scope: ApiScope): ScopeCreatedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.created",
    scopeId: scope.id,
    payload: scope,
  };
}

export function scopeUpdated(
  tenant: string,
  scope: ApiScope,
  changes: Partial<ApiScope>,
): ScopeUpdatedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.updated",
    scopeId: scope.id,
    payload: scope,
    changes,
  };
}

export function scopeDeleted(tenant: string, scopeId: string): ScopeDeletedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.deleted",
    scopeId,
  };
}

// ─── Finality events ──────────────────────────────────────────────────────────

export function finalityChanged(
  tenant: string,
  scopeId: string,
  status: ApiFinalityStatus,
  previousScore: number,
): FinalityChangedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.finality.changed",
    scopeId,
    payload: status,
    previousScore,
    delta: status.score - previousScore,
  };
}

export function finalityNearFinal(
  tenant: string,
  scopeId: string,
  status: ApiFinalityStatus,
): FinalityNearFinalEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.finality.near-final",
    scopeId,
    payload: status,
  };
}

// ─── Model events ─────────────────────────────────────────────────────────────

export function modelConnected(
  tenant: string,
  model: ApiModelHandle,
): ModelConnectedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "model.connected",
    handle: model.handle,
    payload: model,
  };
}

export function modelRevoked(tenant: string, handle: string): ModelRevokedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "model.revoked",
    handle,
  };
}

// ─── Governance domain events ─────────────────────────────────────────────────

type ApiClaim = z.infer<typeof Claim>;
type ApiDrift = z.infer<typeof Drift>;
type ApiContradiction = z.infer<typeof Contradiction>;
type ApiRisk = z.infer<typeof Risk>;
type ApiDocument = z.infer<typeof SgrsDocument>;
type ApiEpochSummary = z.infer<typeof EpochSummary>;

export function claimAdded(tenant: string, claim: ApiClaim): ClaimAddedEvent {
  return { ...createBaseEvent(tenant), type: "scope.claim.added", scopeId: claim.scope_id, payload: claim };
}

export function driftDetected(tenant: string, drift: ApiDrift): DriftDetectedEvent {
  return { ...createBaseEvent(tenant), type: "scope.drift.detected", scopeId: drift.scope_id, payload: drift };
}

export function contradictionDetected(
  tenant: string, c: ApiContradiction,
): ContradictionDetectedEvent {
  return { ...createBaseEvent(tenant), type: "scope.contradiction.detected", scopeId: c.scope_id, payload: c };
}

export function contradictionResolved(
  tenant: string, c: ApiContradiction,
): ContradictionResolvedEvent {
  return { ...createBaseEvent(tenant), type: "scope.contradiction.resolved", scopeId: c.scope_id, payload: c };
}

export function riskIdentified(tenant: string, risk: ApiRisk): RiskIdentifiedEvent {
  return { ...createBaseEvent(tenant), type: "scope.risk.identified", scopeId: risk.scope_id, payload: risk };
}

export function documentIndexed(tenant: string, doc: ApiDocument): DocumentIndexedEvent {
  return { ...createBaseEvent(tenant), type: "scope.document.indexed", scopeId: doc.scope_id, payload: doc };
}

export function epochCompleted(
  tenant: string, summary: ApiEpochSummary,
): EpochCompletedEvent {
  return {
    ...createBaseEvent(tenant),
    type: "scope.epoch.completed",
    scopeId: summary.scope_id,
    round: summary.round,
    payload: summary,
  };
}
