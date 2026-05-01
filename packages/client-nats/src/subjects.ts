/**
 * @sgrs/client-nats — re-exports NATS subject helpers from `@sgrs/client-ts`.
 */

export {
  tok,
  assertOwnedByTenant,
  subjects,
  allTenantSubjects,
  auditStreamName,
  scopeStreamName,
  SGRS_PREFIX,
  sanitiseDurable,
} from "@sgrs/client-ts";
