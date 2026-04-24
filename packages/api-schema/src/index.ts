import { z } from "zod";

/**
 * SGRS API — Zod schemas.
 *
 * These schemas are the single source of truth for the REST surface.
 * They are consumed by:
 *   - apps/studio          (validation in route handlers)
 *   - packages/client-ts   (type generation)
 *   - packages/client-py   (via openapi.json emitted from here)
 */

export const ScopeId = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/);
export type ScopeId = z.infer<typeof ScopeId>;

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
  per_dimension: z.record(FinalityDimension, z.number().min(0).max(1)),
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

/** Placeholder — full OpenAPI spec lives at packages/api-schema/openapi.json. */
export const API_VERSION = "v1";
