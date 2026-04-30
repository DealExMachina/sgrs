"""Pydantic models for SGRS API types.

These models are derived from the Zod schemas defined in @sgrs/api-schema
and provide runtime validation for all API requests and responses.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, conint, constr

# Type aliases for common patterns
ScopeId = constr(min_length=1, max_length=120, pattern=r"^[a-z0-9][a-z0-9-]*$")
ScopeState = Literal["active", "near-final", "resolved", "escalated", "archived"]
ModelProvider = Literal["openai", "anthropic", "azure-openai", "ollama", "openai-compatible"]
FinalityDimension = Literal[
    "claim_confidence",
    "contradiction_resolution",
    "goal_completion",
    "risk_score_inverse",
]


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
