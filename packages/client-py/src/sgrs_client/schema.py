"""Pydantic models for SGRS API types.

These models are derived from the Zod schemas defined in @sgrs/api-schema
and provide runtime validation for all API requests and responses.
"""

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, conint, constr

# ─── Slug identifiers (source of truth: @sgrs/api-schema SLUG_LOWERCASE_REGEX) ──

#: Lowercase slug: one char [a-z0-9], or [a-z0-9] + (hyphen + segment)* with no
#: leading/trailing hyphen. Mirrors ``SLUG_LOWERCASE_REGEX`` in @sgrs/api-schema.
SLUG_LOWERCASE_PATTERN = r"^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$"
_SLUG_LOWERCASE_RE = re.compile(SLUG_LOWERCASE_PATTERN)

#: ``X-Tenant-ID`` — kebab-case slug, no underscores or uppercase (max 64).
TenantId = constr(min_length=1, max_length=64, pattern=SLUG_LOWERCASE_PATTERN)
#: Scope identifier — kebab-case slug (max 120).
ScopeId = constr(min_length=1, max_length=120, pattern=SLUG_LOWERCASE_PATTERN)


def validate_tenant_id(value: str) -> str:
    """Validate a tenant id against the :data:`TenantId` contract.

    Mirrors the TypeScript client, which throws on an invalid tenant id.

    Args:
        value: Raw tenant id (leading/trailing whitespace is trimmed).

    Returns:
        The trimmed, validated tenant id.

    Raises:
        ValueError: If the tenant id is empty, longer than 64 characters, or
            contains anything other than lowercase ``a-z``, ``0-9`` and inner
            hyphens (no leading/trailing hyphen).
    """
    trimmed = value.strip()
    if len(trimmed) < 1 or len(trimmed) > 64 or not _SLUG_LOWERCASE_RE.match(trimmed):
        raise ValueError(
            f"Invalid tenant_id {value!r}: must be lowercase a-z, 0-9, hyphens only; "
            "no leading/trailing hyphen; 1-64 characters"
        )
    return trimmed


ScopeState = Literal["active", "near-final", "resolved", "escalated", "archived"]
ModelProvider = Literal["openai", "anthropic", "azure-openai", "ollama", "openai-compatible"]
FinalityDimension = Literal[
    "claim_confidence",
    "contradiction_resolution",
    "goal_completion",
    "risk_score_inverse",
]
ContradictionSeverity = Literal["low", "medium", "critical"]
ContradictionStatus = Literal["open", "resolved", "deferred"]
RiskLevel = Literal["low", "medium", "high", "critical"]
DocumentStatus = Literal["pending", "processing", "indexed", "failed"]


class Scope(BaseModel):
    """Governance scope with finality tracking."""

    id: ScopeId
    name: constr(min_length=1, max_length=200)
    tag: constr(min_length=1, max_length=40)
    state: ScopeState
    score: float = Field(ge=0.0, le=1.0)
    cycles: conint(ge=0)
    created_at: datetime
    updated_at: datetime


class ConnectModelRequest(BaseModel):
    """Request to connect a new LLM model provider."""

    provider: ModelProvider
    base_url: Optional[str] = None
    api_key: str
    model: str
    label: Optional[constr(max_length=80)] = None


class ModelHandle(BaseModel):
    """Opaque handle to a connected LLM model.

    The plaintext API key is never shared with the client after initial connection.
    """

    handle: constr(pattern=r"^mh_[a-z0-9]{24}$")
    provider: ModelProvider
    model: str
    label: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None


class Agent(BaseModel):
    """Autonomous agent that participates in finality consensus."""

    id: constr(pattern=r"^(int-|ag-)[a-z0-9]+$")
    name: str
    role: Literal[
        "extractor",
        "comparator",
        "arbiter",
        "proposer",
        "reviewer",
        "planner",
        "resolver",
        "status",
        "tuner",
    ]
    kind: Literal["internal", "external"]
    scopes: list[ScopeId]
    pubkey_ed25519: Optional[str] = None


