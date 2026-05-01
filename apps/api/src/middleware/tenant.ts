/**
 * Tenant middleware — enforces the X-Tenant-ID header on every request.
 *
 * Validation rules — same as `@sgrs/api-schema` {@link TenantId}:
 *   - Must be present and non-empty (after trim)
 *   - Lowercase slug: `[a-z0-9]` or `[a-z0-9]([a-z0-9-]*[a-z0-9])?`
 *   - No underscores, no uppercase
 *   - Max length: 64
 *
 * On success, the validated tenant ID is stored in `c.var.tenantId`.
 * On failure, returns 400 with a structured error body.
 */

import { TenantId } from "@sgrs/api-schema";
import type { Context, MiddlewareHandler, Next } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
  }
}

export const tenantMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const raw = c.req.header("x-tenant-id") ?? c.req.header("X-Tenant-ID") ?? "";

  if (!raw.trim()) {
    return c.json(
      {
        error: "Missing X-Tenant-ID header",
        code: "TENANT_MISSING",
      },
      400
    );
  }

  const parsed = TenantId.safeParse(raw.trim());
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json(
      {
        error: msg || "Invalid X-Tenant-ID",
        code: "TENANT_INVALID",
        received: raw,
      },
      400
    );
  }

  c.set("tenantId", parsed.data);
  await next();
};
