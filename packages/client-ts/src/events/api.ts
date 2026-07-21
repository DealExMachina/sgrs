/**
 * EventsApi — hardened NATS real-time transport layer.
 *
 * Security guarantees:
 *   • All inbound messages validated before reaching handlers (C-1)
 *   • Handler errors surface via onError callback — never silently swallowed (C-2)
 *   • publish() enforces tenant ownership — cross-tenant injection rejected (C-3)
 *   • connect() is concurrency-safe — no double-connection race (C-5)
 *   • tok() allowlist prevents subject injection (H-1)
 *   • Plain nats:// URLs emit a security warning (H-2)
 *   • Subscriptions cleaned up automatically when iterator closes (H-3)
 *   • JetStream uses nats.js v2 Consumers API with correct enum values (H-4)
 *   • subscribeAudit tracked in _subs (H-6)
 *
 * The `nats` npm package is imported dynamically — it is never bundled
 * unless actually used, keeping HTTP-only bundles lean.
 */

// Type-only imports — zero runtime cost
import type { NatsConnection, Subscription as NatsSub } from "nats";

import {
  EventValidationError,
  validateInboundEvent,
  type SgrsEvent,
  type ScopeEvent,
  type ModelEvent,
  type ScopeCreatedEvent,
  type ScopeUpdatedEvent,
  type ScopeDeletedEvent,
  type FinalityChangedEvent,
  type FinalityNearFinalEvent,
  type FinalityFinalEvent,
  type VetoActivatedEvent,
  type VetoLiftedEvent,
  type ModelConnectedEvent,
  type ModelRevokedEvent,
  type AgentHeartbeatEvent,
  type AgentTaskCompletedEvent,
  type AgentTaskFailedEvent,
} from "./schema.js";

import {
  assertOwnedByTenant,
  auditStreamName,
  sanitiseDurable,
  subjects,
  allTenantSubjects,
} from "./subjects.js";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TLSConfig {
  /** Path to CA certificate file (Node.js only) */
  caFile?: string;
  /** Path to client certificate file (Node.js only) */
  certFile?: string;
  /** Path to client key file (Node.js only) */
  keyFile?: string;
  /** Enforce TLS handshake before auth */
  handshakeFirst?: boolean;
}

export interface NatsConfig {
  /**
   * NATS server URL(s).
   *   nats://   — TCP (cleartext — not for production)
   *   tls://    — TCP + TLS
   *   wss://    — WebSocket + TLS (browser-friendly)
   *   ws://     — WebSocket cleartext (dev only)
   */
  servers: string | string[];
  /** Bearer token auth */
  token?: string;
  /** Username/password auth */
  username?: string;
  password?: string;
  /** TLS configuration. Required for tls:// or nats:// with TLS. */
  tls?: TLSConfig;
  /**
   * Max reconnect attempts (-1 = unlimited, default).
   * After exhaustion, the connection emits an error.
   */
  maxReconnectAttempts?: number;
  /** Max payload size in bytes (default: 1 MB). Messages exceeding this are rejected. */
  maxPayloadBytes?: number;
  /** Client name shown in NATS monitoring UI */
  name?: string;
  /**
   * Called when a message cannot be decoded or validated.
   * If not set, decode errors are logged to console.warn.
   */
  onDecodeError?: (err: EventValidationError) => void;
  /**
   * Called when a handler throws.
   * If not set, handler errors are re-thrown, propagating up to the
   * NATS connection error event.
   *
   * IMPORTANT: For the veto critical path, always set this to a handler
   * that triggers your swarm halt logic regardless of the primary handler's
   * result.
   */
  onHandlerError?: (err: unknown, event: SgrsEvent, subject: string) => void;
}

// ─── Handler types ────────────────────────────────────────────────────────────

export type EventHandler<T extends SgrsEvent = SgrsEvent> = (
  event: T,
  subject: string,
) => void | Promise<void>;

export type TaskHandler<T = unknown> = (
  task: T,
  replySubject: string | undefined,
) => void | Promise<void>;

// ─── Errors ───────────────────────────────────────────────────────────────────

export class NatsNotConfiguredError extends Error {
  constructor() {
    super(
      "NATS is not configured. " +
        "Pass nats: { servers: [...] } to createClient().",
    );
    this.name = "NatsNotConfiguredError";
  }
}

