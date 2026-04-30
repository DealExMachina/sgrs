/**
 * SGRS Drizzle ORM schema — PostgreSQL dialect.
 *
 * Works with both PGlite (dev / in-process) and postgres-js (production).
 * Every table carries a denormalized `tenant_id` column for row-level
 * tenant isolation at the query layer (no RLS required).
 */

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const scopeStateEnum = pgEnum("scope_state", [
  "active",
  "near-final",
  "resolved",
  "escalated",
  "archived",
]);

export const modelProviderEnum = pgEnum("model_provider", [
  "openai",
  "anthropic",
  "azure-openai",
  "ollama",
  "openai-compatible",
]);

export const agentRoleEnum = pgEnum("agent_role", [
  "extractor",
  "comparator",
  "arbiter",
  "proposer",
  "reviewer",
  "planner",
  "resolver",
  "status",
  "tuner",
]);

export const agentKindEnum = pgEnum("agent_kind", ["internal", "external"]);

export const driftSeverityEnum = pgEnum("drift_severity", ["low", "medium", "high"]);
export const contradictionSeverityEnum = pgEnum("contradiction_severity", ["low", "medium", "critical"]);
export const contradictionStatusEnum = pgEnum("contradiction_status", ["open", "resolved", "deferred"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high", "critical"]);
export const documentStatusEnum = pgEnum("document_status", ["pending", "processing", "indexed", "failed"]);

// ─── Tables ───────────────────────────────────────────────────────────────────

/**
 * Governance scopes — the primary unit of analysis.
 */
export const scopes = pgTable("scopes", {
  id: text("id").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  state: scopeStateEnum("state").notNull().default("active"),
  score: real("score").notNull().default(0),
  cycles: integer("cycles").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Model handles — opaque references to connected AI models.
 * The plaintext API key is never stored; only the AES-256-GCM ciphertext.
 */
export const modelHandles = pgTable("model_handles", {
  handle: text("handle").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  provider: modelProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  label: text("label"),
  /** AES-256-GCM encrypted API key — format: base64(iv):base64(authTag):base64(ciphertext) */
  api_key_enc: text("api_key_enc").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
});

/**
 * Swarm agents — both internal kernel agents and external integrations.
 */
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  name: text("name").notNull(),
  role: agentRoleEnum("role").notNull(),
  kind: agentKindEnum("kind").notNull(),
  /** JSON array of scope IDs this agent is assigned to. */
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  pubkey_ed25519: text("pubkey_ed25519"),
});

/**
 * Live finality status — one row per scope, upserted on every convergence tick.
 */
export const finalityStatus = pgTable("finality_status", {
  scope_id: text("scope_id")
    .primaryKey()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  score: real("score").notNull().default(0),
  /** JSON map of FinalityDimension → score (0–1). */
  per_dimension: jsonb("per_dimension")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  monotonicity_rounds: integer("monotonicity_rounds").notNull().default(0),
  plateau_ema: real("plateau_ema").notNull().default(0),
  convergence_rate: real("convergence_rate").notNull().default(0),
  state: scopeStateEnum("state").notNull().default("active"),
  veto_active: boolean("veto_active").notNull().default(false),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Finality certificates — issued once per scope upon terminal convergence.
 * Immutable — never updated, only appended.
 */
export const finalityCertificates = pgTable("finality_certificates", {
  id: text("id").primaryKey(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  round: integer("round").notNull(),
  issued_at: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  policy_hash: text("policy_hash").notNull(),
  signature_ed25519: text("signature_ed25519").notNull(),
  /** Full FinalityStatus snapshot at the moment of convergence. */
  payload: jsonb("payload").notNull(),
});

// ─── Governance domain tables ─────────────────────────────────────────────────

/**
 * Claims — factual assertions extracted by the swarm from source documents.
 * Append-only. The kernel inserts; the Studio reads.
 */
export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  text: text("text").notNull(),
  source: text("source").notNull(),
  dimension: text("dimension"),         // FinalityDimension value, nullable
  confidence: real("confidence").notNull(),
  round: integer("round").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Drifts — detected confidence changes between rounds.
 * Append-only.
 */
export const drifts = pgTable("drifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  claim_id: uuid("claim_id"),           // optional FK to claims.id
  subject: text("subject").notNull(),
  previous_confidence: real("previous_confidence").notNull(),
  current_confidence: real("current_confidence").notNull(),
  delta: real("delta").notNull(),
  severity: driftSeverityEnum("severity").notNull(),
  round: integer("round").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Contradictions — conflicting claim pairs detected by the comparator agent.
 * Mutable: status transitions via HITL (open → resolved | deferred).
 */
export const contradictions = pgTable("contradictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  claim_a: text("claim_a").notNull(),
  claim_b: text("claim_b").notNull(),
  source_a: text("source_a").notNull(),
  source_b: text("source_b").notNull(),
  severity: contradictionSeverityEnum("severity").notNull(),
  status: contradictionStatusEnum("status").notNull().default("open"),
  resolution: text("resolution"),
  resolved_by: text("resolved_by"),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
  round: integer("round").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Risks — identified risk items. Append-only.
 */
export const risks = pgTable("risks", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  description: text("description").notNull(),
  level: riskLevelEnum("level").notNull(),
  category: text("category"),
  source: text("source").notNull(),
  round: integer("round").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Documents — source material ingested into a scope.
 * Future: add/remove triggers swarm recalibration (claim invalidation).
 */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),          // "pdf" | "docx" | "xlsx" | "txt" | "url"
  status: documentStatusEnum("status").notNull().default("pending"),
  claim_count: integer("claim_count").notNull().default(0),
  ingested_at: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Epoch summaries — auto-generated at end of each convergence round.
 * Comments are stored as JSONB to keep the schema simple (≤50 comments/epoch).
 */
export const epochSummaries = pgTable("epoch_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope_id: text("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  tenant_id: text("tenant_id").notNull(),
  round: integer("round").notNull(),
  summary_text: text("summary_text").notNull(),
  claim_count: integer("claim_count").notNull().default(0),
  drift_count: integer("drift_count").notNull().default(0),
  contradiction_count: integer("contradiction_count").notNull().default(0),
  risk_count: integer("risk_count").notNull().default(0),
  score: real("score").notNull().default(0),
  state: scopeStateEnum("state").notNull().default("active"),
  /** JSON array of EpochSummaryComment objects. */
  comments: jsonb("comments").$type<Array<{
    id: string; author: string; text: string; created_at: string;
  }>>().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Type inference helpers ───────────────────────────────────────────────────

export type Scope = typeof scopes.$inferSelect;
export type NewScope = typeof scopes.$inferInsert;
export type ModelHandle = typeof modelHandles.$inferSelect;
export type NewModelHandle = typeof modelHandles.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type FinalityStatusRow = typeof finalityStatus.$inferSelect;
export type NewFinalityStatus = typeof finalityStatus.$inferInsert;
export type FinalityCertificate = typeof finalityCertificates.$inferSelect;
export type NewFinalityCertificate = typeof finalityCertificates.$inferInsert;
export type ClaimRow = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
export type DriftRow = typeof drifts.$inferSelect;
export type NewDrift = typeof drifts.$inferInsert;
export type ContradictionRow = typeof contradictions.$inferSelect;
export type NewContradiction = typeof contradictions.$inferInsert;
export type RiskRow = typeof risks.$inferSelect;
export type NewRisk = typeof risks.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type EpochSummaryRow = typeof epochSummaries.$inferSelect;
export type NewEpochSummary = typeof epochSummaries.$inferInsert;
