/**
 * Programmatic migration runner for SGRS.
 *
 * Applies all pending Drizzle-kit migrations from the `./drizzle` folder.
 * Supports both PGlite and postgres-js drivers, selected by DATABASE_URL.
 *
 * Usage (standalone):
 *   tsx src/migrate.ts
 *   DATABASE_URL=postgresql://… tsx src/migrate.ts
 *
 * Usage (programmatic — from apps/api startup):
 *   import { runMigrations } from '@sgrs/db';
 *   await runMigrations();
 */

import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle"
);

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? ":memory:";
  const isPg =
    url.startsWith("postgresql://") || url.startsWith("postgres://");

  if (isPg) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;

    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      console.log("[sgrs][migrate] Postgres migrations applied.");
    } finally {
      await client.end();
    }
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");

    const client = new PGlite(url);
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      console.log("[sgrs][migrate] PGlite migrations applied.");
    } finally {
      await client.close();
    }
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations().catch((err) => {
    console.error("[sgrs][migrate] Migration failed:", err);
    process.exit(1);
  });
}
