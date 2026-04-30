/**
 * Global error handler middleware for the SGRS API.
 *
 * Maps:
 *   ZodError          → 422 Unprocessable Entity (validation failure details)
 *   Error             → 500 Internal Server Error (message redacted in prod)
 *   unknown           → 500 Internal Server Error
 *
 * Never leaks stack traces or internal messages to clients.
 * Logs all 5xx errors server-side.
 */

import type { ErrorHandler } from "hono";
import { ZodError } from "zod";

export const errorHandler: ErrorHandler = (err, c) => {
  // ZodError — validation failure from @hono/zod-validator
  if (err instanceof ZodError) {
    return c.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.flatten().fieldErrors,
      },
      422
    );
  }

  // All other errors
  console.error("[sgrs][api] Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  return c.json(
    {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      ...(isDev && err instanceof Error ? { detail: err.message } : {}),
    },
    500
  );
};
