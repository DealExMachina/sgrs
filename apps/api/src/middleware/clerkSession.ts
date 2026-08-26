/**
 * Clerk session verification — binds org + user for browser-authenticated routes.
 */

import { verifyToken } from "@clerk/backend";
import type { Context, MiddlewareHandler, Next } from "hono";
import {
  ensureOrgForClerkOrg,
  ensurePersonalOrg,
} from "../services/organizations.js";
import type { Db } from "@sgrs/db";

declare module "hono" {
  interface ContextVariableMap {
    clerkUserId: string;
    clerkOrgId?: string;
    clerkOrgRole?: string;
  }
}

function clerkSecret(): string | null {
  return process.env.CLERK_SECRET_KEY ?? null;
}

function displayName(payload: Record<string, unknown>): string {
  const first = typeof payload.first_name === "string" ? payload.first_name : "";
  const last = typeof payload.last_name === "string" ? payload.last_name : "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (typeof payload.email === "string" && payload.email) return payload.email;
  if (typeof payload.sub === "string") return payload.sub;
  return "SGRS user";
}

export async function verifyClerkBearer(token: string): Promise<{
  sub: string;
  orgId: string | null;
  orgRole: string | null;
  payload: Record<string, unknown>;
} | null> {
  const secret = clerkSecret();
  if (!secret) return null;

  try {
    const payload = (await verifyToken(token, {
      secretKey: secret,
    })) as Record<string, unknown>;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    const orgId = typeof payload.org_id === "string" ? payload.org_id : null;
    const orgRole =
      typeof payload.org_role === "string" ? payload.org_role : null;
    return { sub, orgId, orgRole, payload };
  } catch {
    return null;
  }
}

export function makeRequireClerkSession(db: Db): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!clerkSecret()) {
      return c.json(
        { error: "Clerk auth is not configured.", code: "CLERK_DISABLED" },
        503,
      );
    }

    const authHeader = c.req.header("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return c.json(
        { error: "Authorization header missing or malformed.", code: "AUTH_MISSING" },
        401,
      );
    }

    const token = authHeader.slice(7).trim();
    if (token.startsWith("sk_")) {
      return c.json(
        {
          error: "Clerk session required for this route.",
          code: "CLERK_SESSION_REQUIRED",
        },
        403,
      );
    }

    const session = await verifyClerkBearer(token);
    if (!session) {
      return c.json({ error: "Invalid Clerk session.", code: "AUTH_INVALID" }, 401);
    }

    const name = displayName(session.payload);
    const org = session.orgId
      ? await ensureOrgForClerkOrg(
          db,
          session.orgId,
          name,
          session.sub,
        )
      : await ensurePersonalOrg(db, session.sub, name);

    c.set("clerkUserId", session.sub);
    if (session.orgId) c.set("clerkOrgId", session.orgId);
    if (session.orgRole) c.set("clerkOrgRole", session.orgRole);
    c.set("tenantId", org.id);
    await next();
  };
}
