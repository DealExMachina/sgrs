"""Comprehensive test suite for the SGRS events layer.

Covers:
  T-01..T-10   subjects.py  — tok(), assert_owned_by_tenant(), builders, streams
  T-11..T-18   schema.py    — parse_event(), create_base_event(), all event types
  T-19..T-24   api.py       — EventsApi lifecycle (config, connect, close, state)
  T-25..T-30   api.py       — _decode() validation boundary (C-1 / C-2 fixes)
  T-31..T-35   api.py       — Security (cross-tenant injection prevention, C-3)
  T-36..T-40   api.py       — Handler error routing (on_handler_error, H-7)
  T-41..T-44   api.py       — on_all() named handles (L-7), credential repr (L-1)
  T-45..T-48   api.py       — Concurrency-safe connect (C-5), subscription tracking

None of these tests require a live NATS server — the NATS connection object is
mocked everywhere, so the full suite runs offline in CI.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from sgrs_client.events.api import (
    EventsApi,
    NatsConfig,
    NatsNotConfiguredError,
    NatsNotConnectedError,
)
from sgrs_client.events.schema import (
    AgentHeartbeatEvent,
    AgentTaskCompletedEvent,
    AgentTaskFailedEvent,
    AgentTaskStartedEvent,
    FinalityChangedEvent,
    FinalityFinalEvent,
    FinalityNearFinalEvent,
    ModelConnectedEvent,
    ModelRevokedEvent,
    ScopeCreatedEvent,
    ScopeDeletedEvent,
    ScopeUpdatedEvent,
    VetoActivatedEvent,
    VetoLiftedEvent,
    create_base_event,
    parse_event,
)
from sgrs_client.events.subjects import (
    all_tenant_subjects,
    assert_owned_by_tenant,
    audit_stream_name,
    sanitise_durable,
    scope_stream_name,
    subjects,
    tok,
)

# ─── Fixture helpers ──────────────────────────────────────────────────────────

TENANT = "acme"
SCOPE_ID = "scope-42"


def _scope_payload() -> dict[str, Any]:
    now = datetime.now(tz=timezone.utc).isoformat()
    return {
        "id": "scope-42",
        "name": "Test scope",
        "tag": "test",
        "state": "active",
        "score": 0.5,
        "cycles": 0,
        "created_at": now,
        "updated_at": now,
    }


def _finality_payload() -> dict[str, Any]:
    return {
        "scope_id": "scope-42",
        "score": 0.95,
        "per_dimension": {
            "claim_confidence": 0.95,
            "contradiction_resolution": 0.95,
            "goal_completion": 0.95,
            "risk_score_inverse": 0.95,
        },
        "monotonicity_rounds": 3,
        "plateau_ema": 0.1,
        "convergence_rate": 0.05,
        "state": "near-final",
        "veto_active": False,
    }


def _base(tenant: str = TENANT) -> dict[str, Any]:
    return {
        "id": "a1b2c3d4-0000-0000-0000-000000000000",
        "timestamp": "2024-01-01T00:00:00Z",
        "tenant": tenant,
        "version": "1",
    }


def _mock_connected_nc() -> MagicMock:
    """Return a MagicMock NATS connection that reports as connected."""
    nc = MagicMock()
    nc.is_connected = True
    nc.publish = AsyncMock()
    nc.subscribe = AsyncMock(return_value=MagicMock())
    nc.drain = AsyncMock()
    return nc


def _connected_api(cfg: NatsConfig | None = None) -> EventsApi:
    """Return an EventsApi with a mocked connected NATS client."""
    if cfg is None:
        cfg = NatsConfig(servers="nats://localhost:4222")
    api = EventsApi(cfg)
    api._nc = _mock_connected_nc()
    return api


# ═══════════════════════════════════════════════════════════════════════════════
#  T-01..T-10  subjects.py
# ═══════════════════════════════════════════════════════════════════════════════


class TestTok:
    """T-01 … T-04: tok() validation."""

    def test_T01_slug_passthrough(self):
        assert tok("acme123") == "acme123"
        assert tok("my-tenant-v2") == "my-tenant-v2"
        assert tok("deal-ex-machina") == "deal-ex-machina"

    def test_T02_rejects_underscore_uppercase_dots(self):
        with pytest.raises(ValueError, match="Invalid NATS"):
            tok("my-tenant_v2")
        with pytest.raises(ValueError):
            tok("Acme")
        with pytest.raises(ValueError):
            tok("a.b")
        with pytest.raises(ValueError):
            tok("a>b")
        with pytest.raises(ValueError):
            tok("a*b")
        with pytest.raises(ValueError):
            tok("-ab")
        with pytest.raises(ValueError):
            tok("ab-")

    def test_T04_empty_string_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            tok("")

    def test_T04b_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            tok("   ")

    def test_T04c_too_long_raises(self):
        with pytest.raises(ValueError, match="too long"):
            tok("x" * 121)

    def test_T04d_exactly_120_chars_is_ok(self):
        slug = "a" * 120
        assert len(slug) == 120
        assert tok(slug) == slug


class TestAssertOwnedByTenant:
    """T-05 — T-07: cross-tenant rejection."""

    def test_T05_correct_tenant_passes(self):
        subj = f"sgrs.scope.{TENANT}.{SCOPE_ID}.created"
        assert_owned_by_tenant(subj, TENANT)  # must not raise

    def test_T06_wrong_tenant_raises(self):
        subj = f"sgrs.scope.other-corp.{SCOPE_ID}.created"
        with pytest.raises(ValueError, match=r"\[SECURITY\]"):
            assert_owned_by_tenant(subj, TENANT)

    def test_T07_subject_too_short_raises(self):
        with pytest.raises(ValueError, match=r"\[SECURITY\]"):
            assert_owned_by_tenant("sgrs.scope", TENANT)

    def test_T07_hyphenated_slug_assertion(self):
        subj = "sgrs.scope.acme-east.s1.created"
        assert_owned_by_tenant(subj, "acme-east")


class TestSubjectBuilders:
    """T-08 — T-09: subject builder output format."""

    def test_T08_scope_subjects(self):
        assert subjects.scope.created(TENANT, SCOPE_ID) == f"sgrs.scope.{TENANT}.{SCOPE_ID}.created"
        assert subjects.scope.updated(TENANT, SCOPE_ID) == f"sgrs.scope.{TENANT}.{SCOPE_ID}.updated"
        assert subjects.scope.deleted(TENANT, SCOPE_ID) == f"sgrs.scope.{TENANT}.{SCOPE_ID}.deleted"
        assert subjects.scope.finality_final(TENANT, SCOPE_ID) == f"sgrs.scope.{TENANT}.{SCOPE_ID}.finality.final"
        assert subjects.scope.veto_activated(TENANT, SCOPE_ID) == f"sgrs.scope.{TENANT}.{SCOPE_ID}.veto.activated"

    def test_T08b_wildcards(self):
        assert subjects.scope.all_scopes(TENANT).endswith(".>")
        assert subjects.scope.all_finality(TENANT).endswith(".>")
        assert "*" in subjects.scope.all_finality(TENANT)
        assert subjects.agent.all_agents(TENANT).endswith(".>")

    def test_T09_model_subjects(self):
        assert subjects.model.connected(TENANT, "mh-abc") == "sgrs.model.acme.mh-abc.connected"
        assert subjects.model.revoked(TENANT, "mh-abc") == "sgrs.model.acme.mh-abc.revoked"

    def test_T09b_agent_queue(self):
        subj = subjects.agent.queue(TENANT, "classify")
        assert subj == "sgrs.agent.queue.acme.classify"


class TestStreamNames:
    """T-10: stream name generation and sanitiseDurable."""

    def test_T10_audit_stream_name(self):
        assert audit_stream_name("acme") == "SGRS_AUDIT_ACME"
        assert audit_stream_name("my-tenant") == "SGRS_AUDIT_MY_TENANT"
        assert audit_stream_name("deal-ex-machina") == "SGRS_AUDIT_DEAL_EX_MACHINA"

    def test_T10_bad_tenant_raises(self):
        with pytest.raises(ValueError, match="Invalid tenant"):
            audit_stream_name("Tenant Corp")
        with pytest.raises(ValueError):
            audit_stream_name("UPPERCASE")

    def test_T10b_scope_stream_name(self):
        assert scope_stream_name("acme") == "SGRS_SCOPE_ACME"

    def test_T10c_sanitise_durable(self):
        assert sanitise_durable("my consumer") == "my_consumer"
        assert sanitise_durable("a" * 200) == "a" * 128  # truncated

    def test_T10d_sanitise_durable_empty_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            sanitise_durable("")

    def test_T10e_sanitise_durable_whitespace_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            sanitise_durable("   ")

    def test_T10d_all_tenant_subjects(self):
        result = all_tenant_subjects(TENANT)
        assert len(result) == 3
        assert all(TENANT in s for s in result)


# ═══════════════════════════════════════════════════════════════════════════════
#  T-11..T-18  schema.py — parse_event() and create_base_event()
# ═══════════════════════════════════════════════════════════════════════════════


class TestParseEvent:
    """T-11 — T-16: parse_event() type dispatch and validation."""

    def _evt(self, extra: dict[str, Any]) -> dict[str, Any]:
        return {**_base(), **extra}

    def test_T11_scope_created(self):
        data = self._evt({"type": "scope.created", "scope_id": SCOPE_ID, "payload": _scope_payload()})
        ev = parse_event(data)
        assert isinstance(ev, ScopeCreatedEvent)
        assert ev.scope_id == SCOPE_ID

    def test_T11b_scope_updated(self):
        data = self._evt({
            "type": "scope.updated",
            "scope_id": SCOPE_ID,
            "payload": _scope_payload(),
            "changes": {"score": 0.6},
        })
        ev = parse_event(data)
        assert isinstance(ev, ScopeUpdatedEvent)

    def test_T11c_scope_deleted(self):
        ev = parse_event(self._evt({"type": "scope.deleted", "scope_id": SCOPE_ID}))
        assert isinstance(ev, ScopeDeletedEvent)

    def test_T12_finality_events(self):
        base = {"scope_id": SCOPE_ID, "payload": _finality_payload()}
        ev_changed = parse_event(self._evt({**base, "type": "scope.finality.changed", "previous_score": 0.8, "delta": 0.15}))
        assert isinstance(ev_changed, FinalityChangedEvent)
        assert ev_changed.delta == pytest.approx(0.15)

        ev_near = parse_event(self._evt({**base, "type": "scope.finality.near-final"}))
        assert isinstance(ev_near, FinalityNearFinalEvent)

        ev_final = parse_event(self._evt({**base, "type": "scope.finality.final", "round": 5}))
        assert isinstance(ev_final, FinalityFinalEvent)
        assert ev_final.round == 5

    def test_T13_veto_events(self):
        base = {"scope_id": SCOPE_ID, "payload": _finality_payload()}
        ev_act = parse_event(self._evt({
            **base,
            "type": "scope.veto.activated",
            "activated_by": "agent-007",
            "reason": "contradiction detected",
        }))
        assert isinstance(ev_act, VetoActivatedEvent)
        assert ev_act.activated_by == "agent-007"
        assert ev_act.reason == "contradiction detected"

        ev_lift = parse_event(self._evt({
            **base,
            "type": "scope.veto.lifted",
            "lifted_by": "operator",
        }))
        assert isinstance(ev_lift, VetoLiftedEvent)
        assert ev_lift.lifted_by == "operator"

    def test_T14_model_events(self):
        now = datetime.now(tz=timezone.utc).isoformat()
        handle_payload = {
            "handle": "mh_abcdefghijklmnopqrstuvwx",
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "created_at": now,
        }
        ev_conn = parse_event(self._evt({
            "type": "model.connected",
            "handle": "mh_abcdefghijklmnopqrstuvwx",
            "payload": handle_payload,
        }))
        assert isinstance(ev_conn, ModelConnectedEvent)

        ev_rev = parse_event(self._evt({
            "type": "model.revoked",
            "handle": "mh_abcdefghijklmnopqrstuvwx",
        }))
        assert isinstance(ev_rev, ModelRevokedEvent)

    def test_T15_agent_events(self):
        ev_hb = parse_event(self._evt({"type": "agent.heartbeat", "agent_id": "ag-123", "status": "active"}))
        assert isinstance(ev_hb, AgentHeartbeatEvent)
        assert ev_hb.status == "active"

        ev_start = parse_event(self._evt({
            "type": "agent.task.started",
            "agent_id": "ag-123",
            "task_id": "t-1",
            "scope_id": SCOPE_ID,
        }))
        assert isinstance(ev_start, AgentTaskStartedEvent)

        ev_done = parse_event(self._evt({
            "type": "agent.task.completed",
            "agent_id": "ag-123",
            "task_id": "t-1",
            "scope_id": SCOPE_ID,
            "duration_ms": 123.4,
        }))
        assert isinstance(ev_done, AgentTaskCompletedEvent)

        ev_fail = parse_event(self._evt({
            "type": "agent.task.failed",
            "agent_id": "ag-123",
            "task_id": "t-1",
            "scope_id": SCOPE_ID,
            "error": "timeout",
        }))
        assert isinstance(ev_fail, AgentTaskFailedEvent)

    def test_T16_unknown_type_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown SGRS event type"):
            parse_event({**_base(), "type": "scope.INJECTED"})

    def test_T16b_missing_required_field_raises(self):
        # VetoActivatedEvent requires activated_by
        with pytest.raises(ValidationError):
            parse_event(self._evt({
                "type": "scope.veto.activated",
                "scope_id": SCOPE_ID,
                "payload": _finality_payload(),
                # activated_by intentionally omitted
            }))

    def test_T16c_wrong_version_rejected(self):
        data = {**_base(), "version": "2", "type": "scope.deleted", "scope_id": SCOPE_ID}
        with pytest.raises(ValidationError):
            parse_event(data)

    def test_T16d_empty_type_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown SGRS event type"):
            parse_event({**_base(), "type": ""})


class TestCreateBaseEvent:
    """T-17 — T-18: create_base_event()."""

    def test_T17_returns_required_fields(self):
        ev = create_base_event("acme")
        assert ev["tenant"] == "acme"
        assert ev["version"] == "1"
        assert "id" in ev
        assert "timestamp" in ev

    def test_T18_id_is_uuid_format(self):
        import re
        ev = create_base_event("acme")
        uuid_re = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )
        assert uuid_re.match(ev["id"]), f"Not a UUID: {ev['id']!r}"

    def test_T18b_timestamp_has_Z_suffix(self):
        """Timestamp must end with Z to match TypeScript SDK wire format (LOW-5 fix)."""
        ev = create_base_event("acme")
        assert ev["timestamp"].endswith("Z"), f"Expected Z suffix, got: {ev['timestamp']!r}"

    def test_T18c_timestamp_is_iso8601(self):
        ev = create_base_event("acme")
        # Replace Z with +00:00 for Python's fromisoformat (Python < 3.11 compat)
        dt = datetime.fromisoformat(ev["timestamp"].replace("Z", "+00:00"))
        assert dt.tzinfo is not None


# ═══════════════════════════════════════════════════════════════════════════════
#  T-19..T-24  api.py — EventsApi lifecycle
# ═══════════════════════════════════════════════════════════════════════════════


class TestEventsApiLifecycle:
    """T-19 — T-24: configured/connected state, connect(), close()."""

    def test_T19_no_config_not_configured(self):
        api = EventsApi(None)
        assert not api.configured
        assert not api.connected

    @pytest.mark.asyncio
    async def test_T19b_no_config_connect_is_noop(self):
        api = EventsApi(None)
        await api.connect()  # must not raise
        assert not api.connected

    def test_T20_with_config_is_configured(self):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        assert api.configured
        assert not api.connected

    @pytest.mark.asyncio
    async def test_T21_connect_sets_connected(self):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        mock_nc = _mock_connected_nc()

        with patch("nats.connect", AsyncMock(return_value=mock_nc)):
            await api.connect()

        assert api.connected

    @pytest.mark.asyncio
    async def test_T22_close_clears_connection(self):
        api = _connected_api()
        await api.close()
        assert not api.connected

    @pytest.mark.asyncio
    async def test_T23_close_drains_connection(self):
        api = _connected_api()
        nc = api._nc
        await api.close()
        nc.drain.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_T24_close_clears_subs_list(self):
        api = _connected_api()
        api._subs.append(MagicMock())
        api._subs.append(MagicMock())
        await api.close()
        assert api._subs == []


# ═══════════════════════════════════════════════════════════════════════════════
#  T-25..T-30  api.py — _decode() validation boundary  (C-1 fix)
# ═══════════════════════════════════════════════════════════════════════════════


class TestDecode:
    """T-25 — T-30: _decode() is the security boundary between wire and app code."""

    def _api(self, **kw: Any) -> EventsApi:
        cfg = NatsConfig(servers="nats://localhost:4222", **kw)
        return _connected_api(cfg)

    def _encode(self, data: dict[str, Any]) -> bytes:
        return json.dumps(data).encode()

    def test_T25_valid_event_returns_model(self):
        api = self._api()
        data = {**_base(), "type": "scope.deleted", "scope_id": SCOPE_ID}
        ev = api._decode(self._encode(data), "sgrs.scope.acme.s1.deleted")
        assert isinstance(ev, ScopeDeletedEvent)

    def test_T26_oversized_message_returns_none(self):
        api = self._api(max_payload_bytes=10)
        data = {**_base(), "type": "scope.deleted", "scope_id": SCOPE_ID}
        result = api._decode(self._encode(data), "test")
        assert result is None

    def test_T26b_oversized_calls_on_decode_error(self):
        errors: list[Exception] = []
        api = self._api(max_payload_bytes=10, on_decode_error=lambda e, s: errors.append(e))
        data = {**_base(), "type": "scope.deleted", "scope_id": SCOPE_ID}
        api._decode(self._encode(data), "test")
        assert len(errors) == 1

    def test_T27_malformed_json_returns_none(self):
        api = self._api()
        result = api._decode(b"{not valid json", "test")
        assert result is None

    def test_T27b_malformed_json_calls_on_decode_error(self):
        errors: list[Exception] = []
        api = self._api(on_decode_error=lambda e, s: errors.append(e))
        api._decode(b"not json", "test")
        assert len(errors) == 1

    def test_T28_unknown_type_returns_none(self):
        api = self._api()
        data = {**_base(), "type": "scope.INJECTED"}
        result = api._decode(self._encode(data), "test")
        assert result is None

    def test_T29_missing_required_field_returns_none(self):
        api = self._api()
        # FinalityFinalEvent without round
        data = {
            **_base(),
            "type": "scope.finality.final",
            "scope_id": SCOPE_ID,
            "payload": _finality_payload(),
            # round omitted
        }
        result = api._decode(self._encode(data), "test")
        assert result is None

    def test_T30_decode_error_logged_when_no_callback(self, caplog: pytest.LogCaptureFixture):
        api = self._api()
        with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
            api._decode(b"bad json", "sgrs.scope.acme.s1.deleted")
        assert any("validation failed" in r.message or "Message validation" in r.message
                   for r in caplog.records)


# ═══════════════════════════════════════════════════════════════════════════════
#  T-31..T-35  api.py — security  (C-2, C-3)
# ═══════════════════════════════════════════════════════════════════════════════


class TestSecurity:
    """T-31 — T-35: cross-tenant publish rejection and injection prevention."""

    @pytest.mark.asyncio
    async def test_T31_publish_wrong_tenant_raises(self):
        api = _connected_api()
        subj = "sgrs.scope.other-corp.s1.created"
        event = {"type": "scope.deleted", "scope_id": "s1"}
        with pytest.raises(ValueError, match=r"\[SECURITY\]"):
            await api.publish(subj, event, tenant=TENANT)

    @pytest.mark.asyncio
    async def test_T32_publish_correct_tenant_passes(self):
        api = _connected_api()
        subj = subjects.scope.deleted(TENANT, SCOPE_ID)
        data = {**_base(), "type": "scope.deleted", "scope_id": SCOPE_ID}

        class _FakeEvent:
            def model_dump(self, **kwargs: Any) -> dict[str, Any]:
                return data

        await api.publish(subj, _FakeEvent(), tenant=TENANT)  # must not raise
        api._nc.publish.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_T33_publish_no_tenant_skips_check(self):
        api = _connected_api()
        data = {**_base(), "type": "scope.deleted", "scope_id": SCOPE_ID}

        class _FakeEvent:
            def model_dump(self, **kwargs: Any) -> dict[str, Any]:
                return data

        await api.publish("any.subject", _FakeEvent(), tenant=None)  # no check
        api._nc.publish.assert_awaited_once()

    def test_T34_dots_in_slug_rejected_for_subjects(self):
        with pytest.raises(ValueError):
            tok("acme.scope.other")

    def test_T35_wildcard_tokens_rejected(self):
        with pytest.raises(ValueError):
            tok("*")
        with pytest.raises(ValueError):
            tok(">")
        with pytest.raises(ValueError):
            tok("a>b")
        with pytest.raises(ValueError):
            tok("a*b")

    @pytest.mark.asyncio
    async def test_T35b_require_raises_not_configured(self):
        api = EventsApi(None)
        with pytest.raises(NatsNotConfiguredError):
            api._require()

    @pytest.mark.asyncio
    async def test_T35c_require_raises_not_connected(self):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        with pytest.raises(NatsNotConnectedError):
            api._require()


# ═══════════════════════════════════════════════════════════════════════════════
#  T-36..T-40  api.py — handler error routing  (C-2 / H-7 fix)
# ═══════════════════════════════════════════════════════════════════════════════


class TestHandlerErrorRouting:
    """T-36 — T-40: handler errors must never be silently swallowed."""

    def _event(self) -> ScopeDeletedEvent:
        return ScopeDeletedEvent(**{**_base(), "scope_id": SCOPE_ID})

    @pytest.mark.asyncio
    async def test_T36_sync_handler_called(self):
        calls: list[tuple] = []
        api = _connected_api()
        ev = self._event()
        await api._dispatch(lambda e, s: calls.append((e, s)), ev, "subj")
        assert calls == [(ev, "subj")]

    @pytest.mark.asyncio
    async def test_T37_async_handler_awaited(self):
        results: list[str] = []

        async def _h(e: Any, s: str) -> None:
            results.append("done")

        api = _connected_api()
        await api._dispatch(_h, self._event(), "subj")
        assert results == ["done"]

    @pytest.mark.asyncio
    async def test_T38_handler_error_routes_to_callback(self):
        errors: list[Exception] = []
        cfg = NatsConfig(
            servers="nats://localhost:4222",
            on_handler_error=lambda exc, ev, s: errors.append(exc),
        )
        api = _connected_api(cfg)

        def _boom(e: Any, s: str) -> None:
            raise RuntimeError("boom")

        await api._dispatch(_boom, self._event(), "subj")
        assert len(errors) == 1
        assert isinstance(errors[0], RuntimeError)

    @pytest.mark.asyncio
    async def test_T39_handler_error_logged_when_no_callback(
        self, caplog: pytest.LogCaptureFixture
    ):
        api = _connected_api()

        def _boom(e: Any, s: str) -> None:
            raise RuntimeError("critical-handler-failure")

        with caplog.at_level(logging.ERROR, logger="sgrs_client.events.api"):
            await api._dispatch(_boom, self._event(), "subj")

        assert any("Handler error" in r.message or "critical-handler-failure" in r.message
                   for r in caplog.records)

    @pytest.mark.asyncio
    async def test_T40_veto_handler_error_not_swallowed(self):
        """Veto critical path: handler errors must surface, never be silently dropped."""
        errors: list[Exception] = []
        cfg = NatsConfig(
            servers="nats://localhost:4222",
            on_handler_error=lambda exc, ev, s: errors.append(exc),
        )
        api = _connected_api(cfg)

        ev = VetoActivatedEvent(**{
            **_base(),
            "scope_id": SCOPE_ID,
            "activated_by": "agent-007",
            "payload": _finality_payload(),
        })

        async def _veto_handler(e: Any, s: str) -> None:
            raise RuntimeError("veto handler failed")

        await api._dispatch(_veto_handler, ev, "sgrs.scope.acme.s1.veto.activated")
        assert len(errors) == 1
        assert "veto handler failed" in str(errors[0])


# ═══════════════════════════════════════════════════════════════════════════════
#  T-41..T-44  api.py — on_all() named handles, credential repr
# ═══════════════════════════════════════════════════════════════════════════════


class TestOnAllAndRepr:
    """T-41 — T-44: L-7 on_all() named handles; L-1 credential repr exclusion."""

    @pytest.mark.asyncio
    async def test_T41_on_all_returns_named_dict(self):
        api = _connected_api()
        result = await api.on_all(TENANT, lambda e, s: None)
        assert isinstance(result, dict)
        assert set(result.keys()) == {"scope", "model", "agent"}

    @pytest.mark.asyncio
    async def test_T42_on_all_registers_three_subscriptions(self):
        api = _connected_api()
        initial_count = len(api._subs)
        await api.on_all(TENANT, lambda e, s: None)
        assert len(api._subs) == initial_count + 3

    def test_T43_token_excluded_from_repr(self):
        cfg = NatsConfig(servers="nats://localhost:4222", token="super-secret-token")
        r = repr(cfg)
        assert "super-secret-token" not in r

    def test_T44_password_excluded_from_repr(self):
        cfg = NatsConfig(
            servers="nats://localhost:4222",
            username="user",
            password="p@ssw0rd",
        )
        r = repr(cfg)
        assert "p@ssw0rd" not in r
        # username is NOT excluded and should appear
        assert "user" in r


# ═══════════════════════════════════════════════════════════════════════════════
#  T-45..T-48  api.py — concurrency-safe connect (C-5), subscription tracking
# ═══════════════════════════════════════════════════════════════════════════════


class TestConcurrencyAndTracking:
    """T-45 — T-48: connect() concurrency safety and subscription lifecycle."""

    @pytest.mark.asyncio
    async def test_T45_concurrent_connect_single_connection(self):
        """Multiple concurrent connect() calls must produce exactly one connection.

        The asyncio.Lock inside connect() guarantees that even if three callers
        race, _do_connect() executes exactly once (C-5 fix).
        """
        connect_count = 0
        mock_nc = _mock_connected_nc()

        async def _fake_connect(**kwargs: Any) -> MagicMock:
            nonlocal connect_count
            connect_count += 1
            await asyncio.sleep(0)  # yield — simulate network RTT
            return mock_nc

        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        mock_connect = AsyncMock(side_effect=_fake_connect)

        with patch("nats.connect", mock_connect):
            await asyncio.gather(
                api.connect(),
                api.connect(),
                api.connect(),
            )

        assert connect_count == 1, f"Expected 1 connection, got {connect_count}"

    @pytest.mark.asyncio
    async def test_T46_subscription_added_to_subs(self):
        api = _connected_api()
        await api._subscribe("sgrs.scope.acme.>", lambda e, s: None)
        assert len(api._subs) == 1

    @pytest.mark.asyncio
    async def test_T47_subscribe_not_connected_raises(self):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        with pytest.raises(NatsNotConnectedError):
            await api._subscribe("sgrs.scope.acme.>", lambda e, s: None)

    @pytest.mark.asyncio
    async def test_T48_publish_scope_event_unknown_type_raises(self):
        api = _connected_api()

        class _BadEvent:
            type = "scope.unknown"

        with pytest.raises(ValueError, match="Unknown scope event type"):
            await api.publish_scope_event(TENANT, SCOPE_ID, _BadEvent())  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_T48b_publish_not_connected_raises(self):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))

        class _E:
            def model_dump(self):
                return {}

        with pytest.raises(NatsNotConnectedError):
            await api.publish("subj", _E())


# ═══════════════════════════════════════════════════════════════════════════════
#  T-49..T-52  security — TLS warning on plaintext transport  (H-2 fix)
# ═══════════════════════════════════════════════════════════════════════════════


class TestTlsWarning:
    """T-49 — T-52: plaintext nats:// / ws:// URLs must emit a WARNING log."""

    @pytest.mark.asyncio
    async def test_T49_plaintext_nats_warns(self, caplog: pytest.LogCaptureFixture):
        api = EventsApi(NatsConfig(servers="nats://localhost:4222"))
        mock_nc = _mock_connected_nc()

        with patch("nats.connect", AsyncMock(return_value=mock_nc)):
            with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
                await api._do_connect()

        assert any("SECURITY" in r.message or "unencrypted" in r.message.lower()
                   for r in caplog.records)

    @pytest.mark.asyncio
    async def test_T50_tls_url_no_warning(self, caplog: pytest.LogCaptureFixture):
        api = EventsApi(NatsConfig(servers="tls://localhost:4222"))
        mock_nc = _mock_connected_nc()

        with patch("nats.connect", AsyncMock(return_value=mock_nc)):
            with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
                await api._do_connect()

        assert not any("SECURITY" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_T51_tls_option_suppresses_warning(self, caplog: pytest.LogCaptureFixture):
        api = EventsApi(NatsConfig(
            servers="nats://localhost:4222",
            tls={"tls": True},
        ))
        mock_nc = _mock_connected_nc()

        with patch("nats.connect", AsyncMock(return_value=mock_nc)):
            with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
                await api._do_connect()

        # tls= passed explicitly — warning should be suppressed
        assert not any("SECURITY" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_T52_ws_plaintext_warns(self, caplog: pytest.LogCaptureFixture):
        api = EventsApi(NatsConfig(servers="ws://localhost:4223"))
        mock_nc = _mock_connected_nc()

        with patch("nats.connect", AsyncMock(return_value=mock_nc)):
            with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
                await api._do_connect()

        assert any("SECURITY" in r.message or "unencrypted" in r.message.lower()
                   for r in caplog.records)


# ═══════════════════════════════════════════════════════════════════════════════
#  T-53..T-58  New fixes — TLS injection, wire format, drain warning
# ═══════════════════════════════════════════════════════════════════════════════


class TestNewFixes:
    """Tests for fixes applied after the initial security review."""

    # ── TLS key whitelist (MEDIUM-NEW-5) ──────────────────────────────────────

    @pytest.mark.asyncio
    async def test_T53_tls_unknown_key_raises(self):
        """Unknown keys in cfg.tls are rejected before they can override validated kwargs."""
        api = EventsApi(NatsConfig(
            servers="nats://localhost:4222",
            tls={"servers": "nats://evil.example.com"},  # injection attempt
        ))
        with pytest.raises(ValueError, match=r"\[SECURITY\]"):
            await api._do_connect()

    @pytest.mark.asyncio
    async def test_T54_tls_known_key_allowed(self):
        """Recognised TLS keys are forwarded to nats.connect without error."""
        api = EventsApi(NatsConfig(
            servers="tls://localhost:4222",
            tls={"tls_handshake_first": True},
        ))
        mock_nc = _mock_connected_nc()
        with patch("nats.connect", AsyncMock(return_value=mock_nc)) as mock_c:
            await api._do_connect()
        call_kwargs = mock_c.call_args.kwargs
        assert call_kwargs.get("tls_handshake_first") is True

    # ── Wire format: camelCase serialisation (ASYM-1) ─────────────────────────

    @pytest.mark.asyncio
    async def test_T55_publish_uses_camel_case_wire_format(self):
        """Published events must serialise field names in camelCase for TS SDK compat."""
        api = _connected_api()
        subj = f"sgrs.scope.{TENANT}.{SCOPE_ID}.veto.activated"

        ev = VetoActivatedEvent(**{
            **_base(),
            "scope_id": SCOPE_ID,
            "activated_by": "agent-007",
            "payload": _finality_payload(),
        })

        await api.publish(subj, ev, tenant=TENANT)
        api._nc.publish.assert_awaited_once()
        _, wire_bytes = api._nc.publish.call_args.args
        wire = json.loads(wire_bytes.decode())

        # Must use camelCase on the wire — matches TS SDK schema
        assert "scopeId" in wire, f"Expected 'scopeId' in wire, got keys: {list(wire)}"
        assert "activatedBy" in wire
        # Must NOT have snake_case variants at top level
        assert "scope_id" not in wire
        assert "activated_by" not in wire

    def test_T56_parse_event_accepts_camel_case_input(self):
        """parse_event must accept camelCase inbound messages (from TS publisher)."""
        data = {
            **_base(),
            "type": "scope.veto.activated",
            "scopeId": SCOPE_ID,        # camelCase from TS wire
            "activatedBy": "agent-007", # camelCase from TS wire
            "payload": _finality_payload(),
        }
        ev = parse_event(data)
        assert isinstance(ev, VetoActivatedEvent)
        assert ev.scope_id == SCOPE_ID
        assert ev.activated_by == "agent-007"

    def test_T57_parse_event_accepts_snake_case_input(self):
        """parse_event must also accept snake_case (Python-internal usage)."""
        data = {
            **_base(),
            "type": "scope.veto.activated",
            "scope_id": SCOPE_ID,        # snake_case — still valid
            "activated_by": "agent-007",
            "payload": _finality_payload(),
        }
        ev = parse_event(data)
        assert isinstance(ev, VetoActivatedEvent)

    # ── Drain warning (MEDIUM-NEW-12) ─────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_T58_drain_error_is_logged_not_swallowed(
        self, caplog: pytest.LogCaptureFixture
    ):
        """Drain errors during close() must be logged at WARNING, not silently dropped."""
        api = _connected_api()
        api._nc.drain = AsyncMock(side_effect=RuntimeError("drain failed"))

        with caplog.at_level(logging.WARNING, logger="sgrs_client.events.api"):
            await api.close()  # must not raise

        assert any("drain" in r.message.lower() for r in caplog.records)
