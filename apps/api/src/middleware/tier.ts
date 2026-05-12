/**
 * Three-tier authentication middleware for the SGRS API.
 *
 * Tiers, in increasing privilege:
 *
 *   1. tenant    — end users (existing /api/* routes; X-Tenant-ID required downstream)
 *   2. admin     — operators / setup-and-manage operations (/admin/*)
 *   3. godlike   — deep internals for development (/internals/*); IP allowlist
 *
 * A higher-tier key is accepted on lower-tier routes (hierarchical), but the
 * actual presented tier is recorded in the audit log so privilege is never
 * laundered through the route surface.
 *
 * Configuration:
 *
 *   TENANT_API_KEY        — Bearer secret for tenant tier (legacy: API_KEY)
 *   ADMIN_API_KEY         — Bearer secret for admin tier
 *   GODLIKE_API_KEY       — Bearer secret for godlike tier
 *   GODLIKE_IP_ALLOWLIST  — CSV of allowed client IPs for godlike (optional but
 *                           strongly recommended; warning emitted if unset)
 *
 * Behaviour when keys are missing:
 *
 *   - tenant: if TENANT_API_KEY (or API_KEY) is unset, /api/* is open (dev mode).
 *             validateAuthConfig() should be called in production startup.
 *   - admin: if no ADMIN_API_KEY and no GODLIKE_API_KEY, /admin/* returns 503.
 *   - godlike: if no GODLIKE_API_KEY, /internals/* returns 503.
 *
 * Security: bearer comparisons use timingSafeEqual on HMAC-SHA256 digests.
 *
 * Audit: every admin or godlike call (allow OR deny) appends one row to the
 * DuckDB audit_events table with the actual tier presented and a stable keyid.
 * Tenant calls are not audited here — route handlers already audit their own
 * mutations.
 */

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { AnalyticsDb } from "@sgrs/db";

export type AuthTier = "tenant" | "admin" | "godlike";

declare module "hono" {
  interface ContextVariableMap {
    authTier: AuthTier;
  }
}

const HMAC_KEY = Buffer.from("sgrs-auth-hmac-key-v1");
const TIER_RANK: Record<AuthTier, number> = {
  tenant: 1,
  admin: 2,
  godlike: 3,
};

function digest(value: string): Buffer {
  return createHmac("sha256", HMAC_KEY).update(value).digest();
}

function keyId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function tenantKey(): string | null {
  return process.env.TENANT_API_KEY ?? process.env.API_KEY ?? null;
}
function adminKey(): string | null {
  return process.env.ADMIN_API_KEY ?? null;
}
function godlikeKey(): string | null {
  return process.env.GODLIKE_API_KEY ?? null;
}

/** Resolve which tier the presented bearer corresponds to (highest match wins). */
function resolvePresentedTier(token: string): AuthTier | null {
  const checks: Array<[AuthTier, string | null]> = [
    ["godlike", godlikeKey()],
    ["admin", adminKey()],
    ["tenant", tenantKey()],
  ];
  for (const [tier, key] of checks) {
    if (key && timingSafeEqual(digest(token), digest(key))) return tier;
  }
  return null;
}

/** First IP from X-Forwarded-For, then X-Real-IP. */
function clientIp(c: Context): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return c.req.header("x-real-ip") ?? null;
}

function ipAllowed(ip: string | null, allowlistCsv: string): boolean {
  const set = allowlistCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (set.length === 0) return false;
  return ip != null && set.includes(ip);
}

export interface TierMiddlewareOptions {
  /** Optional analytics DB; required only if you want auth audit rows. */
  analytics?: AnalyticsDb;
}

interface AuditPayload {
  method: string;
  required_tier: AuthTier;
  presented_tier: AuthTier | null;
  reason?: string;
  ip?: string | null;
}

/** Best-effort audit logger; never throws back into the request. */
async function audit(
  c: Context,
  opts: TierMiddlewareOptions,
  required: AuthTier,
  outcome: "allow" | "deny",
  presented: AuthTier | null,
  presentedKeyId: string | null,
  reason?: string,
): Promise<void> {
  if (!opts.analytics) return;
  try {
    const payload: AuditPayload = {
      method: c.req.method,
      required_tier: required,
      presented_tier: presented,
      ip: clientIp(c),
    };
    if (reason) payload.reason = reason;
    await opts.analytics.appendAudit({
      event_type: `auth.${required}.${outcome}`,
      tenant_id: c.var.tenantId ?? "system",
      entity_id: c.req.path,
      actor: presentedKeyId ? `keyid:${presentedKeyId}` : "anonymous",
      payload,
    });
  } catch (err) {
    console.error("[sgrs][auth] audit append failed:", err);
  }
}

