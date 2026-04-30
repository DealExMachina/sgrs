"""SGRS NATS event schema — Pydantic v2 models.

All governance events carry a BaseEvent envelope discriminated
by the `type` field. Use isinstance() or match/case for dispatch.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from ..schema import Agent, FinalityStatus, ModelHandle, Scope


# ─── Envelope ────────────────────────────────────────────────────────────────


class BaseEvent(BaseModel):
    """Common envelope for all SGRS NATS events.

    Wire format: camelCase JSON (matches the TypeScript SDK schema).
    Python code may use either snake_case or camelCase field names thanks to
    ``populate_by_name=True``. Serialise with ``model_dump(by_alias=True)``
    or use ``publish_scope_event()`` which does this automatically.
    """

    model_config = ConfigDict(
        # Produce camelCase JSON keys on the wire (matches TypeScript SDK)
        alias_generator=to_camel,
        # Accept both snake_case (Python) and camelCase (wire) field names
        populate_by_name=True,
    )

    id: str = Field(description="UUIDv4 unique to this emission")
    timestamp: str = Field(description="ISO 8601 UTC timestamp")
    tenant: str = Field(description="Tenant that owns this event")
    version: Literal["1"] = "1"


# ─── Scope events ─────────────────────────────────────────────────────────────


class ScopeCreatedEvent(BaseEvent):
    type: Literal["scope.created"] = "scope.created"
    scope_id: str
    payload: Scope


class ScopeUpdatedEvent(BaseEvent):
    type: Literal["scope.updated"] = "scope.updated"
    scope_id: str
    payload: Scope
    changes: dict[str, Any]


class ScopeDeletedEvent(BaseEvent):
    type: Literal["scope.deleted"] = "scope.deleted"
    scope_id: str


# ─── Finality events ──────────────────────────────────────────────────────────


class FinalityChangedEvent(BaseEvent):
    type: Literal["scope.finality.changed"] = "scope.finality.changed"
    scope_id: str
    payload: FinalityStatus
    previous_score: float
    delta: float


class FinalityNearFinalEvent(BaseEvent):
    type: Literal["scope.finality.near-final"] = "scope.finality.near-final"
    scope_id: str
    payload: FinalityStatus


class FinalityFinalEvent(BaseEvent):
    """Terminal convergence event.

    Triggers certificate issuance, archival, and downstream workflows.
    """

    type: Literal["scope.finality.final"] = "scope.finality.final"
    scope_id: str
    payload: FinalityStatus
    round: int = Field(description="Monotonicity round at convergence")


# ─── Veto events ──────────────────────────────────────────────────────────────


class VetoActivatedEvent(BaseEvent):
    """CRITICAL PATH — must propagate to all swarm agents within milliseconds.

    On receipt, halt all reasoning on the affected scope immediately.
    """

    type: Literal["scope.veto.activated"] = "scope.veto.activated"
    scope_id: str
    activated_by: str = Field(description="Agent or model handle that raised the veto")
    reason: Optional[str] = None
    payload: FinalityStatus


class VetoLiftedEvent(BaseEvent):
    type: Literal["scope.veto.lifted"] = "scope.veto.lifted"
    scope_id: str
    lifted_by: str
    payload: FinalityStatus


# ─── Model events ─────────────────────────────────────────────────────────────


class ModelConnectedEvent(BaseEvent):
    type: Literal["model.connected"] = "model.connected"
    handle: str
    payload: ModelHandle


class ModelRevokedEvent(BaseEvent):
    type: Literal["model.revoked"] = "model.revoked"
    handle: str


# ─── Agent events ─────────────────────────────────────────────────────────────


class AgentHeartbeatEvent(BaseEvent):
    type: Literal["agent.heartbeat"] = "agent.heartbeat"
    agent_id: str
    status: Literal["active", "idle", "error"]
    payload: Optional[Agent] = None


class AgentTaskStartedEvent(BaseEvent):
    type: Literal["agent.task.started"] = "agent.task.started"
    agent_id: str
    task_id: str
    scope_id: str


class AgentTaskCompletedEvent(BaseEvent):
    type: Literal["agent.task.completed"] = "agent.task.completed"
    agent_id: str
    task_id: str
    scope_id: str
    duration_ms: float


class AgentTaskFailedEvent(BaseEvent):
    type: Literal["agent.task.failed"] = "agent.task.failed"
    agent_id: str
    task_id: str
    scope_id: str
    error: str


# ─── Unions ───────────────────────────────────────────────────────────────────

ScopeEvent = Union[
    ScopeCreatedEvent,
    ScopeUpdatedEvent,
    ScopeDeletedEvent,
    FinalityChangedEvent,
    FinalityNearFinalEvent,
    FinalityFinalEvent,
    VetoActivatedEvent,
    VetoLiftedEvent,
]

ModelEvent = Union[ModelConnectedEvent, ModelRevokedEvent]

AgentEvent = Union[
    AgentHeartbeatEvent,
    AgentTaskStartedEvent,
    AgentTaskCompletedEvent,
    AgentTaskFailedEvent,
]

SgrsEvent = Union[ScopeEvent, ModelEvent, AgentEvent]


# ─── Helpers ──────────────────────────────────────────────────────────────────


def create_base_event(tenant: str) -> dict[str, str]:
    """Build a BaseEvent dict for constructing events server-side.

    Timestamp uses ``Z`` suffix (not ``+00:00``) to match TypeScript's
    ``new Date().toISOString()`` output format (LOW-5 fix).
    """
    now = datetime.now(tz=timezone.utc)
    # strftime produces "Z"-terminated ISO 8601, matching TS Date.toISOString()
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    return {
        "id": str(uuid.uuid4()),
        "timestamp": timestamp,
        "tenant": tenant,
        "version": "1",
    }


def parse_event(data: dict[str, Any]) -> SgrsEvent:
    """Parse a raw dict into the correct typed event model.

    Raises:
        ValueError: If `type` is unknown or data is malformed.
    """
    event_type = data.get("type", "")
    _map: dict[str, type[BaseEvent]] = {
        "scope.created":            ScopeCreatedEvent,
        "scope.updated":            ScopeUpdatedEvent,
        "scope.deleted":            ScopeDeletedEvent,
        "scope.finality.changed":   FinalityChangedEvent,
        "scope.finality.near-final": FinalityNearFinalEvent,
        "scope.finality.final":     FinalityFinalEvent,
        "scope.veto.activated":     VetoActivatedEvent,
        "scope.veto.lifted":        VetoLiftedEvent,
        "model.connected":          ModelConnectedEvent,
        "model.revoked":            ModelRevokedEvent,
        "agent.heartbeat":          AgentHeartbeatEvent,
        "agent.task.started":       AgentTaskStartedEvent,
        "agent.task.completed":     AgentTaskCompletedEvent,
        "agent.task.failed":        AgentTaskFailedEvent,
    }
    cls = _map.get(event_type)
    if cls is None:
        raise ValueError(f"Unknown SGRS event type: {event_type!r}")
    return cls.model_validate(data)  # type: ignore[return-value]
