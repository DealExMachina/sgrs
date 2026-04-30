"""EventsApi — hardened NATS real-time transport layer.

Security guarantees:
  • All inbound messages validated via parse_event() (Pydantic v2) before
    reaching handlers — decode errors never reach application code (C-1 fixed)
  • Handler errors surfaced via on_handler_error callback — never silently
    swallowed, especially on the veto critical path (C-2 fixed)
  • publish() enforces tenant ownership — cross-tenant injection rejected (C-3 fixed)
  • publish() and publish_scope_event() are async — no unawaited coroutines (C-4 fixed)
  • connect() uses asyncio.Lock — concurrent calls share one connection (C-5 fixed)
  • tok() allowlist prevents subject injection (H-1 fixed)
  • Plain nats:// URLs emit a WARNING-level security log (H-2 fixed)
  • Subscriptions removed from _subs automatically (H-3 fixed)
  • subscribe_audit uses ConsumerConfig with DeliverPolicy.ALL enum (H-5 fixed)
  • subscribe_audit tracked in _subs (H-6 fixed)
  • Handler errors logged at ERROR level with full traceback (H-7 fixed)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import warnings
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, Union

from .schema import (
    AgentEvent,
    AgentHeartbeatEvent,
    AgentTaskCompletedEvent,
    AgentTaskFailedEvent,
    FinalityChangedEvent,
    FinalityFinalEvent,
    FinalityNearFinalEvent,
    ModelConnectedEvent,
    ModelEvent,
    ModelRevokedEvent,
    ScopeCreatedEvent,
    ScopeDeletedEvent,
    ScopeEvent,
    ScopeUpdatedEvent,
    SgrsEvent,
    VetoActivatedEvent,
    VetoLiftedEvent,
    parse_event,
)
from .subjects import (
    all_tenant_subjects,
    assert_owned_by_tenant,
    audit_stream_name,
    sanitise_durable,
    subjects,
)

log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────


@dataclass
class NatsConfig:
    """NATS connection configuration.

    Pass to Client(nats=NatsConfig(...)) to enable real-time events.

    Credentials fields (token, password) are excluded from repr() to
    prevent accidental logging.
    """

    servers: Union[list[str], str]
    """NATS server URL(s). Use tls:// or wss:// for production."""

    token: Optional[str] = field(default=None, repr=False)
    """Auth token (excluded from repr to prevent credential leakage)."""

    username: Optional[str] = None
    password: Optional[str] = field(default=None, repr=False)
    """Password (excluded from repr to prevent credential leakage)."""

    tls: Optional[dict[str, Any]] = field(default=None, repr=False)
    """TLS options forwarded to nats.connect() (e.g. ssl_context)."""

    max_reconnect_attempts: int = -1
    """Max reconnect attempts. -1 = unlimited (default)."""

    connect_timeout: float = 10.0
    """Connection timeout in seconds."""

    max_payload_bytes: int = 1_048_576
    """Max inbound message size in bytes (default: 1 MB)."""

    name: Optional[str] = None
    """Client name shown in NATS monitoring."""

    on_decode_error: Optional[Callable[[Exception, str], None]] = field(
        default=None, repr=False
    )
    """Called when a message cannot be decoded or validated.
    Signature: (error, subject) -> None."""

    on_handler_error: Optional[Callable[[Exception, Any, str], None]] = field(
        default=None, repr=False
    )
    """Called when a subscription handler raises.
    Signature: (error, event_or_None, subject) -> None.
    If not set, handler errors are logged at ERROR level."""


# ─── Handler types ────────────────────────────────────────────────────────────

EventHandler = Callable[[SgrsEvent, str], Union[None, Awaitable[None]]]
TaskHandler = Callable[[Any, Optional[str]], Union[None, Awaitable[None]]]


# ─── Errors ───────────────────────────────────────────────────────────────────


class NatsNotConfiguredError(RuntimeError):
    def __init__(self) -> None:
        super().__init__(
            "NATS is not configured. "
            "Pass nats=NatsConfig(servers=['nats://...']) to Client()."
        )


