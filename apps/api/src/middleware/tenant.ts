/**
 * Tenant middleware — enforces the X-Tenant-ID header on every request.
 *
 * Validation rules (mirrors client-ts sanitiseDurable):
 *   - Must be present and non-empty
 *   - Characters: [A-Za-z0-9\-_] only (prevents path traversal, SQL injection)
 *   - Max length: 64 characters
 *
 * On success, the validated tenant ID is stored in `c.var.tenantId`.
 * On failure, returns 400 with a structured error body.
 */

import type { Context, MiddlewareHandler, Next } from "hono";

const TENANT_PATTERN = /^[A-Za-z0-9\-_]{1,64}$/;

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

  if (!raw) {
    return c.json(
      {
        error: "Missing X-Tenant-ID header",
        code: "TENANT_MISSING",
      },
      400
    );
  }

  if (!TENANT_PATTERN.test(raw)) {
    return c.json(
      {
        error:
          "X-Tenant-ID contains invalid characters. Allowed: [A-Za-z0-9\\-_], max 64 chars.",
        code: "TENANT_INVALID",
        received: raw,
      },
      400
    );
  }

  c.set("tenantId", raw);
  await next();
};
