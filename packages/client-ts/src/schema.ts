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
  Drift,
  DriftSeverity,
  Contradiction,
  ContradictionSeverity,
  ContradictionStatus,
  ResolveContradictionBody,
  Risk,
  RiskLevel,
  SgrsDocument,
  DocumentStatus,
  EpochSummary,
  EpochSummaryComment,
  AddEpochCommentBody,
  // Version
  API_VERSION,
  // Ingest
  IngestDocumentRequest,
  IngestDocumentResponse,
} from "@sgrs/api-schema";
