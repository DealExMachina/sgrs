/**
 * Deal Ex Machina demo seed — M&A due-diligence scenario scopes.
 *
 * Populates scopes, model handles, agents, and finality status for the
 * default `deal-ex-machina` tenant (Deal Ex Machina demo). Mirrors mock-data in apps/studio/lib/mock-data.ts
 * so the live API renders the same scenario as the static prototype.
 *
 * Usage:
 *   pnpm --filter @sgrs/db db:seed
 *   DATABASE_URL=postgresql://… pnpm --filter @sgrs/db db:seed
 *
 * Idempotent — upserts on primary keys so reruns fix migrated tenant IDs
 * (`horizon`, `DEAL_EX_MACHINA`, etc.) and refresh demo metric fields.
 */

import { fileURLToPath } from "node:url";
import type { Db } from "./client.js";
import * as schema from "./schema.js";
import {
  agents,
  finalityStatus,
  modelHandles,
  organizations,
  projects,
  scopes,
} from "./schema.js";

const ORG = "deal-ex-machina";
const DEFAULT_PROJECT_ID = `${ORG}-default`;

// ─── Organization + default project ───────────────────────────────────────────

async function seedOrgAndProject(db: Db) {
  await db
    .insert(organizations)
    .values({ id: ORG, name: "Deal Ex Machina" })
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: DEFAULT_PROJECT_ID,
      org_id: ORG,
      name: "Default project",
      slug: "default",
    })
    .onConflictDoNothing();
}

// ─── Scopes ───────────────────────────────────────────────────────────────────

const SEED_SCOPES = [
  {
    id: "deal-horizon",
    tenant_id: ORG,
    project_id: DEFAULT_PROJECT_ID,
    name: "Horizon",
    tag: "M&A",
    state: "near-final" as const,
    score: 0.78,
    cycles: 14,
  },
  {
    id: "green-bond-2026",
    tenant_id: ORG,
    project_id: DEFAULT_PROJECT_ID,
    name: "Green Bond 2026",
    tag: "EUGBS",
    state: "active" as const,
    score: 0.64,
    cycles: 23,
  },
  {
    id: "solvency-ii-q1",
    tenant_id: ORG,
    project_id: DEFAULT_PROJECT_ID,
    name: "Solvency II Q1",
    tag: "Insurance",
    state: "resolved" as const,
    score: 0.94,
    cycles: 8,
  },
  {
    id: "kyc-2025-h2",
    tenant_id: ORG,
    project_id: DEFAULT_PROJECT_ID,
    name: "KYC-2025-H2",
    tag: "AML",
    state: "archived" as const,
    score: 0.91,
    cycles: 41,
  },
];

// ─── Agents ───────────────────────────────────────────────────────────────────

const SEED_AGENTS = [
  {
    id: "int-extractor-01",
    tenant_id: ORG,
    name: "Extractor",
    role: "extractor" as const,
    kind: "internal" as const,
    scopes: ["deal-horizon", "green-bond-2026"],
  },
  {
    id: "int-comparator-01",
    tenant_id: ORG,
    name: "Comparator",
    role: "comparator" as const,
    kind: "internal" as const,
    scopes: ["deal-horizon"],
  },
  {
    id: "int-arbiter-01",
    tenant_id: ORG,
    name: "Arbiter",
    role: "arbiter" as const,
    kind: "internal" as const,
    scopes: ["deal-horizon", "solvency-ii-q1"],
  },
  {
    id: "int-proposer-01",
    tenant_id: ORG,
    name: "Proposer",
    role: "proposer" as const,
    kind: "internal" as const,
    scopes: ["deal-horizon"],
  },
  {
    id: "int-reviewer-01",
    tenant_id: ORG,
    name: "Reviewer",
    role: "reviewer" as const,
    kind: "internal" as const,
    scopes: ["deal-horizon", "kyc-2025-h2"],
  },
  {
    id: "int-status-01",
    tenant_id: ORG,
    name: "Status Monitor",
    role: "status" as const,
    kind: "internal" as const,
    scopes: SEED_SCOPES.map((s) => s.id),
  },
];

// ─── Finality status ──────────────────────────────────────────────────────────

