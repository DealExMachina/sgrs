/**
 * SGRS NATS event schema.
 *
 * All governance events share a BaseEvent envelope and are discriminated
 * by the `type` field — exhaustive switch/case safe.
 *
 * `validateInboundEvent()` MUST be called on every message decoded from
 * the wire before it reaches application handlers. It is the boundary
 * between untrusted bytes and typed application code.
 */

import type {
  Scope,
  FinalityStatus,
  ModelHandle,
  Agent,
  Claim,
  Drift,
  Contradiction,
  Risk,
  SgrsDocument,
  EpochSummary,
} from "@sgrs/api-schema";

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface BaseEvent {
  id: string;
  timestamp: string;
  tenant: string;
  version: "1";
}

// ─── Scope ───────────────────────────────────────────────────────────────────

export interface ScopeCreatedEvent extends BaseEvent {
  type: "scope.created";
  scopeId: string;
  payload: Scope;
}

export interface ScopeUpdatedEvent extends BaseEvent {
  type: "scope.updated";
  scopeId: string;
  payload: Scope;
  changes: Partial<Scope>;
}

export interface ScopeDeletedEvent extends BaseEvent {
  type: "scope.deleted";
  scopeId: string;
}

// ─── Finality ─────────────────────────────────────────────────────────────────

export interface FinalityChangedEvent extends BaseEvent {
  type: "scope.finality.changed";
  scopeId: string;
  payload: FinalityStatus;
  previousScore: number;
  delta: number;
}

export interface FinalityNearFinalEvent extends BaseEvent {
  type: "scope.finality.near-final";
  scopeId: string;
  payload: FinalityStatus;
}

export interface FinalityFinalEvent extends BaseEvent {
  type: "scope.finality.final";
  scopeId: string;
  payload: FinalityStatus;
  round: number;
}

// ─── Veto ─────────────────────────────────────────────────────────────────────

export interface VetoActivatedEvent extends BaseEvent {
  type: "scope.veto.activated";
  scopeId: string;
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

// ─── Model ────────────────────────────────────────────────────────────────────

export interface ModelConnectedEvent extends BaseEvent {
  type: "model.connected";
  handle: string;
  payload: ModelHandle;
}

export interface ModelRevokedEvent extends BaseEvent {
  type: "model.revoked";
  handle: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

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

// ─── Governance domain events ─────────────────────────────────────────────────

export interface ClaimAddedEvent extends BaseEvent {
  type: "scope.claim.added";
  scopeId: string;
  payload: Claim;
}

export interface DriftDetectedEvent extends BaseEvent {
  type: "scope.drift.detected";
  scopeId: string;
  payload: Drift;
}

export interface ContradictionDetectedEvent extends BaseEvent {
  type: "scope.contradiction.detected";
  scopeId: string;
  payload: Contradiction;
}

export interface ContradictionResolvedEvent extends BaseEvent {
  type: "scope.contradiction.resolved";
  scopeId: string;
  payload: Contradiction;
}

export interface RiskIdentifiedEvent extends BaseEvent {
  type: "scope.risk.identified";
  scopeId: string;
  payload: Risk;
}

export interface DocumentIndexedEvent extends BaseEvent {
  type: "scope.document.indexed";
  scopeId: string;
  payload: SgrsDocument;
}

export interface EpochCompletedEvent extends BaseEvent {
  type: "scope.epoch.completed";
  scopeId: string;
  round: number;
  payload: EpochSummary;
}

// ─── Unions ───────────────────────────────────────────────────────────────────

export type ScopeEvent =
  | ScopeCreatedEvent
  | ScopeUpdatedEvent
  | ScopeDeletedEvent
  | FinalityChangedEvent
  | FinalityNearFinalEvent
  | FinalityFinalEvent
  | VetoActivatedEvent
  | VetoLiftedEvent
  | ClaimAddedEvent
  | DriftDetectedEvent
  | ContradictionDetectedEvent
  | ContradictionResolvedEvent
  | RiskIdentifiedEvent
  | DocumentIndexedEvent
  | EpochCompletedEvent;

export type ModelEvent = ModelConnectedEvent | ModelRevokedEvent;

export type AgentEvent =
  | AgentHeartbeatEvent
  | AgentTaskStartedEvent
  | AgentTaskCompletedEvent
  | AgentTaskFailedEvent;

export type SgrsEvent = ScopeEvent | ModelEvent | AgentEvent;

// ─── Known types allowlist ────────────────────────────────────────────────────

const KNOWN_TYPES = new Set<string>([
  "scope.created",
  "scope.updated",
  "scope.deleted",
  "scope.finality.changed",
  "scope.finality.near-final",
  "scope.finality.final",
  "scope.veto.activated",
  "scope.veto.lifted",
  // Governance domain
  "scope.claim.added",
  "scope.drift.detected",
  "scope.contradiction.detected",
  "scope.contradiction.resolved",
  "scope.risk.identified",
  "scope.document.indexed",
  "scope.epoch.completed",
  // Model & agent
  "model.connected",
  "model.revoked",
  "agent.heartbeat",
  "agent.task.started",
  "agent.task.completed",
  "agent.task.failed",
]);

// ─── Inbound validation ───────────────────────────────────────────────────────

export class EventValidationError extends Error {
  constructor(reason: string, public readonly subject: string) {
    super(`[SGRS] Inbound event validation failed on "${subject}": ${reason}`);
    this.name = "EventValidationError";
  }
}

/**
 * Validate a decoded JSON object as a well-formed SgrsEvent.
 *
 * This is the SECURITY BOUNDARY between untrusted wire bytes and typed
 * application code. Call it on every inbound message before invoking
 * any handler.
 *
 * Validation levels:
 *   • All events: envelope fields (id, timestamp, tenant, version), type allowlist
 *   • VetoActivated: required scopeId, activatedBy, payload
 *   • FinalityFinal: required scopeId, round (number), payload
 *   • FinalityChanged: required delta (number)
 *
 * @throws {EventValidationError} on any validation failure
 */
export function validateInboundEvent(raw: unknown, subject: string): SgrsEvent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EventValidationError(
      `Expected object, received ${Array.isArray(raw) ? "array" : typeof raw}`,
      subject,
    );
  }

