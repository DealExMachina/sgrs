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
 *   seed()            — insert Project Horizon demo data
 *   AnalyticsDb       — DuckDB analytics (audit log + finality time-series)
 */

// Database client
export { createDb } from "./client.js";
export type { Db } from "./client.js";

// Schema tables and types
export {
  scopes,
  modelHandles,
  agents,
  finalityStatus,
  finalityCertificates,
  scopeStateEnum,
  modelProviderEnum,
  agentRoleEnum,
  agentKindEnum,
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
} from "./schema.js";

// Cryptography
export { encryptApiKey, decryptApiKey, validateEncryptionKey } from "./crypto.js";

// Migrations
export { runMigrations } from "./migrate.js";

// Seed
export { seed } from "./seed.js";

// Analytics
export { AnalyticsDb } from "./analytics/index.js";
export type { AuditEvent, FinalitySnapshot } from "./analytics/index.js";