const SEED_FINALITY = [
  {
    scope_id: "deal-horizon",
    tenant_id: ORG,
    score: 0.78,
    per_dimension: {
      claim_confidence: 0.82,
      contradiction_resolution: 0.61,
      goal_completion: 0.79,
      risk_score_inverse: 0.88,
    },
    monotonicity_rounds: 14,
    plateau_ema: 0.031,
    convergence_rate: 0.042,
    state: "near-final" as const,
    veto_active: true, // x-arr contradiction unresolved
  },
  {
    scope_id: "green-bond-2026",
    tenant_id: ORG,
    score: 0.64,
    per_dimension: {
      claim_confidence: 0.71,
      contradiction_resolution: 0.55,
      goal_completion: 0.68,
      risk_score_inverse: 0.63,
    },
    monotonicity_rounds: 23,
    plateau_ema: 0.018,
    convergence_rate: 0.021,
    state: "active" as const,
    veto_active: false,
  },
  {
    scope_id: "solvency-ii-q1",
    tenant_id: ORG,
    score: 0.94,
    per_dimension: {
      claim_confidence: 0.96,
      contradiction_resolution: 0.93,
      goal_completion: 0.95,
      risk_score_inverse: 0.91,
    },
    monotonicity_rounds: 8,
    plateau_ema: 0.004,
    convergence_rate: 0.008,
    state: "resolved" as const,
    veto_active: false,
  },
  {
    scope_id: "kyc-2025-h2",
    tenant_id: ORG,
    score: 0.91,
    per_dimension: {
      claim_confidence: 0.93,
      contradiction_resolution: 0.9,
      goal_completion: 0.92,
      risk_score_inverse: 0.89,
    },
    monotonicity_rounds: 41,
    plateau_ema: 0.002,
    convergence_rate: 0.003,
    state: "archived" as const,
    veto_active: false,
  },
];

// ─── Seed runner ──────────────────────────────────────────────────────────────

async function runSeedBody(db: Db): Promise<void> {
  console.log("[sgrs][seed] Upserting deal-ex-machina demo scenario…");

  await seedOrgAndProject(db);

  for (const row of SEED_SCOPES) {
    await db
      .insert(scopes)
      .values(row)
      .onConflictDoUpdate({
        target: scopes.id,
        set: {
          tenant_id: row.tenant_id,
          project_id: row.project_id,
          name: row.name,
          tag: row.tag,
          state: row.state,
          score: row.score,
          cycles: row.cycles,
          updated_at: new Date(),
        },
      });
    console.log(`  [scope] upserted ${row.id}`);
  }

  for (const row of SEED_AGENTS) {
    await db
      .insert(agents)
      .values(row)
      .onConflictDoUpdate({
        target: agents.id,
        set: {
          tenant_id: row.tenant_id,
          name: row.name,
          role: row.role,
          kind: row.kind,
          scopes: row.scopes,
        },
      });
    console.log(`  [agent] upserted ${row.id}`);
  }

  for (const row of SEED_FINALITY) {
    await db
      .insert(finalityStatus)
      .values(row)
      .onConflictDoUpdate({
        target: [finalityStatus.scope_id],
        set: {
          tenant_id: row.tenant_id,
          score: row.score,
          per_dimension: row.per_dimension,
          monotonicity_rounds: row.monotonicity_rounds,
          plateau_ema: row.plateau_ema,
          convergence_rate: row.convergence_rate,
          state: row.state,
          veto_active: row.veto_active,
          updated_at: new Date(),
        },
      });
    console.log(`  [finality] upserted ${row.scope_id}`);
  }

  console.log("[sgrs][seed] Done. (No model handles seeded — connect via API.)");

  void modelHandles;
}

/**
 * Applies demo seed data using a short-lived DB connection (closes PGlite /
 * postgres-js so `pnpm db:seed` always exits cleanly).
 */
export async function seed(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? ":memory:";
  const isPg =
    url.startsWith("postgresql://") || url.startsWith("postgres://");

  if (isPg) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
    });
    const db = drizzle(client, { schema }) as unknown as Db;
    try {
      await runSeedBody(db);
    } finally {
      await client.end();
    }
    return;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(url);
  try {
    const db = drizzle(client, { schema }) as unknown as Db;
    await runSeedBody(db);
  } finally {
    await client.close();
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed().catch((err) => {
    console.error("[sgrs][seed] Seed failed:", err);
    process.exit(1);
  });
}