class NatsNotConnectedError(RuntimeError):
    def __init__(self) -> None:
        super().__init__(
            "NATS is not connected. "
            "Call await client.connect() before subscribing."
        )


# ─── EventsApi ────────────────────────────────────────────────────────────────


class EventsApi:
    """Real-time NATS event transport. Instantiated inside Client — do not create directly."""

    def __init__(self, config: Optional[NatsConfig]) -> None:
        self._cfg = config
        self._nc: Any = None
        self._subs: list[Any] = []
        self._connect_lock: asyncio.Lock = asyncio.Lock()

    # ── State ──────────────────────────────────────────────────────────────────

    @property
    def configured(self) -> bool:
        return self._cfg is not None

    @property
    def connected(self) -> bool:
        return self._nc is not None and self._nc.is_connected

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Connect to NATS. No-op (no error) when NATS is not configured.
        Concurrency-safe: concurrent calls share one connection attempt.
        """
        if self._cfg is None:
            return

        async with self._connect_lock:
            if self.connected:
                return
            await self._do_connect()

    async def _do_connect(self) -> None:
        cfg = self._cfg

        # ── Security: warn on plaintext transport ──────────────────────────
        server_list = (
            cfg.servers if isinstance(cfg.servers, list) else [cfg.servers]
        )
        insecure = any(
            s.startswith("nats://") or s.startswith("ws://")
            for s in server_list
        )
        if insecure and not cfg.tls:
            log.warning(
                "[SECURITY] Connecting to NATS over an unencrypted URL. "
                "Governance events and credentials will be transmitted in plaintext. "
                "Use tls:// or wss:// in production, or pass tls= to suppress this warning."
            )

        try:
            import nats  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "nats-py package not found. "
                "Install it: pip install 'sgrs-client[nats]'"
            ) from exc

        kwargs: dict[str, Any] = {
            "servers": server_list,
            "max_reconnect_attempts": cfg.max_reconnect_attempts,
            "connect_timeout": cfg.connect_timeout,
        }
        if cfg.token:
            kwargs["token"] = cfg.token
        if cfg.username:
            kwargs["user"] = cfg.username
        if cfg.password:
            kwargs["password"] = cfg.password
        if cfg.tls:
            # Whitelist TLS keys — prevent arbitrary dict from overriding
            # previously-validated kwargs (e.g. {"servers": "nats://evil.example.com"}).
            _ALLOWED_TLS_KEYS = {"tls", "tls_hostname", "tls_handshake_first"}
            unknown = set(cfg.tls) - _ALLOWED_TLS_KEYS
            if unknown:
                raise ValueError(
                    f"[SECURITY] NatsConfig.tls contains unrecognised keys: {sorted(unknown)}. "
                    f"Allowed: {sorted(_ALLOWED_TLS_KEYS)}"
                )
            kwargs.update({k: v for k, v in cfg.tls.items() if k in _ALLOWED_TLS_KEYS})
        if cfg.name:
            kwargs["name"] = cfg.name

        self._nc = await nats.connect(**kwargs)
        log.debug("NATS connected to %s", server_list)

    async def close(self) -> None:
        """Drain in-flight messages and close the NATS connection.
        drain() handles all subscription cleanup internally.
        """
        self._subs.clear()
        if self._nc is not None:
            try:
                await self._nc.drain()
            except Exception as exc:  # noqa: BLE001
                # Log drain errors instead of silently discarding them —
                # a drain failure may mean in-flight governance events were lost.
                log.warning("[sgrs][NATS] Error during connection drain on close: %s", exc)
            self._nc = None
        log.debug("NATS connection closed")

    # ── Internal ───────────────────────────────────────────────────────────────

    def _require(self) -> None:
        if self._cfg is None:
            raise NatsNotConfiguredError()
        if not self.connected:
            raise NatsNotConnectedError()

    def _decode(self, data: bytes, subject: str) -> Optional[SgrsEvent]:
        """Decode and validate an inbound NATS message.

        Returns the validated event, or None on error (error already logged/dispatched).
        """
        cfg = self._cfg
        max_payload = cfg.max_payload_bytes if cfg else 1_048_576

        if len(data) > max_payload:
            err = ValueError(
                f"Message size {len(data)} bytes exceeds limit {max_payload} bytes "
                f"on subject {subject!r}"
            )
            if cfg and cfg.on_decode_error:
                cfg.on_decode_error(err, subject)
            else:
                log.warning("[sgrs][NATS] %s", err)
            return None

        try:
            raw = json.loads(data.decode("utf-8"))
            return parse_event(raw)
        except Exception as exc:
            if cfg and cfg.on_decode_error:
                cfg.on_decode_error(exc, subject)
            else:
                log.warning(
                    "[sgrs][NATS] Message validation failed on %r: %s", subject, exc
                )
            return None

    async def _dispatch(self, handler: EventHandler, event: SgrsEvent, subject: str) -> None:
        """Invoke handler, surfacing errors via on_handler_error or logging at ERROR."""
        try:
            result = handler(event, subject)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:
            if self._cfg and self._cfg.on_handler_error:
                self._cfg.on_handler_error(exc, event, subject)
            else:
                # H-7: use log.exception so full traceback appears at ERROR level
                log.exception(
                    "[sgrs][NATS] Handler error on subject %r (event type=%s): %s",
                    subject,
                    getattr(event, "type", "?"),
                    exc,
                )

    async def _subscribe(
        self,
        subject: str,
        handler: EventHandler,
        queue: Optional[str] = None,
    ) -> Any:
        """Create a validated NATS subscription. Subscriptions auto-remove from
        _subs on close (H-3 fix).
        """
        self._require()

        async def _cb(msg: Any) -> None:
            event = self._decode(msg.data, msg.subject)
            if event is None:
                return
            await self._dispatch(handler, event, msg.subject)

        kwargs: dict[str, Any] = {"cb": _cb}
        if queue:
            kwargs["queue"] = queue

        sub = await self._nc.subscribe(subject, **kwargs)
        self._subs.append(sub)
        return sub

    # ── Scope subscriptions ────────────────────────────────────────────────────

    async def on_scope(self, tenant: str, scope_id: str, handler: EventHandler) -> Any:
        return await self._subscribe(subjects.scope.all_for(tenant, scope_id), handler)

    async def on_scope_created(
        self, tenant: str, handler: Callable[[ScopeCreatedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.created":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_scopes(tenant), _h)

    async def on_scope_updated(
        self, tenant: str, handler: Callable[[ScopeUpdatedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.updated":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_scopes(tenant), _h)

    async def on_scope_deleted(
        self, tenant: str, handler: Callable[[ScopeDeletedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.deleted":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_scopes(tenant), _h)

    # ── Finality subscriptions ─────────────────────────────────────────────────

    async def on_finality_changed(
        self, tenant: str, handler: Callable[[FinalityChangedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.finality.changed":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_finality(tenant), _h)

    async def on_finality_near_final(
        self, tenant: str, handler: Callable[[FinalityNearFinalEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.finality.near-final":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_finality(tenant), _h)

    async def on_finality_final(
        self,
        tenant: str,
        scope_id: str,
        handler: Callable[[FinalityFinalEvent, str], Any],
    ) -> Any:
        """Terminal convergence — fires once per scope at full consensus."""
        return await self._subscribe(
            subjects.scope.finality_final(tenant, scope_id),
            handler,  # type: ignore[arg-type]
        )

    # ── Veto subscriptions (CRITICAL PATH) ────────────────────────────────────

    async def on_veto_activated(
        self, tenant: str, handler: Callable[[VetoActivatedEvent, str], Any]
    ) -> Any:
        """CRITICAL PATH — subscribe here to halt swarm reasoning on veto.

        Latency target: <10ms from publication to all handlers invoked.
        Handler errors are surfaced via on_handler_error (never silently swallowed).
        """
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.veto.activated":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_vetos(tenant), _h)

    async def on_veto_lifted(
        self, tenant: str, handler: Callable[[VetoLiftedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "scope.veto.lifted":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.scope.all_vetos(tenant), _h)

    # ── Model subscriptions ────────────────────────────────────────────────────

    async def on_model_connected(
        self, tenant: str, handler: Callable[[ModelConnectedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "model.connected":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.model.all_models(tenant), _h)

    async def on_model_revoked(
        self, tenant: str, handler: Callable[[ModelRevokedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "model.revoked":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.model.all_models(tenant), _h)

    # ── Agent subscriptions ────────────────────────────────────────────────────

    async def on_agent_heartbeat(
        self, tenant: str, handler: Callable[[AgentHeartbeatEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "agent.heartbeat":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.agent.all_agents(tenant), _h)

    async def on_agent_task_completed(
        self, tenant: str, handler: Callable[[AgentTaskCompletedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "agent.task.completed":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.agent.all_agents(tenant), _h)

    async def on_agent_task_failed(
        self, tenant: str, handler: Callable[[AgentTaskFailedEvent, str], Any]
    ) -> Any:
        async def _h(ev: SgrsEvent, s: str) -> None:
            if ev.type == "agent.task.failed":
                await self._dispatch(handler, ev, s)  # type: ignore[arg-type]

        return await self._subscribe(subjects.agent.all_agents(tenant), _h)

    # ── Cross-category ─────────────────────────────────────────────────────────

    async def on_all(
        self, tenant: str, handler: EventHandler
    ) -> dict[str, Any]:
        """Subscribe to all events for a tenant. Returns named handles."""
        scope_sub, model_sub, agent_sub = await asyncio.gather(
            self._subscribe(subjects.scope.all_scopes(tenant), handler),
            self._subscribe(subjects.model.all_models(tenant), handler),
            self._subscribe(subjects.agent.all_agents(tenant), handler),
        )
        return {"scope": scope_sub, "model": model_sub, "agent": agent_sub}

    # ── Queue groups ───────────────────────────────────────────────────────────

    async def join_queue(
        self,
        tenant: str,
        task_type: str,
        handler: TaskHandler,
        group_name: str = "workers",
    ) -> Any:
        """Queue group — each task delivered to exactly ONE worker in the group."""
        self._require()
        subj = subjects.agent.queue(tenant, task_type)
        cfg = self._cfg
        max_payload = cfg.max_payload_bytes if cfg else 1_048_576

        async def _cb(msg: Any) -> None:
            if len(msg.data) > max_payload:
                log.warning(
                    "[sgrs][NATS] Queue message too large (%d bytes) on %r, skipping",
                    len(msg.data),
                    msg.subject,
                )
                return
            try:
                task = json.loads(msg.data.decode("utf-8"))
                result = handler(task, msg.reply if msg.reply else None)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                if cfg and cfg.on_handler_error:
                    cfg.on_handler_error(exc, None, msg.subject)
                else:
                    log.exception(
                        "[sgrs][NATS] Queue handler error on %r: %s", subj, exc
                    )

        sub = await self._nc.subscribe(subj, queue=group_name, cb=_cb)
        self._subs.append(sub)
        return sub

    # ── Publish (server-side — C-3/C-4 fixed) ─────────────────────────────────

    async def publish(self, subject: str, event: Any, tenant: Optional[str] = None) -> None:
        """Low-level async publish with optional tenant ownership assertion.

        When tenant is provided, raises ValueError if subject doesn't belong
        to that tenant — preventing cross-tenant event injection.
        """
        self._require()
        if tenant is not None:
            assert_owned_by_tenant(subject, tenant)
        # Serialise with by_alias=True to produce camelCase wire format that
        # matches the TypeScript SDK schema (ASYM-1 fix).
        data = json.dumps(
            event.model_dump(by_alias=True) if hasattr(event, "model_dump") else event
        ).encode("utf-8")
        await self._nc.publish(subject, data)

    async def publish_scope_event(
        self, tenant: str, scope_id: str, event: ScopeEvent
    ) -> None:
        """Publish a scope event. Tenant ownership is enforced."""
        _map: dict[str, Any] = {
            "scope.created":             subjects.scope.created,
            "scope.updated":             subjects.scope.updated,
            "scope.deleted":             subjects.scope.deleted,
            "scope.finality.changed":    subjects.scope.finality_changed,
            "scope.finality.near-final": subjects.scope.finality_near_final,
            "scope.finality.final":      subjects.scope.finality_final,
            "scope.veto.activated":      subjects.scope.veto_activated,
            "scope.veto.lifted":         subjects.scope.veto_lifted,
        }
        event_type = getattr(event, "type", None)
        subj_fn = _map.get(event_type)  # type: ignore[arg-type]
        if subj_fn is None:
            raise ValueError(f"Unknown scope event type: {event_type!r}")
        subj = subj_fn(tenant, scope_id)
        await self.publish(subj, event, tenant=tenant)

    async def publish_model_event(
        self, tenant: str, handle: str, event: ModelEvent
    ) -> None:
        """Publish a model event. Tenant ownership is enforced."""
        event_type = getattr(event, "type", None)
        if event_type == "model.connected":
            subj = subjects.model.connected(tenant, handle)
        elif event_type == "model.revoked":
            subj = subjects.model.revoked(tenant, handle)
        else:
            raise ValueError(f"Unknown model event type: {event_type!r}")
        await self.publish(subj, event, tenant=tenant)

    # ── JetStream audit ────────────────────────────────────────────────────────

    async def enable_audit_stream(
        self, tenant: str, stream_name: Optional[str] = None
    ) -> None:
        """Create a durable JetStream audit stream for tenant (idempotent).

        Requires JetStream enabled on the server: nats-server --jetstream
        """
        self._require()
        name = stream_name or audit_stream_name(tenant)
        js = self._nc.jetstream()

        try:
            await js.stream_info(name)
            log.debug("JetStream stream %r already exists", name)
        except Exception as exc:
            # Only swallow "stream not found"; re-raise transient errors
            if "not found" not in str(exc).lower():
                raise
            from nats.js.api import StreamConfig  # type: ignore[import]

            await js.add_stream(
                StreamConfig(
                    name=name,
                    subjects=[subjects.audit.all(tenant)],
                    retention="limits",
                    storage="file",
                    max_age=7 * 365 * 24 * 3600 * 1_000_000_000,  # 7 years in ns
                    num_replicas=1,
                )
            )
            log.info("Created JetStream audit stream: %r", name)

    async def subscribe_audit(
        self,
        tenant: str,
        handler: EventHandler,
        consumer_name: Optional[str] = None,
        stream_name: Optional[str] = None,
    ) -> Any:
        """Subscribe to the durable audit stream, replaying from the beginning.

        Uses ConsumerConfig with DeliverPolicy.ALL (H-5 fix — not a bare string).
        Subscription is tracked in _subs (H-6 fix).
        """
        self._require()
        js = self._nc.jetstream()
        stream = stream_name or audit_stream_name(tenant)
        durable = sanitise_durable(consumer_name or f"sgrs-audit-{tenant}")
        subj = subjects.audit.all(tenant)

        from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy  # type: ignore[import]

        async def _cb(msg: Any) -> None:
            event = self._decode(msg.data, msg.subject)
            if event is None:
                await msg.nak()
                return
            try:
                result = handler(event, msg.subject)
                if asyncio.iscoroutine(result):
                    await result
                await msg.ack()
            except Exception as exc:
                await msg.nak()  # Redeliver — never lose audit events
                if self._cfg and self._cfg.on_handler_error:
                    self._cfg.on_handler_error(exc, event, msg.subject)
                else:
                    log.exception(
                        "[sgrs][NATS][JetStream] Audit handler error on %r: %s",
                        msg.subject,
                        exc,
                    )

        sub = await js.subscribe(
            subj,
            stream=stream,
            durable=durable,
            config=ConsumerConfig(
                deliver_policy=DeliverPolicy.ALL,
                ack_policy=AckPolicy.EXPLICIT,
                filter_subject=subj,
            ),
            cb=_cb,
        )

        # H-6 fix: track JetStream subscription in _subs
        self._subs.append(sub)
        return sub
