/**
 * Bearer-token authentication middleware.
 *
 * Reads the expected key from API_KEY environment variable.
 * If API_KEY is not set, the middleware is a no-op (useful for local dev
 * without needing a token). In production, `validateApiKeyConfig()` should
 * be called at server startup to fail fast if API_KEY is absent.
 *
 * Expects:  Authorization: Bearer <api-key>
 *
 * On failure: 401 Unauthorized.
 *
 * Security: uses Node.js `timingSafeEqual` on HMAC-SHA256 digests to prevent
 * both timing attacks and length-oracle attacks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";

/** HMAC key — fixed per process to prevent cross-invocation oracle attacks. */
const HMAC_KEY = Buffer.from("sgrs-auth-hmac-key-v1");

/** Derive a 32-byte HMAC-SHA256 digest for constant-time comparison. */
function digest(value: string): Buffer {
  return createHmac("sha256", HMAC_KEY).update(value).digest();
}

/**
 * Startup validator — call once in `main()` when NODE_ENV is production.
 * Throws if API_KEY is absent, ensuring the server never starts unauthenticated.
 */
export function validateApiKeyConfig(): void {
  if (!process.env.API_KEY) {
    throw new Error(
      "[SGRS][auth] API_KEY environment variable is not set. " +
        "The API server requires a Bearer token in production. " +
        "Set API_KEY=<random-secret> or disable this check for local dev."
    );
  }
}

export const authMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    // API_KEY not configured — pass through (dev mode)
    await next();
    return;
  }

  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "Authorization header missing or malformed.", code: "AUTH_MISSING" },
      401
    );
  }

  const token = authHeader.slice(7).trim();

  // Constant-time comparison via HMAC-SHA256 digests.
  // Hashing to equal-length buffers eliminates length-oracle leakage.
  if (!timingSafeEqual(digest(token), digest(expectedKey))) {
    return c.json(
      { error: "Invalid API key.", code: "AUTH_INVALID" },
      401
    );
  }

  await next();
};