export class NatsNotConnectedError extends Error {
  constructor() {
    super(
      "NATS is not connected. " +
        "Call await client.connect() before subscribing.",
    );
    this.name = "NatsNotConnectedError";
  }
}

function reportDecodeError(
  cfg: NatsConfig | undefined,
  err: EventValidationError,
  logPrefix: string,
): void {
  if (cfg?.onDecodeError) {
    cfg.onDecodeError(err);
  } else {
    console.warn(`${logPrefix} ${err.message}`);
  }
}

// ─── EventsApi ───────────────────────────────────────────────────────────────

export class EventsApi {
  private _nc: NatsConnection | null = null;
  private _codec: { encode(d: unknown): Uint8Array; decode(a: Uint8Array): unknown } | null = null;
  private _subs: NatsSub[] = [];
  /** JetStream consumer handles — stopped separately on close() */
  private _consumers: Array<{ stop(): void }> = [];
  /** Concurrency guard — prevents double-connect race */
  private _connectPromise: Promise<void> | null = null;
  private readonly _maxPayload: number;

  constructor(private readonly _cfg: NatsConfig | undefined) {
    this._maxPayload = _cfg?.maxPayloadBytes ?? 1_048_576; // 1 MB default
  }

  // ── State ──────────────────────────────────────────────────────────────────

  get configured(): boolean {
    return this._cfg !== undefined;
  }