class FinalityStatus(BaseModel):
    """Current finality consensus state for a scope."""

    scope_id: ScopeId
    score: float = Field(ge=0.0, le=1.0)
    per_dimension: dict[FinalityDimension, float] = Field(
        description="Score for each finality dimension"
    )
    monotonicity_rounds: conint(ge=0)
    plateau_ema: float = Field(description="Exponential moving average of plateau duration")
    convergence_rate: float = Field(description="Rate at which score converges")
    state: ScopeState
    veto_active: bool


class FinalityCertificate(BaseModel):
    """Cryptographically signed finality certificate."""

    id: str
    scope_id: ScopeId
    round: conint(ge=0)
    issued_at: datetime
    policy_hash: constr(pattern=r"^sha256:[a-f0-9]+$")
    signature_ed25519: str
    payload: FinalityStatus


# ─── Governance domain — read models ─────────────────────────────────────────


class Claim(BaseModel):
    """Factual assertion extracted by the swarm from a source document."""

    id: str
    scope_id: ScopeId
    text: constr(min_length=1, max_length=2000)
    source: constr(max_length=200)
    document_id: Optional[str] = None
    dimension: Optional[FinalityDimension] = None
    confidence: float = Field(ge=0.0, le=1.0)
    round: conint(ge=0)
    created_at: datetime


class Contradiction(BaseModel):
    """Conflicting claim pair detected by the comparator agent."""

    id: str
    scope_id: ScopeId
    claim_a: constr(max_length=2000)
    claim_b: constr(max_length=2000)
    source_a: constr(max_length=200)
    source_b: constr(max_length=200)
    severity: ContradictionSeverity
    status: ContradictionStatus
    resolution: Optional[constr(max_length=2000)] = None
    resolved_by: Optional[constr(max_length=200)] = None
    resolved_at: Optional[datetime] = None
    round: conint(ge=0)
    created_at: datetime


class Risk(BaseModel):
    """Identified risk item for a scope."""

    id: str
    scope_id: ScopeId
    description: constr(max_length=2000)
    level: RiskLevel
    category: Optional[constr(max_length=100)] = None
    source: constr(max_length=200)
    document_id: Optional[str] = None
    round: conint(ge=0)
    created_at: datetime


class SgrsDocument(BaseModel):
    """Source material ingested into a scope."""

    id: str
    scope_id: ScopeId
    name: constr(max_length=500)
    type: constr(max_length=50)
    status: DocumentStatus
    claim_count: conint(ge=0) = 0
    provenance: Optional[constr(max_length=500)] = None
    ingested_at: datetime


class EpochSummaryComment(BaseModel):
    """Human-in-the-loop comment attached to an epoch summary."""

    id: str
    author: constr(max_length=200)
    text: constr(min_length=1, max_length=5000)
    created_at: datetime


class EpochSummary(BaseModel):
    """Auto-generated narrative summary produced at the end of a round."""

    id: str
    scope_id: ScopeId
    round: conint(ge=0)
    summary_text: str
    claim_count: conint(ge=0)
    drift_count: conint(ge=0)
    contradiction_count: conint(ge=0)
    risk_count: conint(ge=0)
    score: float = Field(ge=0.0, le=1.0)
    state: ScopeState
    comments: list[EpochSummaryComment] = Field(default_factory=list)
    created_at: datetime


# ─── Product → Headless Swarm ingest contract ────────────────────────────────


class IngestDocumentRequest(BaseModel):
    """Document ingest payload — the public entrypoint into the headless swarm."""

    scope_id: ScopeId
    name: constr(min_length=1, max_length=500)
    type: constr(max_length=50) = "txt"
    text: constr(min_length=1, max_length=100_000)
    document_id: Optional[constr(min_length=1, max_length=200)] = None
    source: Optional[constr(min_length=1, max_length=500)] = None
    idempotency_key: Optional[constr(min_length=1, max_length=200)] = None


class IngestDocumentResponse(BaseModel):
    """Acknowledgement returned when a document is queued for the pipeline."""

    scope_id: ScopeId
    name: constr(min_length=1, max_length=500)
    type: constr(max_length=50)
    document_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    queued: Literal[True]
    seq: Optional[int] = None
    integration_version: Literal["v1"]
    message: str
