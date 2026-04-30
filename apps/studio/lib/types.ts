export type Mode = "business" | "configure" | "debug";

/**
 * Re-export the canonical scope type from the API schema so Studio components
 * only need to import from `@/lib/types` rather than `@sgrs/api-schema`.
 */
export type { Scope as ScopeItem } from "@sgrs/api-schema";

/** Tenant ID used for all API calls. Reads NEXT_PUBLIC_TENANT_ID at runtime. */
export const DEFAULT_TENANT_ID =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TENANT_ID) ||
  "horizon";
