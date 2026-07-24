"""SGRS client — HTTP REST + optional NATS real-time events.

HTTP-only (no extra deps needed):
    from sgrs_client import create_client
    client = create_client(base_url='https://api.example.com')

With real-time events (pip install 'sgrs-client[nats]'):
    from sgrs_client import create_client, NatsConfig
    client = create_client(
        base_url='https://api.example.com',
        nats=NatsConfig(servers='nats://localhost:4222'),
    )
    await client.connect()
    await client.events.on_veto_activated('acme', handler)
    await client.close()
"""

from .client import Client, NatsConfig, create_client
from .events.api import (
    EventsApi,
    NatsNotConfiguredError,
    NatsNotConnectedError,
)
from .events.schema import (
    AgentEvent,
    AgentHeartbeatEvent,
    AgentTaskCompletedEvent,
    AgentTaskFailedEvent,
    AgentTaskStartedEvent,
    BaseEvent,
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
    create_base_event,
    parse_event,
)
from .schema import (
    Agent,
    Claim,
    ConnectModelRequest,
    Contradiction,
    ContradictionSeverity,
    ContradictionStatus,
    DocumentStatus,
    EpochSummary,
    EpochSummaryComment,
    FinalityCertificate,
    FinalityDimension,
    FinalityStatus,
    IngestDocumentRequest,
    IngestDocumentResponse,
    ModelHandle,
    ModelProvider,
    Risk,
    RiskLevel,
    Scope,
    ScopeId,
    ScopeState,
    SgrsDocument,
    TenantId,
)

__version__ = "0.1.0"

__all__ = [
    # Client
    "Client",
    "create_client",
    "NatsConfig",
    # Events API
    "EventsApi",
    "NatsNotConfiguredError",
    "NatsNotConnectedError",
    # Event types
    "BaseEvent",
    "SgrsEvent",
    "ScopeEvent",
    "ModelEvent",
    "AgentEvent",
    "ScopeCreatedEvent",
    "ScopeUpdatedEvent",
    "ScopeDeletedEvent",
    "FinalityChangedEvent",
    "FinalityNearFinalEvent",
    "FinalityFinalEvent",
    "VetoActivatedEvent",
    "VetoLiftedEvent",
    "ModelConnectedEvent",
    "ModelRevokedEvent",
    "AgentHeartbeatEvent",
    "AgentTaskStartedEvent",
    "AgentTaskCompletedEvent",
    "AgentTaskFailedEvent",
    "create_base_event",
    "parse_event",
    # REST schema types
    "Agent",
    "Claim",
    "ConnectModelRequest",
    "Contradiction",
    "ContradictionSeverity",
    "ContradictionStatus",
    "DocumentStatus",
    "EpochSummary",
    "EpochSummaryComment",
    "FinalityCertificate",
    "FinalityDimension",
    "FinalityStatus",
    "IngestDocumentRequest",
    "IngestDocumentResponse",
    "ModelHandle",
    "ModelProvider",
    "Risk",
    "RiskLevel",
    "Scope",
    "ScopeId",
    "ScopeState",
    "SgrsDocument",
    "TenantId",
]
