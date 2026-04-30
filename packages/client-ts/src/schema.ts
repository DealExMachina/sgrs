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
  // Version
  API_VERSION,
} from "@sgrs/api-schema";