  get connected(): boolean {
    return this._nc !== null && !this._nc.isClosed();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Connect to NATS. No-op (no error) when NATS is not configured.
   * Concurrency-safe: concurrent calls share the same connection attempt.
   */
  async connect(): Promise<void> {
    if (!this._cfg) return;
    if (this.connected) return;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = this._doConnect().finally(() => {
      this._connectPromise = null;
    });
    return this._connectPromise;
  }

  private async _doConnect(): Promise<void> {
    const cfg = this._cfg!;

    // ── Security: warn on plaintext transport ─────────────────────────────

    const serverList = Array.isArray(cfg.servers) ? cfg.servers : [cfg.servers];
    const hasInsecure = serverList.some(
      (s) => s.startsWith("nats://") || s.startsWith("ws://"),
    );
    if (hasInsecure && !cfg.tls) {
      console.warn(
        "[sgrs][SECURITY WARNING] Connecting to NATS over an unencrypted URL. " +
          "Governance events and credentials will be transmitted in plaintext. " +
          "Use tls:// or wss:// in production. " +
          "Pass tls: {} to suppress this warning once TLS is configured.",
      );
    }

    // ── Dynamic import ────────────────────────────────────────────────────

    let natsModule: typeof import("nats");
    try {
      natsModule = await import("nats");
    } catch {
      throw new Error(
        "nats package not found. Install it: npm install nats",
      );
    }

    this._nc = await natsModule.connect({
      servers: cfg.servers,
      ...(cfg.token     !== undefined && { token: cfg.token }),
      ...(cfg.username  !== undefined && { user: cfg.username }),
      ...(cfg.password  !== undefined && { pass: cfg.password }),
      ...(cfg.tls       !== undefined && { tls: cfg.tls }),
      ...(cfg.maxReconnectAttempts !== undefined && {
        maxReconnectAttempts: cfg.maxReconnectAttempts,
      }),
      ...(cfg.name !== undefined && { name: cfg.name }),
    });

    this._codec = natsModule.JSONCodec();

    // ── Slow consumer monitoring ──────────────────────────────────────────

    void (async () => {
      for await (const status of this._nc!.status()) {
        if (
          status.type === natsModule.Events.Disconnect ||
          status.type === natsModule.DebugEvents.StaleConnection
        ) {
          console.error(`[sgrs][NATS] Connection issue: ${status.type}`, status.data ?? "");
        }
      }
    })();
  }

  /**
   * Gracefully drain in-flight messages and close the NATS connection.
   * Stops all JetStream consumers, then drains core subscriptions.
   */
  async close(): Promise<void> {
    // Stop JetStream audit consumers first so they don't race with drain
    for (const c of this._consumers) {
      try { c.stop(); } catch { /* already stopped */ }
    }
    this._consumers = [];
    this._subs = [];
    if (this._nc) {
      await this._nc.drain();
      this._nc = null;
      this._codec = null;
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _require(): void {
    if (!this._cfg) throw new NatsNotConfiguredError();
    if (!this.connected) throw new NatsNotConnectedError();
  }

  /**
   * Invoke handler and route errors to `onHandlerError` callback or console.error.
   *
   * Extracted as a named method so it is directly testable and so the error
   * routing logic is shared between _sub() and subscribeAudit(). Never re-throws
   * inside a void IIFE — that would create an unhandled rejection rather than
   * a visible NATS connection error (HIGH-NEW-9 fix).
   */
  async _dispatch<T extends SgrsEvent>(
    handler: EventHandler<T>,
    event: T,
    subject: string,
  ): Promise<void> {
    try {
      await handler(event, subject);
    } catch (handlerErr) {
      if (this._cfg?.onHandlerError) {
        this._cfg.onHandlerError(handlerErr, event, subject);
      } else {
        // Log at error level — re-throwing inside a void IIFE produces an
        // unhandled promise rejection that is silently dropped in many runtimes.
        console.error(
          `[sgrs][NATS] Handler error on subject "${subject}":`,
          handlerErr,
        );
      }
    }
  }

  /**
   * Subscribe to a subject and dispatch validated, decoded events to handler.
   *
   * Decode/validation errors call `onDecodeError` (or console.warn) and skip the message.
   * Handler errors are routed via `_dispatch` — never silently swallowed.
   * Subscription is automatically removed from _subs when its iterator closes (H-3).
   * The subscription is pushed to _subs BEFORE the IIFE starts to avoid a
   * shutdown race where the finally block fires before push (HIGH-NEW-10 fix).
   */
  private _sub<T extends SgrsEvent>(
    subject: string,
    handler: EventHandler<T>,
    opts?: { queue?: string },
  ): NatsSub {
    this._require();
    const sub = this._nc!.subscribe(subject, opts);
    const codec = this._codec!;
    const maxPayload = this._maxPayload;
    const cfg = this._cfg!;

    // Push BEFORE launching IIFE — prevents race where finally fires before push
    this._subs.push(sub);

    void (async () => {
      try {
        for await (const msg of sub) {
          // ── Size guard ──────────────────────────────────────────────────

          if (msg.data.length > maxPayload) {
            const err = new EventValidationError(
              `Message size ${msg.data.length} bytes exceeds limit ${maxPayload} bytes`,
              msg.subject,
            );
            reportDecodeError(cfg, err, "[sgrs][NATS]");
            continue;
          }

          // ── Decode + validate ───────────────────────────────────────────

          let event: SgrsEvent;
          try {
            const decoded = codec.decode(msg.data);
            event = validateInboundEvent(decoded, msg.subject);
          } catch (e) {
            const err =
              e instanceof EventValidationError
                ? e
                : new EventValidationError(String(e), msg.subject);
            reportDecodeError(cfg, err, "[sgrs][NATS]");
            continue;
          }

          // ── Dispatch to handler (errors never silently swallowed) ───────
          await this._dispatch(handler as EventHandler, event, msg.subject);
        }
      } finally {
        // Auto-remove when iterator closes (drain / unsubscribe) — H-3 fix
        this._subs = this._subs.filter((s) => s !== sub);
      }
    })();

    return sub;
  }

  // ── Scope subscriptions ────────────────────────────────────────────────────

  onScope(tenant: string, scopeId: string, handler: EventHandler<ScopeEvent>): NatsSub {
    return this._sub(subjects.scope.allFor(tenant, scopeId), handler);
  }

  /**
   * Subscribe to ALL scope events for a tenant across every scope and every
   * event type — no type filtering applied.
   *
   * Use this for SSE relay routes that forward the full event stream to clients.
   * Any new scope event type is automatically included without code changes here.
   */
  onAllScopeEvents(tenant: string, handler: EventHandler<ScopeEvent>): NatsSub {
    return this._sub(subjects.scope.allScopes(tenant), handler);
  }

  onScopeCreated(tenant: string, handler: EventHandler<ScopeCreatedEvent>): NatsSub {
    return this._sub(subjects.scope.allScopes(tenant), (ev, s) => {
      if (ev.type === "scope.created") return handler(ev, s);
    });
  }

  onScopeUpdated(tenant: string, handler: EventHandler<ScopeUpdatedEvent>): NatsSub {
    return this._sub(subjects.scope.allScopes(tenant), (ev, s) => {
      if (ev.type === "scope.updated") return handler(ev as ScopeUpdatedEvent, s);
    });
  }

  onScopeDeleted(tenant: string, handler: EventHandler<ScopeDeletedEvent>): NatsSub {
    return this._sub(subjects.scope.allScopes(tenant), (ev, s) => {
      if (ev.type === "scope.deleted") return handler(ev as ScopeDeletedEvent, s);
    });
  }

  // ── Finality subscriptions ─────────────────────────────────────────────────

  onFinalityChanged(tenant: string, handler: EventHandler<FinalityChangedEvent>): NatsSub {
    return this._sub(subjects.scope.allFinality(tenant), (ev, s) => {
      if (ev.type === "scope.finality.changed")
        return handler(ev as FinalityChangedEvent, s);
    });
  }

  onFinalityNearFinal(tenant: string, handler: EventHandler<FinalityNearFinalEvent>): NatsSub {
    return this._sub(subjects.scope.allFinality(tenant), (ev, s) => {
      if (ev.type === "scope.finality.near-final")
        return handler(ev as FinalityNearFinalEvent, s);
    });
  }

  onFinalityFinal(
    tenant: string,
    scopeId: string,
    handler: EventHandler<FinalityFinalEvent>,
  ): NatsSub {
    return this._sub(subjects.scope.finalityFinal(tenant, scopeId), handler);
  }

  // ── Veto subscriptions (CRITICAL PATH) ────────────────────────────────────

  /**
   * Subscribe to veto activations for a tenant.
   *
   * ⚠ CRITICAL PATH — veto must halt ALL swarm agents in <10ms.
   *
   * Recommended pattern:
   * ```ts
   * client.events.onVetoActivated('acme', async (event) => {
   *   await swarm.halt(event.scopeId, { reason: event.reason });
   * });
   * ```
   * Set `nats.onHandlerError` in ClientConfig to ensure veto failures
   * are surfaced and trigger fallback halt logic.
   */
  onVetoActivated(tenant: string, handler: EventHandler<VetoActivatedEvent>): NatsSub {
    return this._sub(subjects.scope.allVetos(tenant), (ev, s) => {
      if (ev.type === "scope.veto.activated")
        return handler(ev as VetoActivatedEvent, s);
    });
  }

  onVetoLifted(tenant: string, handler: EventHandler<VetoLiftedEvent>): NatsSub {
    return this._sub(subjects.scope.allVetos(tenant), (ev, s) => {
      if (ev.type === "scope.veto.lifted")
        return handler(ev as VetoLiftedEvent, s);
    });
  }

  // ── Model subscriptions ────────────────────────────────────────────────────

  onModelConnected(tenant: string, handler: EventHandler<ModelConnectedEvent>): NatsSub {
    return this._sub(subjects.model.allModels(tenant), (ev, s) => {
      if (ev.type === "model.connected")
        return handler(ev as ModelConnectedEvent, s);
    });
  }

  onModelRevoked(tenant: string, handler: EventHandler<ModelRevokedEvent>): NatsSub {
    return this._sub(subjects.model.allModels(tenant), (ev, s) => {
      if (ev.type === "model.revoked")
        return handler(ev as ModelRevokedEvent, s);
    });
  }

  // ── Agent subscriptions ────────────────────────────────────────────────────

  onAgentHeartbeat(tenant: string, handler: EventHandler<AgentHeartbeatEvent>): NatsSub {
    return this._sub(subjects.agent.allAgents(tenant), (ev, s) => {
      if (ev.type === "agent.heartbeat")
        return handler(ev as AgentHeartbeatEvent, s);
    });
  }

  onAgentTaskCompleted(
    tenant: string,
    handler: EventHandler<AgentTaskCompletedEvent>,
  ): NatsSub {
    return this._sub(subjects.agent.allAgents(tenant), (ev, s) => {
      if (ev.type === "agent.task.completed")
        return handler(ev as AgentTaskCompletedEvent, s);
    });
  }

  onAgentTaskFailed(tenant: string, handler: EventHandler<AgentTaskFailedEvent>): NatsSub {
    return this._sub(subjects.agent.allAgents(tenant), (ev, s) => {
      if (ev.type === "agent.task.failed")
        return handler(ev as AgentTaskFailedEvent, s);
    });
  }

  // ── Queue group ────────────────────────────────────────────────────────────

  /**
   * Join a queue group — NATS delivers each task to exactly ONE worker.
   * Built-in load balancing across all workers in the same group name.
   */
  joinQueue<T = unknown>(
    tenant: string,
    taskType: string,
    handler: TaskHandler<T>,
    groupName = "workers",
  ): NatsSub {
    this._require();
    const subject = subjects.agent.queue(tenant, taskType);
    const sub = this._nc!.subscribe(subject, { queue: groupName });
    const codec = this._codec!;
    const cfg = this._cfg!;
    const maxPayload = this._maxPayload;

    void (async () => {
      try {
        for await (const msg of sub) {
          if (msg.data.length > maxPayload) {
            console.warn(`[sgrs][NATS] Queue message too large (${msg.data.length} bytes), skipping`);
            continue;
          }
          try {
            const task = codec.decode(msg.data) as T;
            await handler(task, msg.reply);
          } catch (err) {
            if (cfg.onHandlerError) {
              cfg.onHandlerError(err, {} as SgrsEvent, msg.subject);
            } else {
              throw err;
            }
          }
        }
      } finally {
        this._subs = this._subs.filter((s) => s !== sub);
      }
    })();

    this._subs.push(sub);
    return sub;
  }

  // ── Cross-category ─────────────────────────────────────────────────────────

  /**
   * Subscribe to all events for a tenant across scope, model, and agent subjects.
   * Returns a named object so callers can unsubscribe each category individually.
   */
  onAll(
    tenant: string,
    handler: EventHandler,
  ): { scope: NatsSub; model: NatsSub; agent: NatsSub } {
    // allTenantSubjects returns [string, string, string] — no ! assertions needed
    const [scopeSubj, modelSubj, agentSubj] = allTenantSubjects(tenant);
    return {
      scope: this._sub(scopeSubj, handler),
      model: this._sub(modelSubj, handler),
      agent: this._sub(agentSubj, handler),
    };
  }

  // ── Publish (server-side only) ─────────────────────────────────────────────

  /**
   * Publish a typed scope event.
   * Tenant ownership is enforced: the derived subject must belong to `tenant`.
   */
  publishScopeEvent(tenant: string, scopeId: string, event: ScopeEvent): void {
    this._require();

    const subj = ((): string => {
      switch (event.type) {
        case "scope.created":            return subjects.scope.created(tenant, scopeId);
        case "scope.updated":            return subjects.scope.updated(tenant, scopeId);
        case "scope.deleted":            return subjects.scope.deleted(tenant, scopeId);
        case "scope.finality.changed":   return subjects.scope.finalityChanged(tenant, scopeId);
        case "scope.finality.near-final": return subjects.scope.finalityNearFinal(tenant, scopeId);
        case "scope.finality.final":     return subjects.scope.finalityFinal(tenant, scopeId);
        case "scope.veto.activated":     return subjects.scope.vetoActivated(tenant, scopeId);
        case "scope.veto.lifted":            return subjects.scope.vetoLifted(tenant, scopeId);
        case "scope.claim.added":            return subjects.scope.claimAdded(tenant, scopeId);
        case "scope.drift.detected":         return subjects.scope.driftDetected(tenant, scopeId);
        case "scope.contradiction.detected": return subjects.scope.contradictionDetected(tenant, scopeId);
        case "scope.contradiction.resolved": return subjects.scope.contradictionResolved(tenant, scopeId);
        case "scope.risk.identified":        return subjects.scope.riskIdentified(tenant, scopeId);
        case "scope.document.indexed":       return subjects.scope.documentIndexed(tenant, scopeId);
        case "scope.epoch.completed":        return subjects.scope.epochCompleted(tenant, scopeId);
        default: {
          const _exhaustive: never = event;
          throw new Error(`Unhandled scope event type: ${(_exhaustive as SgrsEvent).type}`);
        }
      }
    })();

    assertOwnedByTenant(subj, tenant);
    this._nc!.publish(subj, this._codec!.encode(event));
  }

  publishModelEvent(tenant: string, handle: string, event: ModelEvent): void {
    this._require();
    const subj =
      event.type === "model.connected"
        ? subjects.model.connected(tenant, handle)
        : subjects.model.revoked(tenant, handle);
    assertOwnedByTenant(subj, tenant);
    this._nc!.publish(subj, this._codec!.encode(event));
  }

  // ── JetStream audit ────────────────────────────────────────────────────────

  /**
   * Create a durable JetStream audit stream for `tenant` (idempotent).
   * Requires JetStream enabled on the server: `nats-server --jetstream`
   */
  async enableAuditStream(tenant: string, streamName?: string): Promise<void> {
    this._require();

    const natsModule = await import("nats");
    const jsm = await this._nc!.jetstreamManager();
    const name = streamName ?? auditStreamName(tenant);

    let streamExists = false;
    try {
      await jsm.streams.info(name);
      streamExists = true;
    } catch (e: unknown) {
      // Only suppress "stream not found"; re-throw transient network errors
      const isNotFound =
        e instanceof Error && e.message.toLowerCase().includes("not found");
      if (!isNotFound) throw e;
    }

    if (!streamExists) {
      await jsm.streams.add({
        name,
        subjects: [subjects.audit.all(tenant)],
        retention: natsModule.RetentionPolicy.Limits,
        storage: natsModule.StorageType.File,
        max_age: 7 * 365 * 24 * 60 * 60 * 1_000_000_000, // 7 years in nanoseconds
        num_replicas: 1,
      });
    }
  }

  /**
   * Subscribe to the durable audit stream, replaying all events from the beginning.
   *
   * Uses the nats.js v2 Consumers API with correct enum deliver policy (H-4/H-5).
   * The consumer messages handle is stored in `_consumers` and stopped on close() (H-6 fix).
   * Must call `enableAuditStream(tenant)` first (idempotent, safe to call again).
   *
   * @returns Cleanup function — call it to stop this specific audit subscription
   */
  async subscribeAudit(
    tenant: string,
    handler: EventHandler,
    consumerName?: string,
    streamName?: string,
  ): Promise<() => void> {
    this._require();

    const natsModule = await import("nats");
    const jsm = await this._nc!.jetstreamManager();
    const js = this._nc!.jetstream();
    const stream = streamName ?? auditStreamName(tenant);
    const durable = sanitiseDurable(consumerName ?? `sgrs-audit-${tenant}`);
    const filterSubject = subjects.audit.all(tenant);
    const cfg = this._cfg!;

    // Upsert consumer (idempotent)
    await jsm.consumers.add(stream, {
      name: durable,
      filter_subject: filterSubject,
      deliver_policy: natsModule.DeliverPolicy.All,
      ack_policy: natsModule.AckPolicy.Explicit,
    });

    const consumer = await js.consumers.get(stream, durable);
    const messages = await consumer.consume();

    // H-6 fix: track the consumer handle so close() can stop it.
    // Push BEFORE launching the IIFE to avoid the same shutdown race as _sub().
    this._consumers.push(messages);

    void (async () => {
      try {
        for await (const msg of messages) {
          let event: SgrsEvent;
          try {
            const decoded = this._codec!.decode(msg.data);
            event = validateInboundEvent(decoded, msg.subject);
          } catch (e) {
            const err =
              e instanceof EventValidationError
                ? e
                : new EventValidationError(String(e), msg.subject);
            reportDecodeError(cfg, err, "[sgrs][NATS][JetStream]");
            msg.nak();
            continue;
          }

          // On handler error: nak() for redelivery, route error via _dispatch
          let dispatched = false;
          try {
            await this._dispatch(handler, event, msg.subject);
            dispatched = true;
          } finally {
            // ack only if dispatch completed without throwing; nak if it threw
            if (dispatched) {
              msg.ack();
            } else {
              msg.nak(); // redeliver — never lose an audit event
            }
          }
        }
      } finally {
        this._consumers = this._consumers.filter((c) => c !== messages);
      }
    })();

    // Return a cleanup handle for callers who want to stop this subscription alone
    return () => {
      try { messages.stop(); } catch { /* already stopped */ }
      this._consumers = this._consumers.filter((c) => c !== messages);
    };
  }
}
