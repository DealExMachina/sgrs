"""SGRS NATS subject hierarchy.

Structure:  sgrs.{category}.{tenant}.{id}.{event}

NATS wildcards:
  *  — exactly one token   e.g. sgrs.scope.acme.*.finality.final
  >  — one or more tokens  e.g. sgrs.scope.acme.>

Security: tok() uses an allowlist ([A-Za-z0-9\\-_]) and throws on empty
input or tokens exceeding 128 characters, preventing subject injection.
"""

from __future__ import annotations

import re

SGRS_PREFIX = "sgrs"

# Compiled once at module load — no per-call import overhead (L-3 fix)
_TOK_RE = re.compile(r"[^A-Za-z0-9\-_]")
_STREAM_KEY_RE = re.compile(r"[^A-Z0-9_]")


def tok(value: str) -> str:
    """Sanitise a value for use as a NATS subject token.

    Allowlist: [A-Za-z0-9\\-_]. All other characters are replaced with "_".

    Raises:
        ValueError: on empty string or tokens exceeding 128 characters.
    """
    if not value or not value.strip():
        raise ValueError(
            f"NATS subject token must not be empty (got: {value!r})"
        )
    sanitised = _TOK_RE.sub("_", value)
    if len(sanitised) > 128:
        raise ValueError(
            f"NATS subject token too long (max 128 chars): {value[:32]!r}..."
        )
    return sanitised


def assert_owned_by_tenant(subject: str, tenant: str) -> None:
    """Assert that *subject* is within *tenant*'s namespace.

    Subject structure: sgrs.{category}.{tenant}.{id}.{event}
    The tenant token is at parts[2].

    Raises:
        ValueError: if subject belongs to a different tenant.
    """
    parts = subject.split(".")
    tenant_token = tok(tenant)
    if len(parts) < 3 or parts[2] != tenant_token:
        raise ValueError(
            f"[SECURITY] Subject {subject!r} does not belong to tenant "
            f"{tenant!r}. Cross-tenant publish rejected."
        )


# ─── Subject builders ─────────────────────────────────────────────────────────


class _ScopeSubjects:
    def created(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.created"

    def updated(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.updated"

    def deleted(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.deleted"

    def finality_changed(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.changed"

    def finality_near_final(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.near-final"

    def finality_final(self, tenant: str, scope_id: str) -> str:
        """Terminal convergence subject — triggers archival and cert issuance."""
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.final"

    def veto_activated(self, tenant: str, scope_id: str) -> str:
        """CRITICAL PATH — all swarm agents subscribe here."""
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.veto.activated"

    def veto_lifted(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.veto.lifted"

    # Subscription wildcards

    def all_for(self, tenant: str, scope_id: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.>"

    def all_scopes(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.>"

    def all_finality(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.*.finality.>"

    def all_vetos(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.scope.{tok(tenant)}.*.veto.>"


class _ModelSubjects:
    def connected(self, tenant: str, handle: str) -> str:
        return f"{SGRS_PREFIX}.model.{tok(tenant)}.{tok(handle)}.connected"

    def revoked(self, tenant: str, handle: str) -> str:
        return f"{SGRS_PREFIX}.model.{tok(tenant)}.{tok(handle)}.revoked"

    def all_models(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.model.{tok(tenant)}.>"


class _AgentSubjects:
    def heartbeat(self, tenant: str, agent_id: str) -> str:
        return f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.heartbeat"

    def task_started(self, tenant: str, agent_id: str) -> str:
        return f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.started"

    def task_completed(self, tenant: str, agent_id: str) -> str:
        return f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.completed"

    def task_failed(self, tenant: str, agent_id: str) -> str:
        return f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.failed"

    def queue(self, tenant: str, task_type: str) -> str:
        """Queue-group subject — NATS delivers each task to exactly ONE worker."""
        return f"{SGRS_PREFIX}.agent.queue.{tok(tenant)}.{tok(task_type)}"

    def all_agents(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.agent.{tok(tenant)}.>"


class _AuditSubjects:
    def all(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.audit.{tok(tenant)}.>"

    def scopes(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.audit.{tok(tenant)}.scope.>"

    def models(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.audit.{tok(tenant)}.model.>"

    def agents(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.audit.{tok(tenant)}.agent.>"


class _Subjects:
    scope = _ScopeSubjects()
    model = _ModelSubjects()
    agent = _AgentSubjects()
    audit = _AuditSubjects()


subjects = _Subjects()


def all_tenant_subjects(tenant: str) -> list[str]:
    """All event subjects for a tenant (scope + model + agent)."""
    return [
        subjects.scope.all_scopes(tenant),
        subjects.model.all_models(tenant),
        subjects.agent.all_agents(tenant),
    ]


def _stream_key(tenant: str) -> str:
    key = _STREAM_KEY_RE.sub("_", tenant.upper().replace(" ", "_"))
    if not key:
        raise ValueError(
            f"Cannot derive stream name from empty tenant: {tenant!r}"
        )
    return key


def audit_stream_name(tenant: str) -> str:
    """JetStream stream name for a tenant's full audit log (7-year retention)."""
    return f"SGRS_AUDIT_{_stream_key(tenant)}"


def scope_stream_name(tenant: str) -> str:
    """JetStream stream name for a tenant's scope events."""
    return f"SGRS_SCOPE_{_stream_key(tenant)}"


def sanitise_durable(value: str) -> str:
    """Sanitise a string for use as a JetStream durable consumer name.

    Raises:
        ValueError: on empty or whitespace-only input.
    """
    if not value or not value.strip():
        raise ValueError(
            f"JetStream durable consumer name must not be empty (got: {value!r})"
        )
    return _TOK_RE.sub("_", value)[:128]
