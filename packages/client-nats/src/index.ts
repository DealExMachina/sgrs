/**
 * Compatibility entrypoint for the legacy @sgrs/client-nats package.
 *
 * The canonical NATS implementation now lives in @sgrs/client-ts/events so
 * HTTP clients and event clients share one event schema and subject hierarchy.
 */

export {
  EventsApi,
  NatsNotConfiguredError,
  NatsNotConnectedError,
} from "@sgrs/client-ts/events";
export type {
  EventHandler,
  NatsConfig,
  TaskHandler,
} from "@sgrs/client-ts/events";
export {
  EventValidationError,
  createBaseEvent,
} from "@sgrs/client-ts";
export type {
  AgentEvent,
  BaseEvent,
  ModelEvent,
  ScopeEvent,
  SgrsEvent,
} from "@sgrs/client-ts";
export {
  allTenantSubjects,
  auditStreamName,
  scopeStreamName,
  subjects,
} from "@sgrs/client-ts";
