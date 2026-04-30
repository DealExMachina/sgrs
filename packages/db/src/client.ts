/**
 * SGRS dual-driver database factory.
 *
 * Selects the correct Drizzle driver based on DATABASE_URL:
 *
 *   - `postgresql://…` or `postgres://…`  → postgres-js (production / CI)
 *   - Anything else (or absent)            → PGlite (dev / in-process / tests)
 *
 * PGlite paths:
 *   - `":memory:"`  — ephemeral in-memory (default when DATABASE_URL is unset)
 *   - `"file:./sgrs.db"` or just `"./sgrs.db"` — persisted local file
 *
 * Usage:
 * ```ts
 * import { createDb } from '@sgrs/db';
 *
 * const db = createDb();                            // PGlite :memory:
 * const db = createDb('file:./data/sgrs.db');       // PGlite file
 * const db = createDb('postgresql://…');            // postgres-js
 * ```
 */

import { PGlite } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type { PgliteDatabase } from "drizzle-orm/pglite";
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Canonical DB type used throughout the application.
 *
 * Typed as `PgliteDatabase<typeof schema>` — the default dev driver.
 * The postgres-js instance is cast to this type at construction time.
 * Both drivers expose the identical Drizzle `pg-core` query API, so the
 * cast is safe for all operations (select / insert / update / delete / execute).
 */
export type Db = PgliteDatabase<typeof schema>;

/**
 * Create a Drizzle database instance.
 *
 * @param url - Override DATABASE_URL for this connection. Defaults to
 *              `process.env.DATABASE_URL ?? ":memory:"`.
 */
export function createDb(url?: string): Db {
  const databaseUrl = url ?? process.env.DATABASE_URL ?? ":memory:";

  if (
    databaseUrl.startsWith("postgresql://") ||
    databaseUrl.startsWith("postgres://")
  ) {
    const client = postgres(databaseUrl, {
      // Keep connections small — the API server should pool via a connection
      // manager (e.g. PgBouncer) in front of this.
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
    });
    // Both PgliteDatabase and PostgresJsDatabase expose the same pg-core API.
    // The cast allows a single Db type across both drivers.
    return drizzlePg(client, { schema }) as unknown as Db;
  }

  // PGlite: path like ":memory:", "file:./sgrs.db", or a bare directory path
  const client = new PGlite(databaseUrl);
  return drizzlePglite(client, { schema });
}

