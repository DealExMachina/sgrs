/**
 * Re-export Zod schemas and types from @sgrs/api-schema.
 *
 * This provides consumers with access to the single source of truth
 * for API validation without creating a circular dependency.
 */

export {
  // Scope
  ScopeId,
  type ScopeId,
  ScopeState,
  type ScopeState,
  Scope,
  type Scope,
  // Model
  ModelProvider,
  type ModelProvider,
  ConnectModelRequest,
  type ConnectModelRequest,
  ModelHandle,
  type ModelHandle,
  // Agent
  Agent,
  type Agent,
  // Finality
  FinalityDimension,
  type FinalityDimension,
  FinalityStatus,
  type FinalityStatus,
  FinalityCertificate,
  type FinalityCertificate,
  // Version
  API_VERSION,
} from "@sgrs/api-schema";
