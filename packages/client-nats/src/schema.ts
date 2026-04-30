/**
 * SGRS NATS event schema.
 *
 * All governance events published to the NATS bus carry a
 * BaseEvent envelope plus a typed payload. Discriminated by
 * the `type` field — exhaustive switch-case safe.
 */

import type {
  Scope,
  FinalityStatus,
  ModelHandle,
  Agent,
} from "@sgrs/api-schema";

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface BaseEvent {
  /** UUIDv4 unique to this event emission */
  id: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Tenant identifier (matches NATS account or subject segment) */
  tenant: string;
  /** Event schema version — increment on breaking changes */
  version: "1";
}

// ─── Scope events ────────────────────────────────────────────────────────────

export interface ScopeCreatedEvent extends BaseEvent {
  type: "scope.created";
  scopeId: string;
  payload: Scope;
}

export interface ScopeUpdatedEvent extends BaseEvent {
  type: "scope.updated";
  scopeId: string;
  /** Full updated scope */
  payload: Scope;
  /** Only the fields that changed */
  changes: Partial<Scope>;
}

export interface ScopeDeletedEvent extends BaseEvent {
  type: "scope.deleted";
  scopeId: string;
}

// ─── Finality events ─────────────────────────────────────────────────────────

export interface FinalityChangedEvent extends BaseEvent {
  type: "scope.finality.changed";
  scopeId: string;
  payload: FinalityStatus;
  previousScore: number;
  delta: number; // payload.score - previousScore
}

export interface FinalityNearFinalEvent extends BaseEvent {
  type: "scope.finality.near-final";
  scopeId: string;
  payload: FinalityStatus;
}

/**
 * Terminal event: scope has fully converged.
 * Triggers certificate issuance, archival, and downstream workflows.
 */
export interface FinalityFinalEvent extends BaseEvent {
  type: "scope.finality.final";
  scopeId: string;
  payload: FinalityStatus;
  /** Monotonicity round at convergence */
  round: number;
}

// ─── Veto events ─────────────────────────────────────────────────────────────

/**
 * CRITICAL PATH — must propagate to all swarm agents in <10ms.
 * Signals that reasoning must halt until veto is resolved.
 */
export interface VetoActivatedEvent extends BaseEvent {
  type: "scope.veto.activated";
  scopeId: string;
  /** Agent handle or model handle that raised the veto */
  activatedBy: string;
  reason?: string;
  payload: FinalityStatus;
}

export interface VetoLiftedEvent extends BaseEvent {
  type: "scope.veto.lifted";
  scopeId: string;
  liftedBy: string;
  payload: FinalityStatus;
}

// ─── Model events ─────────────────────────────────────────────────────────────

export interface ModelConnectedEvent extends BaseEvent {
  type: "model.connected";
  handle: string;
  payload: ModelHandle;
}

export interface ModelRevokedEvent extends BaseEvent {
  type: "model.revoked";
  handle: string;
}

// ─── Agent events ─────────────────────────────────────────────────────────────

export interface AgentHeartbeatEvent extends BaseEvent {
  type: "agent.heartbeat";
  agentId: string;
  status: "active" | "idle" | "error";
  payload?: Agent;
}

export interface AgentTaskStartedEvent extends BaseEvent {
  type: "agent.task.started";
  agentId: string;
  taskId: string;
  scopeId: string;
}

export interface AgentTaskCompletedEvent extends BaseEvent {
  type: "agent.task.completed";
  agentId: string;
  taskId: string;
  scopeId: string;
  durationMs: number;
}

export interface AgentTaskFailedEvent extends BaseEvent {
  type: "agent.task.failed";
  agentId: string;
  taskId: string;
  scopeId: string;
  error: string;
}

// ─── Union types ──────────────────────────────────────────────────────────────

export type ScopeEvent =
  | ScopeCreatedEvent
  | ScopeUpdatedEvent
  | ScopeDeletedEvent
  | FinalityChangedEvent
  | FinalityNearFinalEvent
  | FinalityFinalEvent
  | VetoActivatedEvent
  | VetoLiftedEvent;

export type ModelEvent = ModelConnectedEvent | ModelRevokedEvent;

export type AgentEvent =
  | AgentHeartbeatEvent
  | AgentTaskStartedEvent
  | AgentTaskCompletedEvent
  | AgentTaskFailedEvent;

export type SgrsEvent = ScopeEvent | ModelEvent | AgentEvent;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _counter = 0;

/** Create a UUIDv4-like event id (crypto.randomUUID when available, fallback) */
export function createEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node.js
  const ts = Date.now().toString(16);
  const rand = (++_counter + Math.random()).toString(16).replace(".", "");
  return `${ts}-${rand}`.padEnd(36, "0").slice(0, 36);
}

/** Build a BaseEvent envelope */
export function createBaseEvent(tenant: string): BaseEvent {
  return {
    id: createEventId(),
    timestamp: new Date().toISOString(),
    tenant,
    version: "1",
  };
}