  const obj = raw as Record<string, unknown>;

  // ── Envelope ──────────────────────────────────────────────────────────────

  if (typeof obj["id"] !== "string" || !obj["id"]) {
    throw new EventValidationError("missing or non-string 'id'", subject);
  }
  if (typeof obj["timestamp"] !== "string" || !obj["timestamp"]) {
    throw new EventValidationError("missing or non-string 'timestamp'", subject);
  }
  if (typeof obj["tenant"] !== "string" || !obj["tenant"]) {
    throw new EventValidationError("missing or non-string 'tenant'", subject);
  }
  if (obj["version"] !== "1") {
    throw new EventValidationError(
      `unsupported version ${JSON.stringify(obj["version"])} (expected "1")`,
      subject,
    );
  }

  // ── Type discriminant ────────────────────────────────────────────────────

  if (typeof obj["type"] !== "string" || !KNOWN_TYPES.has(obj["type"])) {
    throw new EventValidationError(
      `unknown event type ${JSON.stringify(obj["type"])}`,
      subject,
    );
  }

  const type = obj["type"] as string;

  // ── Critical-path strict validation ───────────────────────────────────────

  if (type === "scope.veto.activated") {
    if (typeof obj["scopeId"] !== "string" || !obj["scopeId"]) {
      throw new EventValidationError("VetoActivatedEvent missing 'scopeId'", subject);
    }
    if (typeof obj["activatedBy"] !== "string" || !obj["activatedBy"]) {
      throw new EventValidationError("VetoActivatedEvent missing 'activatedBy'", subject);
    }
    if (!obj["payload"] || typeof obj["payload"] !== "object") {
      throw new EventValidationError("VetoActivatedEvent missing 'payload'", subject);
    }
  }

  if (type === "scope.finality.final") {
    if (typeof obj["scopeId"] !== "string" || !obj["scopeId"]) {
      throw new EventValidationError("FinalityFinalEvent missing 'scopeId'", subject);
    }
    if (typeof obj["round"] !== "number" || !Number.isFinite(obj["round"])) {
      throw new EventValidationError("FinalityFinalEvent 'round' must be a finite number", subject);
    }
    if (!obj["payload"] || typeof obj["payload"] !== "object") {
      throw new EventValidationError("FinalityFinalEvent missing 'payload'", subject);
    }
  }

  if (type === "scope.finality.changed") {
    if (typeof obj["delta"] !== "number" || !Number.isFinite(obj["delta"])) {
      throw new EventValidationError("FinalityChangedEvent 'delta' must be a finite number", subject);
    }
  }

  if (type === "scope.veto.lifted") {
    if (typeof obj["scopeId"] !== "string" || !obj["scopeId"]) {
      throw new EventValidationError("VetoLiftedEvent missing 'scopeId'", subject);
    }
    if (typeof obj["liftedBy"] !== "string" || !obj["liftedBy"]) {
      throw new EventValidationError("VetoLiftedEvent missing 'liftedBy'", subject);
    }
  }

  return raw as SgrsEvent;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a BaseEvent envelope.
 * Uses `crypto.randomUUID()` — available in Node.js ≥15, all modern browsers,
 * Deno, and Cloudflare Workers. Do NOT fall back to Math.random() in a
 * legal-grade audit system.
 */
export function createBaseEvent(tenant: string): BaseEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    tenant,
    version: "1",
  };
}
