/**
 * @sgrs/client-ts — TypeScript client for the SGRS governance platform
 *
 * Unified HTTP + optional NATS real-time event transport.
 *
 * HTTP-only usage (no nats package required):
 * ```ts
 * import { createClient } from '@sgrs/client-ts';
 *
 * const client = createClient({ baseUrl: 'http://localhost:3000' });
 * const result = await client.scopes.list();
 * ```
 *
 * With real-time NATS events (requires: npm install nats):
 * ```ts
 * import { createClient } from '@sgrs/client-ts';
 *
 * const client = createClient({
 *   baseUrl: 'http://localhost:3000',
 *   nats: { servers: 'nats://localhost:4222' },
 * });
 * await client.connect();
 *
 * // CRITICAL PATH — veto propagation to all swarm agents
 * client.events.onVetoActivated('acme', (event) => {
 *   console.log('Veto raised by', event.activatedBy);
 * });
 *
 * // Finality convergence
 * client.events.onFinalityFinal('acme', 'scope-1', (event) => {
 *   console.log('Converged at round', event.round);
 * });
 *
 * await client.close(); // drain + disconnect
 * ```
 */

export { Client, createClient } from "./client.js";
export type { ClientConfig, ApiError, ApiResponse, NatsConfig, TLSConfig } from "./client.js";

// Real-time event types and utilities
export { EventsApi, NatsNotConfiguredError, NatsNotConnectedError } from "./events/api.js";
export type { EventHandler, TaskHandler } from "./events/api.js";
export type {
  SgrsEvent,
  ScopeEvent,
  ModelEvent,
  AgentEvent,
  BaseEvent,
  ScopeCreatedEvent,
  ScopeUpdatedEvent,
  ScopeDeletedEvent,
  FinalityChangedEvent,
  FinalityNearFinalEvent,
  FinalityFinalEvent,
  VetoActivatedEvent,
  VetoLiftedEvent,
  ClaimAddedEvent,
  DriftDetectedEvent,
  ContradictionDetectedEvent,
  ContradictionResolvedEvent,
  RiskIdentifiedEvent,
  DocumentIndexedEvent,
  EpochCompletedEvent,
  ModelConnectedEvent,
  ModelRevokedEvent,
  AgentHeartbeatEvent,
  AgentTaskStartedEvent,
  AgentTaskCompletedEvent,
  AgentTaskFailedEvent,
} from "./events/schema.js";
export { createBaseEvent, EventValidationError } from "./events/schema.js";
export {
  tok,
  assertOwnedByTenant,
  subjects,
  allTenantSubjects,
  auditStreamName,
  scopeStreamName,
  SGRS_PREFIX,
  sanitiseDurable,
} from "./events/subjects.js";

// REST schema types
export * from "./schema.js";
