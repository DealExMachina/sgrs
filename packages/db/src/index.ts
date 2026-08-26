/**
 * @sgrs/db — SGRS persistence layer.
 *
 * Exports:
 *   createDb()        — dual-driver Drizzle factory (PGlite / postgres-js)
 *   schema.*          — Drizzle table definitions and type helpers
 *   encryptApiKey()   — AES-256-GCM encryption for API keys at rest
 *   decryptApiKey()   — AES-256-GCM decryption
 *   validateEncryptionKey() — startup validator for ENCRYPTION_KEY env var
 *   runMigrations()   — apply pending Drizzle-kit migrations
 *   seed()            — insert Deal Ex Machina (`deal-ex-machina`) demo data
 *   AnalyticsDb       — DuckDB analytics (audit log + finality time-series)
 */

// Database client
export { createDb, closeDb } from "./client.js";
export type { Db } from "./client.js";

// Schema tables and types
export {
  scopes,
  modelHandles,
  agents,
  finalityStatus,
  finalityCertificates,
  claims,
  drifts,
  contradictions,
  risks,
  documents,
  epochSummaries,
  organizations,
  tenants,
  projects,
  orgMemberships,
  projectMemberships,
  scopeGrants,
  apiKeys,
  orgRoleEnum,
  projectRoleEnum,
  scopePermissionEnum,
  scopeStateEnum,
  modelProviderEnum,
  agentRoleEnum,
  agentKindEnum,
  driftSeverityEnum,
  contradictionSeverityEnum,
  contradictionStatusEnum,
  riskLevelEnum,
  documentStatusEnum,
} from "./schema.js";
export type {
  Scope,
  NewScope,
  ModelHandle,
  NewModelHandle,
  Agent,
  NewAgent,
  FinalityStatusRow,
  NewFinalityStatus,
  FinalityCertificate,
  NewFinalityCertificate,
  ClaimRow,
  NewClaim,
  DriftRow,
  NewDrift,
  ContradictionRow,
  NewContradiction,
  RiskRow,
  NewRisk,
  DocumentRow,
  NewDocument,
  EpochSummaryRow,
  NewEpochSummary,
  TenantRow,
  NewTenant,
  OrganizationRow,
  NewOrganization,
  ProjectRow,
  NewProject,
  OrgMembershipRow,
  ProjectMembershipRow,
  ScopeGrantRow,
  ApiKeyRow,
  NewApiKey,
} from "./schema.js";

// Cryptography
export {
  encryptApiKey,
  decryptApiKey,
  validateEncryptionKey,
  hashApiKey,
  generateTenantApiKey,
} from "./crypto.js";
export type { ApiKeyEnv } from "./crypto.js";

// Migrations
export { runMigrations } from "./migrate.js";

// Seed
export { seed } from "./seed.js";

// Analytics
export { AnalyticsDb } from "./analytics/index.js";
export type { AuditEvent, FinalitySnapshot } from "./analytics/index.js";
