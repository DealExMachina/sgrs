import { z } from "zod";

/**
 * SGRS API — Zod schemas.
 *
 * These schemas and the sibling openapi.json are the single source of truth
 * for the REST surface.
 * They are consumed by:
 *   - apps/studio          (validation in route handlers)
 *   - packages/client-ts   (type generation)
 *   - packages/client-py   (via openapi.json emitted from here)
 */

/** Lowercase slug: one char [a-z0-9], or [a-z0-9] + (hyphen + segment)* with no leading/trailing hyphen. */
export const SLUG_LOWERCASE_REGEX =
  /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/;

/** `X-Tenant-ID` — kebab-case slug, no underscores or uppercase (max 64). */
export const TenantId = z
  .string()
  .min(1)
  .max(64)
  .regex(
    SLUG_LOWERCASE_REGEX,
    "tenant id must be lowercase a-z, 0-9, hyphens only; no leading/trailing hyphen",
  );
export type TenantId = z.infer<typeof TenantId>;

export const ScopeId = z
  .string()
  .min(1)
  .max(120)
  .regex(
    SLUG_LOWERCASE_REGEX,
    "scope id must be lowercase a-z, 0-9, hyphens only; no leading/trailing hyphen",
  );
export type ScopeId = z.infer<typeof ScopeId>;

const MAX_NATS_SLUG_LEN = 120;

/**
 * Validate a NATS subject segment (tenant id, scope id, model handle, …).
 * Matches {@link TenantId} / {@link ScopeId} lexical rules; max length 120.
 */
export function assertNatsSubjectSlug(value: string): string {
  const t = value.trim();
  if (!t) {
    throw new Error("NATS subject token must not be empty");
  }
  if (t.length > MAX_NATS_SLUG_LEN) {
    throw new Error(
      `NATS subject token too long (max ${MAX_NATS_SLUG_LEN} chars): "${t.slice(0, 24)}…"`,
    );
  }
  if (!SLUG_LOWERCASE_REGEX.test(t)) {
    throw new Error(
      `Invalid NATS subject token ${JSON.stringify(value)}: use lowercase a-z, digits, and hyphens inside the segment only (no underscores or uppercase)`,
    );
  }
  return t;
}

export const ScopeState = z.enum([
  "active",
  "near-final",
  "resolved",
  "escalated",
  "archived",
]);
export type ScopeState = z.infer<typeof ScopeState>;