/**
 * Build a `requireTier(min)` middleware factory.
 *
 * The returned function produces Hono middleware that admits the request
 * only if the presented bearer matches a configured key whose tier rank is
 * at least `min`. Tenant tier with no configured key is a dev-mode pass-through.
 */
export function makeRequireTier(opts: TierMiddlewareOptions = {}) {
  return (min: AuthTier): MiddlewareHandler =>
    async (c: Context, next: Next) => {
      // Tenant dev-mode: no tenant key configured → open route.
      if (min === "tenant" && !tenantKey()) {
        c.set("authTier", "tenant");
        await next();
        return;
      }

      // Admin tier requires admin or godlike key configured.
      if (min === "admin" && !adminKey() && !godlikeKey()) {
        await audit(c, opts, min, "deny", null, null, "admin_key_not_configured");
        return c.json(
          { error: "Admin API not configured.", code: "ADMIN_DISABLED" },
          503,
        );
      }

      // Godlike requires only godlike key configured.
      if (min === "godlike" && !godlikeKey()) {
        await audit(c, opts, min, "deny", null, null, "godlike_key_not_configured");
        return c.json(
          { error: "Internals API not configured.", code: "GODLIKE_DISABLED" },
          503,
        );
      }

      const authHeader = c.req.header("authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        await audit(c, opts, min, "deny", null, null, "missing_bearer");
        return c.json(
          {
            error: "Authorization header missing or malformed.",
            code: "AUTH_MISSING",
          },
          401,
        );
      }

      const token = authHeader.slice(7).trim();
      const presented = resolvePresentedTier(token);
      if (!presented) {
        await audit(c, opts, min, "deny", null, null, "invalid_key");
        return c.json(
          { error: "Invalid API key.", code: "AUTH_INVALID" },
          401,
        );
      }

      if (TIER_RANK[presented] < TIER_RANK[min]) {
        await audit(
          c,
          opts,
          min,
          "deny",
          presented,
          keyId(token),
          "insufficient_tier",
        );
        return c.json(
          {
            error: `Insufficient privilege. Required: ${min}.`,
            code: "AUTH_TIER_INSUFFICIENT",
          },
          403,
        );
      }

      // Godlike additionally enforces IP allowlist when configured.
      if (presented === "godlike") {
        const allowlist = process.env.GODLIKE_IP_ALLOWLIST;
        if (allowlist && allowlist.trim()) {
          const ip = clientIp(c);
          if (!ipAllowed(ip, allowlist)) {
            await audit(
              c,
              opts,
              min,
              "deny",
              presented,
              keyId(token),
              "ip_not_allowlisted",
            );
            return c.json(
              {
                error: "IP not allowlisted for godlike tier.",
                code: "AUTH_IP_DENIED",
              },
              403,
            );
          }
        }
      }

      c.set("authTier", presented);

      // Audit allow only for elevated tiers; tenant is too noisy and routes
      // already audit their own mutations.
      if (min !== "tenant") {
        await audit(c, opts, min, "allow", presented, keyId(token));
      }

      await next();
    };
}

/**
 * Startup validator — call from `main()` when NODE_ENV is "production".
 *
 * Throws if the tenant tier has no key configured. Emits a warning if the
 * godlike tier is enabled without an IP allowlist.
 */
export function validateAuthConfig(): void {
  if (!tenantKey()) {
    throw new Error(
      "[SGRS][auth] Neither TENANT_API_KEY nor legacy API_KEY is set. " +
        "Tenant tier requires a Bearer secret in production.",
    );
  }
  if (process.env.GODLIKE_API_KEY && !process.env.GODLIKE_IP_ALLOWLIST) {
    console.warn(
      "[SGRS][auth] WARNING: GODLIKE_API_KEY is set but GODLIKE_IP_ALLOWLIST is empty. " +
        "Godlike tier will accept requests from any IP — strongly discouraged.",
    );
  }
}

/** Snapshot of which tiers are currently configured (for /api/health and logs). */
export function authTierStatus() {
  return {
    tenant: tenantKey() != null,
    admin: adminKey() != null,
    godlike: godlikeKey() != null,
    godlike_ip_restricted: Boolean(
      process.env.GODLIKE_IP_ALLOWLIST && process.env.GODLIKE_IP_ALLOWLIST.trim(),
    ),
  } as const;
}
