/**
 * SGRS end-to-end scenario — an example app that uses the product API to:
 *
 *   1. Create governance scopes            (SDK: client.scopes.create)
 *   2. Put source documents into a scope    (REST: POST /api/documents)
 *   3. Record the governance outcome         (REST: POST /api/claims, /api/risks;
 *                                             SDK: client.finality.upsert)
 *   4. Report the outcome                    (SDK + REST reads)
 *
 * The real governance kernel (the external swarm in
 * open-governed-swarm-of-agents) is what normally extracts claims, flags
 * risks and computes finality V(t). It is not part of this repo, so this
 * example plays that role locally to produce a self-contained, deterministic
 * demonstration of the product surface. The sections that stand in for the
 * kernel are clearly marked "[kernel-sim]".
 *
 * Run against a live API server:
 *   SGRS_API_URL=http://localhost:3003 pnpm --filter @sgrs/example-scenario start
 */

import { createHash } from "node:crypto";
import { createClient, type ApiResponse } from "@sgrs/client-ts";
import type {
  Scope,
  FinalityStatus,
  RiskLevel,
  FinalityDimension,
} from "@sgrs/api-schema";

// ─── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.SGRS_API_URL ?? "http://localhost:3003";
const TENANT_ID = process.env.SGRS_TENANT_ID ?? "acme";
const API_KEY = process.env.SGRS_API_KEY; // optional (auth disabled in dev)

const client = createClient({
  baseUrl: BASE_URL,
  tenantId: TENANT_ID,
  ...(API_KEY ? { apiKey: API_KEY } : {}),
});