export const Scope = z.object({
  id: ScopeId,
  name: z.string().min(1).max(200),
  tag: z.string().min(1).max(40),
  state: ScopeState,
  score: z.number().min(0).max(1),
  cycles: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Scope = z.infer<typeof Scope>;

export const ModelProvider = z.enum([
  "openai",
  "anthropic",
  "azure-openai",
  "ollama",
  "openai-compatible",
]);
export type ModelProvider = z.infer<typeof ModelProvider>;

/**
 * Connecting a model stores the key server-side and returns an opaque handle.
 * The handle is all the UI ever sees — the plaintext API key never traverses
 * the client boundary again.
 */
export const ConnectModelRequest = z.object({
  provider: ModelProvider,
  base_url: z.string().url().optional(),
  api_key: z.string().min(1),
  model: z.string().min(1),
  label: z.string().max(80).optional(),
});
export type ConnectModelRequest = z.infer<typeof ConnectModelRequest>;

export const ModelHandle = z.object({
  handle: z.string().regex(/^mh_[a-z0-9]{24}$/),
  provider: ModelProvider,
  model: z.string(),
  label: z.string().optional(),
  created_at: z.string().datetime(),
  last_used_at: z.string().datetime().nullable(),
});
export type ModelHandle = z.infer<typeof ModelHandle>;

export const Agent = z.object({
  id: z.string().regex(/^(int-|ag-)[a-z0-9]+$/),
  name: z.string(),
  role: z.enum([
    "extractor",
    "comparator",
    "arbiter",
    "proposer",
    "reviewer",
    "planner",
    "resolver",
    "status",
    "tuner",
  ]),
  kind: z.enum(["internal", "external"]),
  scopes: z.array(ScopeId),
  pubkey_ed25519: z.string().optional(),
});
export type Agent = z.infer<typeof Agent>;

export const FinalityDimension = z.enum([
  "claim_confidence",
  "contradiction_resolution",
  "goal_completion",
  "risk_score_inverse",
]);
export type FinalityDimension = z.infer<typeof FinalityDimension>;

export const FinalityStatus = z.object({
  scope_id: ScopeId,
  score: z.number().min(0).max(1),
  per_dimension: z.record(z.string(), z.number().min(0).max(1)),
  monotonicity_rounds: z.number().int().nonnegative(),
  plateau_ema: z.number(),
  convergence_rate: z.number(),
  state: ScopeState,
  veto_active: z.boolean(),
});
export type FinalityStatus = z.infer<typeof FinalityStatus>;

export const FinalityCertificate = z.object({
  id: z.string(),
  scope_id: ScopeId,
  round: z.number().int().nonnegative(),
  issued_at: z.string().datetime(),
  policy_hash: z.string().regex(/^sha256:[a-f0-9]+$/),
  signature_ed25519: z.string(),
  payload: FinalityStatus,
});
export type FinalityCertificate = z.infer<typeof FinalityCertificate>;

// ─── Governance domain — Claims ───────────────────────────────────────────────

export const Claim = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  /** Human-readable assertion extracted by the swarm. */
  text: z.string().min(1).max(2000),
  /** Source document name or agent identifier that produced this claim. */
  source: z.string().max(200),
  /** Provenance link to the originating document (documents.id) for traceability. */
  document_id: z.string().uuid().optional(),
  /** Which finality dimension this claim primarily informs. */
  dimension: FinalityDimension.optional(),
  /** Confidence score 0–1 assigned by the extraction agent. */
  confidence: z.number().min(0).max(1),
  /** Convergence round in which the claim was extracted. */
  round: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});
export type Claim = z.infer<typeof Claim>;

// ─── Governance domain — Drifts ───────────────────────────────────────────────

export const DriftSeverity = z.enum(["low", "medium", "high"]);
export type DriftSeverity = z.infer<typeof DriftSeverity>;

export const Drift = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  /** ID of the claim that changed, if applicable. */
  claim_id: z.string().uuid().optional(),
  /** Human-readable description of what drifted. e.g. "claim.ARR" */
  subject: z.string().max(200),
  previous_confidence: z.number().min(0).max(1),
  current_confidence: z.number().min(0).max(1),
  /** Signed confidence delta. Negative means degradation. */
  delta: z.number(),
  severity: DriftSeverity,
  round: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});
export type Drift = z.infer<typeof Drift>;

// ─── Governance domain — Contradictions ──────────────────────────────────────

export const ContradictionSeverity = z.enum(["low", "medium", "critical"]);
export type ContradictionSeverity = z.infer<typeof ContradictionSeverity>;

export const ContradictionStatus = z.enum(["open", "resolved", "deferred"]);
export type ContradictionStatus = z.infer<typeof ContradictionStatus>;

export const Contradiction = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  /** Text of the first conflicting claim. */
  claim_a: z.string().max(2000),
  /** Text of the second conflicting claim. */
  claim_b: z.string().max(2000),
  /** Source of claim A (document or agent). */
  source_a: z.string().max(200),
  /** Source of claim B (document or agent). */
  source_b: z.string().max(200),
  severity: ContradictionSeverity,
  status: ContradictionStatus,
  /** Human resolution text — set when status is "resolved". */
  resolution: z.string().max(2000).optional(),
  /** User or agent that resolved/deferred. */
  resolved_by: z.string().max(200).optional(),
  resolved_at: z.string().datetime().optional(),
  round: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});
export type Contradiction = z.infer<typeof Contradiction>;

/** PATCH body for HITL contradiction resolution. */
export const ResolveContradictionBody = z.object({
  status: z.enum(["resolved", "deferred"]),
  resolution: z.string().min(1).max(2000).optional(),
  resolved_by: z.string().min(1).max(200),
});
export type ResolveContradictionBody = z.infer<typeof ResolveContradictionBody>;

