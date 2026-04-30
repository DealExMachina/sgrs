/**
 * SGRS NATS subject hierarchy.
 *
 * Format:  sgrs.{category}.{tenant}.{id}.{event}
 *
 * NATS wildcard operators:
 *   *   single token  (e.g. sgrs.scope.acme.*.finality.final)
 *   >   one-or-more   (e.g. sgrs.scope.acme.> — all events for tenant)
 *
 * Tenant isolation: subjects are namespaced per tenant.
 * For hard multi-tenant isolation use NATS Accounts instead
 * (one account per tenant, no cross-account visibility).
 */

export const SGRS_PREFIX = "sgrs" as const;

/** Sanitise a tenant/id token — NATS subjects must not contain spaces or > * . */
export function sanitise(value: string): string {
  return value.replace(/[\s.*>]/g, "_");
}

export const subjects = {
  // ── Scope subjects ─────────────────────────────────────────────────────────

  scope: {
    created: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.created`,

    updated: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.updated`,

    deleted: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.deleted`,

    finalityChanged: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.finality.changed`,

    finalityNearFinal: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.finality.near-final`,

    /** Terminal — triggers certificate issuance and archival */
    finalityFinal: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.finality.final`,

    /** CRITICAL PATH — propagate immediately to all agents */
    vetoActivated: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.veto.activated`,

    vetoLifted: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.veto.lifted`,

    // ── Subscription wildcards ────────────────────────────────────────────────

    /** All events for a single scope */
    allFor: (tenant: string, scopeId: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.${sanitise(scopeId)}.>`,

    /** All scope events for a tenant */
    allScopes: (tenant: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.>`,

    /** All finality events across all scopes for a tenant */
    allFinality: (tenant: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.*.finality.>`,

    /** All veto events — subscribe to this for swarm halt logic */
    allVetos: (tenant: string) =>
      `${SGRS_PREFIX}.scope.${sanitise(tenant)}.*.veto.>`,
  },

  // ── Model subjects ──────────────────────────────────────────────────────────

  model: {
    connected: (tenant: string, handle: string) =>
      `${SGRS_PREFIX}.model.${sanitise(tenant)}.${sanitise(handle)}.connected`,

    revoked: (tenant: string, handle: string) =>
      `${SGRS_PREFIX}.model.${sanitise(tenant)}.${sanitise(handle)}.revoked`,

    allModels: (tenant: string) =>
      `${SGRS_PREFIX}.model.${sanitise(tenant)}.>`,
  },

  // ── Agent subjects ──────────────────────────────────────────────────────────

  agent: {
    heartbeat: (tenant: string, agentId: string) =>
      `${SGRS_PREFIX}.agent.${sanitise(tenant)}.${sanitise(agentId)}.heartbeat`,

    taskStarted: (tenant: string, agentId: string) =>
      `${SGRS_PREFIX}.agent.${sanitise(tenant)}.${sanitise(agentId)}.task.started`,

    taskCompleted: (tenant: string, agentId: string) =>
      `${SGRS_PREFIX}.agent.${sanitise(tenant)}.${sanitise(agentId)}.task.completed`,

    taskFailed: (tenant: string, agentId: string) =>
      `${SGRS_PREFIX}.agent.${sanitise(tenant)}.${sanitise(agentId)}.task.failed`,

    /**
     * Queue-group subject for agent work distribution.
     * NATS delivers each message to exactly ONE subscriber in the group.
     * Use with `{ queue: "workers" }` subscription option.
     */
    queue: (tenant: string, taskType: string) =>
      `${SGRS_PREFIX}.agent.queue.${sanitise(tenant)}.${sanitise(taskType)}`,

    allAgents: (tenant: string) =>
      `${SGRS_PREFIX}.agent.${sanitise(tenant)}.>`,
  },

  // ── Audit subjects (JetStream persistent) ───────────────────────────────────

  audit: {
    /** All events — full audit trail for compliance */
    all: (tenant: string) =>
      `${SGRS_PREFIX}.audit.${sanitise(tenant)}.>`,

    scopes: (tenant: string) =>
      `${SGRS_PREFIX}.audit.${sanitise(tenant)}.scope.>`,

    models: (tenant: string) =>
      `${SGRS_PREFIX}.audit.${sanitise(tenant)}.model.>`,

    agents: (tenant: string) =>
      `${SGRS_PREFIX}.audit.${sanitise(tenant)}.agent.>`,
  },
} as const;

// ── JetStream stream names ────────────────────────────────────────────────────

function streamKey(tenant: string): string {
  return tenant.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** JetStream stream covering all audit events for a tenant (7-year retention) */
export function auditStreamName(tenant: string): string {
  return `SGRS_AUDIT_${streamKey(tenant)}`;
}

/** JetStream stream covering all scope events for a tenant */
export function scopeStreamName(tenant: string): string {
  return `SGRS_SCOPE_${streamKey(tenant)}`;
}
