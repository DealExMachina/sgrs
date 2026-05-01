"""SGRS NATS subject hierarchy.

Structure:  sgrs.{category}.{tenant}.{id}.{event}

Lexical rules for every subject token mirror ``TenantId`` / scope slugs from the
REST API schema: lowercase ``[a-z0-9]+`` optionally separated by single hyphens
(no underscores, uppercase, dots, shell wildcards, or leading/trailing hyphen).

Security: :func:`tok` validates rather than “best-effort” sanitizing, so malformed
identifiers fail fast instead of collapsing into ambiguous NATS namespaces.
"""

from __future__ import annotations

import re

SGRS_PREFIX = "sgrs"

_SLUG_LOWERCASE = re.compile(r"^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$")
_MAX_NATSTOKEN_LEN = 120
_MAX_TENANT_SLUG_LEN = 64

_TOK_SAN_RE = re.compile(r"[^A-Za-z0-9\-_]")  # durable consumer sanitisation


def tok(value: str) -> str:
    """Validate *value* for use as one dot-separated NATS subject token.

    Raises:
        ValueError: on empty/invalid slug or overly long tokens.
    """
    t = value.strip()
    if not t:
        raise ValueError(
            f"NATS subject token must not be empty (got: {value!r})",
        )
    if len(t) > _MAX_NATSTOKEN_LEN:
        raise ValueError(
            f"NATS subject token too long (max {_MAX_NATSTOKEN_LEN} chars): "
            f"{value[:24]!r}…",
        )
    if not _SLUG_LOWERCASE.fullmatch(t):
        raise ValueError(
            "Invalid NATS subject token: use lowercase a-z, digits, and hyphens "
            f"(no underscores or uppercase): {value!r}",
        )
    return t


def assert_owned_by_tenant(subject: str, tenant: str) -> None:
    """Assert that *subject* is within *tenant*'s namespace.

    Raises:
        ValueError: if subject belongs to a different tenant.
    """
    parts = subject.split(".")
    tenant_token = tok(tenant)
    if len(parts) < 3 or parts[2] != tenant_token:
        raise ValueError(
            f"[SECURITY] Subject {subject!r} does not belong to tenant "
            f"{tenant!r}. Cross-tenant publish rejected.",
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
        return (
            f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.changed"
        )

    def finality_near_final(self, tenant: str, scope_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.near-final"
        )

    def finality_final(self, tenant: str, scope_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.finality.final"
        )

    def veto_activated(self, tenant: str, scope_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.scope.{tok(tenant)}.{tok(scope_id)}.veto.activated"
        )

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
        return (
            f"{SGRS_PREFIX}.model.{tok(tenant)}.{tok(handle)}.connected"
        )

    def revoked(self, tenant: str, handle: str) -> str:
        return f"{SGRS_PREFIX}.model.{tok(tenant)}.{tok(handle)}.revoked"

    def all_models(self, tenant: str) -> str:
        return f"{SGRS_PREFIX}.model.{tok(tenant)}.>"


class _AgentSubjects:
    def heartbeat(self, tenant: str, agent_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.heartbeat"
        )

    def task_started(self, tenant: str, agent_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.started"
        )

    def task_completed(self, tenant: str, agent_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.completed"
        )

    def task_failed(self, tenant: str, agent_id: str) -> str:
        return (
            f"{SGRS_PREFIX}.agent.{tok(tenant)}.{tok(agent_id)}.task.failed"
        )

    def queue(self, tenant: str, task_type: str) -> str:
        return (
            f"{SGRS_PREFIX}.agent.queue.{tok(tenant)}.{tok(task_type)}"
        )

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
    return [
        subjects.scope.all_scopes(tenant),
        subjects.model.all_models(tenant),
        subjects.agent.all_agents(tenant),
    ]


def _stream_key(tenant: str) -> str:
    t = tenant.strip()
    if not t:
        raise ValueError(f"Cannot derive stream name from empty tenant: {tenant!r}")
    if len(t) > _MAX_TENANT_SLUG_LEN:
        raise ValueError(f"Invalid tenant for stream name: {tenant!r}")
    if not _SLUG_LOWERCASE.fullmatch(t):
        raise ValueError(f"Invalid tenant for stream name: {tenant!r}")
    return re.sub(r"[^A-Z0-9]", "_", t.upper())


def audit_stream_name(tenant: str) -> str:
    return f"SGRS_AUDIT_{_stream_key(tenant)}"


def scope_stream_name(tenant: str) -> str:
    return f"SGRS_SCOPE_{_stream_key(tenant)}"


def sanitise_durable(value: str) -> str:
    if not value or not value.strip():
        raise ValueError(
            f"JetStream durable consumer name must not be empty (got: {value!r})",
        )
    return _TOK_SAN_RE.sub("_", value)[:128]