// ─── Governance domain — Risks ────────────────────────────────────────────────

export const RiskLevel = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const Risk = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  /** Plain-language description of the risk. */
  description: z.string().max(2000),
  level: RiskLevel,
  /** e.g. "legal" | "financial" | "operational" | "reputational" */
  category: z.string().max(100).optional(),
  /** Source document or agent that identified this risk. */
  source: z.string().max(200),
  /** Provenance link to the originating document (documents.id) for traceability. */
  document_id: z.string().uuid().optional(),
  round: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});
export type Risk = z.infer<typeof Risk>;

// ─── Governance domain — Documents ───────────────────────────────────────────

export const DocumentStatus = z.enum(["pending", "processing", "indexed", "failed"]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const SgrsDocument = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  /** Display name of the document (filename or URL title). */
  name: z.string().max(500),
  /** File extension / MIME category: "pdf" | "docx" | "xlsx" | "txt" | "url" */
  type: z.string().max(50),
  status: DocumentStatus,
  /** Number of claims extracted from this document so far. */
  claim_count: z.number().int().nonnegative().default(0),
  /**
   * Stable provenance reference for traceability — a content hash, source URI,
   * or external document id (e.g. "sha256:…", "s3://…", "https://…").
   */
  provenance: z.string().max(500).optional(),
  ingested_at: z.string().datetime(),
});
export type SgrsDocument = z.infer<typeof SgrsDocument>;

// ─── Product → Headless Swarm Ingest Contract ────────────────────────────────

export const IngestDocumentRequest = z.object({
  scope_id: ScopeId,
  name: z.string().min(1).max(500),
  type: z.string().max(50).default("txt"),
  text: z.string().min(1).max(100_000),
  /** Optional product-side document identifier, echoed to the swarm for correlation. */
  document_id: z.string().min(1).max(200).optional(),
  /** Optional product/source channel label (upload, url, api, etc.). */
  source: z.string().min(1).max(500).optional(),
  /** Idempotency key supplied by clients or Studio for retry-safe ingestion. */
  idempotency_key: z.string().min(1).max(200).optional(),
});
export type IngestDocumentRequest = z.infer<typeof IngestDocumentRequest>;

export const IngestDocumentResponse = z.object({
  scope_id: ScopeId,
  name: z.string().min(1).max(500),
  type: z.string().max(50),
  document_id: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  queued: z.literal(true),
  seq: z.number().int().nonnegative().nullable(),
  integration_version: z.literal("v1"),
  message: z.string(),
});
export type IngestDocumentResponse = z.infer<typeof IngestDocumentResponse>;

// ─── Governance domain — Epoch summaries ─────────────────────────────────────

export const EpochSummaryComment = z.object({
  id: z.string().uuid(),
  author: z.string().max(200),
  text: z.string().min(1).max(5000),
  created_at: z.string().datetime(),
});
export type EpochSummaryComment = z.infer<typeof EpochSummaryComment>;

export const EpochSummary = z.object({
  id: z.string().uuid(),
  scope_id: ScopeId,
  round: z.number().int().nonnegative(),
  /** Auto-generated narrative summary of the epoch. */
  summary_text: z.string(),
  claim_count: z.number().int().nonnegative(),
  drift_count: z.number().int().nonnegative(),
  contradiction_count: z.number().int().nonnegative(),
  risk_count: z.number().int().nonnegative(),
  score: z.number().min(0).max(1),
  state: ScopeState,
  comments: z.array(EpochSummaryComment).default([]),
  created_at: z.string().datetime(),
});
export type EpochSummary = z.infer<typeof EpochSummary>;

/** POST body for adding a HITL comment to an epoch summary. */
export const AddEpochCommentBody = z.object({
  author: z.string().min(1).max(200),
  text: z.string().min(1).max(5000),
});
export type AddEpochCommentBody = z.infer<typeof AddEpochCommentBody>;

/** Placeholder — full OpenAPI spec lives at packages/api-schema/openapi.json. */
export const API_VERSION = "v1";
export const OPENAPI_SPEC_PATH = "packages/api-schema/openapi.json";
