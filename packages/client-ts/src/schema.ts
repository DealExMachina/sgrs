/**
 * Re-export Zod schemas and types from @sgrs/api-schema.
 *
 * This provides consumers with access to the single source of truth
 * for API validation without creating a circular dependency.
 */

export {
  // Scope
  ScopeId,
  ScopeState,
  Scope,
  // Model
  ModelProvider,
  ConnectModelRequest,
  ModelHandle,
  // Agent
  Agent,
  // Finality
  FinalityDimension,
  FinalityStatus,
  FinalityCertificate,
  // Governance domain (read models)
  Claim,
  Contradiction,
  ContradictionSeverity,
  ContradictionStatus,
  Risk,
  RiskLevel,
  SgrsDocument,
  DocumentStatus,
  EpochSummary,
  EpochSummaryComment,
  // Version
  API_VERSION,
  // Ingest
  IngestDocumentRequest,
  IngestDocumentResponse,
} from "@sgrs/api-schema";