// ─── Small REST helper for routes not yet on the SDK ──────────────────────────

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Tenant-ID": TENANT_ID,
  };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const res = await fetch(new URL(path, BASE_URL), {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as T;
}

/** Unwrap an SDK ApiResponse, throwing a readable error on failure. */
function unwrap<T>(r: ApiResponse<T>, what: string): T {
  if (!r.ok || r.data === undefined) {
    throw new Error(`${what} failed → ${r.status}: ${JSON.stringify(r.error)}`);
  }
  return r.data;
}

// ─── Output helpers ───────────────────────────────────────────────────────────

const line = (n = 78) => "─".repeat(n);
function heading(title: string): void {
  console.log(`\n${line()}\n  ${title}\n${line()}`);
}
function bar(score: number, width = 24): string {
  const filled = Math.round(score * width);
  return `[${"█".repeat(filled)}${"·".repeat(width - filled)}] ${(score * 100).toFixed(1)}%`;
}

// ─── Domain types (for the routes not on the SDK) ─────────────────────────────

interface SgrsDoc {
  id: string;
  scope_id: string;
  name: string;
  type: string;
  status: string;
  claim_count: number;
  provenance?: string;
  ingested_at: string;
}
interface Claim {
  id: string;
  scope_id: string;
  text: string;
  source: string;
  document_id?: string;
  dimension?: FinalityDimension;
  confidence: number;
  round: number;
}
interface Risk {
  id: string;
  scope_id: string;
  description: string;
  level: RiskLevel;
  category?: string;
  source: string;
  document_id?: string;
}

/** Deterministic content-hash provenance for a document (simulates ingest). */
function provenanceFor(scopeId: string, name: string): string {
  const hash = createHash("sha256").update(`${scopeId}/${name}`).digest("hex");
  return `sha256:${hash}`;
}

// ─── Scenario data ────────────────────────────────────────────────────────────

interface DocSeed {
  name: string;
  type: string;
  claims: Array<{ text: string; dimension: FinalityDimension; confidence: number }>;
}

interface ScopeSeed {
  id: string;
  name: string;
  tag: string;
  docs: DocSeed[];
  risks: Array<{ description: string; level: RiskLevel; category: string; source: string }>;
  /** Finality score per convergence round (drives V(t) trend + terminal state). */
  finalityRounds: number[];
  terminalState: Scope["state"];
  vetoActive: boolean;
}

const SCENARIO: ScopeSeed[] = [
  {
    id: "acme-vendor-acquisition",
    name: "ACME — Vendor Acquisition Due Diligence",
    tag: "M&A",
    docs: [
      {
        name: "Term Sheet.pdf",
        type: "pdf",
        claims: [
          { text: "Purchase price is $42M, all-cash.", dimension: "goal_completion", confidence: 0.92 },
          { text: "Exclusivity period runs 60 days from signing.", dimension: "claim_confidence", confidence: 0.88 },
        ],
      },
      {
        name: "Financials FY24.xlsx",
        type: "xlsx",
        claims: [
          { text: "FY24 ARR is $11.3M, up 34% YoY.", dimension: "claim_confidence", confidence: 0.9 },
          { text: "Gross margin held at 78% across four quarters.", dimension: "claim_confidence", confidence: 0.85 },
        ],
      },
      {
        name: "Data Processing Agreement.pdf",
        type: "pdf",
        claims: [
          { text: "Sub-processors are limited to EU/EEA regions.", dimension: "risk_score_inverse", confidence: 0.81 },
        ],
      },
    ],
    risks: [
      { description: "Customer concentration: top account is 22% of ARR.", level: "high", category: "financial", source: "Financials FY24.xlsx" },
      { description: "DPA lacks an explicit breach-notification SLA.", level: "medium", category: "legal", source: "Data Processing Agreement.pdf" },
    ],
    finalityRounds: [0.41, 0.63, 0.82, 0.93],
    terminalState: "near-final",
    vetoActive: false,
  },
  {
    id: "solvency-ii-review",
    name: "Solvency II — Capital Adequacy Review",
    tag: "REG",
    docs: [
      {
        name: "SCR Report.pdf",
        type: "pdf",
        claims: [
          { text: "Reported SCR ratio is 148%.", dimension: "claim_confidence", confidence: 0.87 },
          { text: "Market risk is the largest SCR module at 61%.", dimension: "claim_confidence", confidence: 0.83 },
        ],
      },
      {
        name: "ORSA.docx",
        type: "docx",
        claims: [
          { text: "ORSA projects SCR ratio falling to 121% under stress.", dimension: "risk_score_inverse", confidence: 0.72 },
        ],
      },
    ],
    risks: [
      { description: "Stressed SCR ratio (121%) breaches the 130% internal risk appetite.", level: "critical", category: "regulatory", source: "ORSA.docx" },
    ],
    finalityRounds: [0.38, 0.55, 0.6, 0.58],
    terminalState: "escalated",
    vetoActive: true,
  },
];

// ─── Steps ────────────────────────────────────────────────────────────────────

async function ensureHealthy(): Promise<void> {
  heading("1 · Health check");
  const health = unwrap(await client.health.check(), "health.check");
  console.log(`  API status: ${health.status}   db: ${health.db}`);
}

async function createScope(seed: ScopeSeed): Promise<Scope> {
  const scope = unwrap(
    await client.scopes.create({
      id: seed.id,
      name: seed.name,
      tag: seed.tag,
      state: "active",
      score: 0,
      cycles: 0,
    }),
    `scopes.create(${seed.id})`,
  );
  console.log(`  + scope "${scope.id}"  (${scope.name})  [${scope.tag}]  state=${scope.state}`);
  return scope;
}

/** Put documents into a scope; returns a name → document-id map for provenance. */
async function putDocuments(seed: ScopeSeed): Promise<Map<string, string>> {
  const docIdByName = new Map<string, string>();
  for (const doc of seed.docs) {
    const provenance = provenanceFor(seed.id, doc.name);
    const created = await rest<SgrsDoc>("POST", "/api/documents", {
      scope_id: seed.id,
      name: doc.name,
      type: doc.type,
      status: "processing",
      provenance,
    });
    docIdByName.set(doc.name, created.id);
    console.log(`    · put doc "${doc.name}" (${doc.type}) → status=${created.status}`);
    console.log(`        provenance: ${provenance.slice(0, 23)}…  doc_id=${created.id}`);

    // [kernel-sim] The swarm extracts claims from the document, then marks it indexed.
    // Each claim carries document_id so it is traceable back to its source.
    for (const claim of doc.claims) {
      await rest<Claim>("POST", "/api/claims", {
        scope_id: seed.id,
        text: claim.text,
        source: doc.name,
        document_id: created.id,
        dimension: claim.dimension,
        confidence: claim.confidence,
        round: 1,
      });
    }
    await rest<SgrsDoc>("PATCH", `/api/documents/${created.id}`, {
      status: "indexed",
      claim_count: doc.claims.length,
    });
    console.log(`      [kernel-sim] extracted ${doc.claims.length} claim(s) → status=indexed`);
  }
  return docIdByName;
}

async function recordRisks(seed: ScopeSeed, docIdByName: Map<string, string>): Promise<void> {
  for (const risk of seed.risks) {
    const documentId = docIdByName.get(risk.source);
    await rest<Risk>("POST", "/api/risks", {
      scope_id: seed.id,
      description: risk.description,
      level: risk.level,
      category: risk.category,
      source: risk.source,
      ...(documentId ? { document_id: documentId } : {}),
      round: 1,
    });
    console.log(`      [kernel-sim] risk flagged (${risk.level}): ${risk.description}`);
  }
}

async function runFinality(seed: ScopeSeed): Promise<void> {
  const rounds = seed.finalityRounds;
  for (let i = 0; i < rounds.length; i++) {
    const score = rounds[i]!;
    const prev = i > 0 ? rounds[i - 1]! : 0;
    const isLast = i === rounds.length - 1;
    const perDimension: Record<string, number> = {
      claim_confidence: Math.min(1, score + 0.03),
      contradiction_resolution: Math.max(0, score - 0.05),
      goal_completion: score,
      risk_score_inverse: Math.max(0, score - 0.08),
    };
    unwrap(
      await client.finality.upsert(seed.id, {
        score,
        per_dimension: perDimension,
        monotonicity_rounds: i,
        plateau_ema: Math.abs(score - prev),
        convergence_rate: score - prev,
        state: isLast ? seed.terminalState : "active",
        veto_active: isLast ? seed.vetoActive : false,
      } satisfies Omit<FinalityStatus, "scope_id">),
      `finality.upsert(${seed.id}, round ${i})`,
    );
    console.log(`      [kernel-sim] round ${i}: V(t)=${score.toFixed(2)}  Δ=${(score - prev >= 0 ? "+" : "")}${(score - prev).toFixed(2)}`);
  }
  // Reflect converged score onto the scope record.
  const finalScore = rounds[rounds.length - 1]!;
  unwrap(
    await client.scopes.patch(seed.id, {
      score: finalScore,
      cycles: rounds.length,
      state: seed.terminalState,
    }),
    `scopes.patch(${seed.id})`,
  );
}

async function reportScope(seed: ScopeSeed): Promise<void> {
  const scope = unwrap(await client.scopes.get(seed.id), `scopes.get(${seed.id})`);
  const docs = await rest<SgrsDoc[]>("GET", `/api/documents/${seed.id}`);
  const claimsByDoc = await rest<Record<string, Claim[]>>("GET", `/api/claims/${seed.id}/by-doc`);
  const risks = await rest<Risk[]>("GET", `/api/risks/${seed.id}`);
  const finality = unwrap(await client.finality.status(seed.id), `finality.status(${seed.id})`);
  const history = unwrap(await client.finality.history(seed.id), `finality.history(${seed.id})`);

  console.log(`\n  ▸ ${scope.name}   [${scope.tag}]`);
  console.log(`    scope id      : ${scope.id}`);
  console.log(`    state         : ${scope.state}${finality.veto_active ? "  (VETO ACTIVE)" : ""}`);
  console.log(`    finality V(t) : ${bar(finality.score)}`);
  console.log(`    cycles        : ${scope.cycles}`);

  const totalClaims = Object.values(claimsByDoc).reduce((n, arr) => n + arr.length, 0);
  console.log(`    documents     : ${docs.length}   claims: ${totalClaims}   risks: ${risks.length}`);

  const docById = new Map(docs.map((d) => [d.id, d]));
  const allClaims = Object.values(claimsByDoc).flat();

  console.log(`    ── source documents (with provenance) ──`);
  for (const d of docs) {
    console.log(`      · ${d.name}  (${d.type}, ${d.status}, ${d.claim_count} claims)`);
    console.log(`          provenance: ${d.provenance ?? "(none)"}`);
    for (const cl of claimsByDoc[d.name] ?? []) {
      const traced = cl.document_id && docById.has(cl.document_id) ? "✓ traced" : "✗ untraced";
      console.log(`          - "${cl.text}"  (conf ${(cl.confidence * 100).toFixed(0)}%)  [${traced}]`);
    }
  }

  if (risks.length) {
    console.log(`    ── risks (severity order) ──`);
    for (const r of risks) {
      const src = r.document_id ? docById.get(r.document_id)?.name ?? r.source : r.source;
      console.log(`      · [${r.level.toUpperCase()}] ${r.description}  (${r.category ?? "n/a"})  ← ${src}`);
    }
  }

  // Traceability audit: every claim/risk must resolve to a known document row.
  const tracedClaims = allClaims.filter((c) => c.document_id && docById.has(c.document_id)).length;
  const tracedRisks = risks.filter((r) => r.document_id && docById.has(r.document_id)).length;
  console.log(`    ── traceability ──`);
  console.log(`      claims linked to a source document: ${tracedClaims}/${allClaims.length}`);
  console.log(`      risks  linked to a source document: ${tracedRisks}/${risks.length}`);

  console.log(`    ── convergence trend (V(t) history) ──`);
  const points = [...history.points].sort((a, b) => a.recorded_at - b.recorded_at);
  for (const p of points) {
    console.log(`      round ${p.monotonicity_rounds}: ${bar(p.score, 18)}  state=${p.state}`);
  }

  const verdict =
    finality.veto_active
      ? "ESCALATED — human review required (veto active)"
      : finality.score >= 0.9
        ? "NEAR-FINAL — converged, ready for sign-off"
        : "IN PROGRESS — further rounds needed";
  console.log(`    ── verdict ──`);
  console.log(`      ${verdict}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`SGRS scenario → ${BASE_URL}  (tenant: ${TENANT_ID})`);

  await ensureHealthy();

  heading("2 · Create scopes + put in documents + run governance");
  for (const seed of SCENARIO) {
    console.log(`\n  Scope: ${seed.id}`);
    await createScope(seed);
    const docIdByName = await putDocuments(seed);
    await recordRisks(seed, docIdByName);
    await runFinality(seed);
  }

  heading("3 · Outcome report");
  const allScopes = unwrap(await client.scopes.list(), "scopes.list");
  console.log(`  Tenant "${TENANT_ID}" now has ${allScopes.length} scope(s).`);
  for (const seed of SCENARIO) {
    await reportScope(seed);
  }

  heading("Done");
  console.log("  Scenario complete. All data persisted via the SGRS REST API.\n");
}

main().catch((err) => {
  console.error("\n[scenario] FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
