/**
 * SGRS NATS subject hierarchy.
 *
 * Structure:  sgrs.{category}.{tenant}.{id}.{event}
 *
 * NATS wildcard operators:
 *   *  — exactly one token    e.g. sgrs.scope.acme.*.finality.final
 *   >  — one or more tokens   e.g. sgrs.scope.acme.>
 *
 * Tenant isolation: subjects are namespaced per tenant.
 * For hard protocol-level isolation use one NATS Account per tenant.
 */

import { assertNatsSubjectSlug, TenantId } from "@sgrs/api-schema";

export const SGRS_PREFIX = "sgrs";

// ─── Token validation (same lexical rules as TenantId / scope slugs) ──────────

/**
 * Validate a NATS subject token — lowercase kebab-case slug, max length 120.
 *
 * @throws {Error} on empty/whitespace or invalid characters
 */
export function tok(value: string): string {
  return assertNatsSubjectSlug(value);
}

/**
 * Assert that `subject` starts with the expected tenant prefix.
 * Used internally to prevent cross-tenant publish.
 *
 * @throws {Error} if subject is outside the tenant's namespace
 */
export function assertOwnedByTenant(subject: string, tenant: string): void {
  // sgrs.{category}.{tenant}.{rest}
  // Parts[0]=sgrs  [1]=category  [2]=tenantToken
  const parts = subject.split(".");
  const tenantToken = tok(tenant);
  if (parts.length < 3 || parts[2] !== tenantToken) {
    throw new Error(
      `[SECURITY] Subject "${subject}" does not belong to tenant "${tenant}". ` +
        `Cross-tenant publish rejected.`,
    );
  }
}

// ─── Subject builders ─────────────────────────────────────────────────────────

export const subjects = {
  scope: {
    created:           (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.created`,
    updated:           (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.updated`,
    deleted:           (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.deleted`,
    finalityChanged:   (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.finality.changed`,
    finalityNearFinal: (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.finality.near-final`,
    /** Terminal — triggers certificate issuance */
    finalityFinal:     (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.finality.final`,
    /** CRITICAL PATH — must propagate to all swarm agents */
    vetoActivated:     (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.veto.activated`,
    vetoLifted:        (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.veto.lifted`,

    // Governance domain event subjects
    claimAdded:            (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.claim.added`,
    driftDetected:         (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.drift.detected`,
    contradictionDetected: (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.contradiction.detected`,
    contradictionResolved: (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.contradiction.resolved`,
    riskIdentified:        (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.risk.identified`,
    documentIndexed:       (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.document.indexed`,
    epochCompleted:        (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.epoch.completed`,

    // Subscription wildcards
    allFor:            (t: string, s: string) => `${SGRS_PREFIX}.scope.${tok(t)}.${tok(s)}.>`,
    allScopes:         (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.>`,
    allFinality:       (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.finality.>`,
    allVetos:          (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.veto.>`,
    allClaims:         (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.claim.>`,
    allDrifts:         (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.drift.>`,
    allContradictions: (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.contradiction.>`,
    allRisks:          (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.risk.>`,
    allDocuments:      (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.document.>`,
    allEpochs:         (t: string)            => `${SGRS_PREFIX}.scope.${tok(t)}.*.epoch.>`,
  },

  model: {
    connected: (t: string, h: string) => `${SGRS_PREFIX}.model.${tok(t)}.${tok(h)}.connected`,
    revoked:   (t: string, h: string) => `${SGRS_PREFIX}.model.${tok(t)}.${tok(h)}.revoked`,
    allModels: (t: string)            => `${SGRS_PREFIX}.model.${tok(t)}.>`,
  },

  agent: {
    heartbeat:     (t: string, a: string) => `${SGRS_PREFIX}.agent.${tok(t)}.${tok(a)}.heartbeat`,
    taskStarted:   (t: string, a: string) => `${SGRS_PREFIX}.agent.${tok(t)}.${tok(a)}.task.started`,
    taskCompleted: (t: string, a: string) => `${SGRS_PREFIX}.agent.${tok(t)}.${tok(a)}.task.completed`,
    taskFailed:    (t: string, a: string) => `${SGRS_PREFIX}.agent.${tok(t)}.${tok(a)}.task.failed`,
    /** Queue-group — NATS delivers each task to exactly ONE worker in the group */
    queue:         (t: string, taskType: string) => `${SGRS_PREFIX}.agent.queue.${tok(t)}.${tok(taskType)}`,
    allAgents:     (t: string)            => `${SGRS_PREFIX}.agent.${tok(t)}.>`,
  },

  audit: {
    all:    (t: string) => `${SGRS_PREFIX}.audit.${tok(t)}.>`,
    scopes: (t: string) => `${SGRS_PREFIX}.audit.${tok(t)}.scope.>`,
    models: (t: string) => `${SGRS_PREFIX}.audit.${tok(t)}.model.>`,
    agents: (t: string) => `${SGRS_PREFIX}.audit.${tok(t)}.agent.>`,
  },
} as const;

/** All event subjects for a tenant (scope + model + agent).
 *  Returns a fixed-length tuple — destructure safely without `!` assertions.
 */
export function allTenantSubjects(tenant: string): [string, string, string] {
  return [
    subjects.scope.allScopes(tenant),
    subjects.model.allModels(tenant),
    subjects.agent.allAgents(tenant),
  ];
}

// ─── Stream names ─────────────────────────────────────────────────────────────

function streamKey(tenant: string): string {
  if (!tenant || !tenant.trim()) {
    throw new Error(
      `Cannot derive stream name from empty or whitespace-only tenant: ${JSON.stringify(tenant)}`,
    );
  }
  const t = tenant.trim();
  const parsed = TenantId.safeParse(t);
  if (!parsed.success) {
    throw new Error(`Invalid tenant for stream name: ${JSON.stringify(tenant)}`);
  }
  return parsed.data.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** JetStream stream name for a tenant's full audit log (7-year retention) */
export function auditStreamName(tenant: string): string {
  const key = streamKey(tenant); // throws on empty/whitespace
  if (!key) throw new Error(`Cannot derive audit stream name from empty tenant: ${JSON.stringify(tenant)}`);
  return `SGRS_AUDIT_${key}`;
}

/** JetStream stream name for a tenant's scope events */
export function scopeStreamName(tenant: string): string {
  const key = streamKey(tenant); // throws on empty/whitespace
  if (!key) throw new Error(`Cannot derive scope stream name from empty tenant: ${JSON.stringify(tenant)}`);
  return `SGRS_SCOPE_${key}`;
}

/**
 * Sanitise a value for use as a JetStream durable consumer name.
 * @throws {Error} on empty or whitespace-only input
 */
export function sanitiseDurable(value: string): string {
  if (!value || !value.trim()) {
    throw new Error(
      `JetStream durable consumer name must not be empty (got: ${JSON.stringify(value)})`,
    );
  }
  return value.replace(/[^A-Za-z0-9\-_]/g, "_").slice(0, 128);
}
