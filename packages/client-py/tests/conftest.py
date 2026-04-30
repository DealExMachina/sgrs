"""Pytest configuration for the sgrs-client test suite.

Sets asyncio_mode=auto so every async test function is awaited automatically
without needing the @pytest.mark.asyncio decorator on each one.

The `nats` package is an optional dependency (pip install 'sgrs-client[nats]').
When it is not installed we provide a minimal stub so that unit tests that
don't actually connect to NATS can still import and exercise the events layer.
"""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock


def _build_nats_stub() -> ModuleType:
    """Build a minimal nats-py stub for offline test environments."""
    nats_mod = ModuleType("nats")
    nats_mod.connect = AsyncMock()  # type: ignore[attr-defined]

    js_api = ModuleType("nats.js.api")

    class _DeliverPolicy:  # noqa: D401
        ALL = "all"

    class _AckPolicy:
        EXPLICIT = "explicit"

    class _StreamConfig:
        def __init__(self, **kwargs: object) -> None:
            pass

    class _ConsumerConfig:
        def __init__(self, **kwargs: object) -> None:
            pass

    js_api.DeliverPolicy = _DeliverPolicy  # type: ignore[attr-defined]
    js_api.AckPolicy = _AckPolicy  # type: ignore[attr-defined]
    js_api.StreamConfig = _StreamConfig  # type: ignore[attr-defined]
    js_api.ConsumerConfig = _ConsumerConfig  # type: ignore[attr-defined]

    nats_mod.js = ModuleType("nats.js")  # type: ignore[attr-defined]
    sys.modules["nats.js"] = nats_mod.js  # type: ignore[attr-defined]
    sys.modules["nats.js.api"] = js_api

    return nats_mod


# Register the stub only when nats-py is not actually installed.
if "nats" not in sys.modules:
    try:
        import nats  # noqa: F401
    except ImportError:
        sys.modules["nats"] = _build_nats_stub()
