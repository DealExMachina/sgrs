"use client";

import { useState, useMemo } from "react";
import { cn } from "@sgrs/ui";
import { Graph } from "../Graph";
import { ProgressCard } from "../cards/ProgressCard";
import { ClaimsPanel } from "../panels/ClaimsPanel";
import { IssuesPanel } from "../panels/IssuesPanel";
import { SummaryPanel } from "../panels/SummaryPanel";
import { OverviewPanel } from "../panels/OverviewPanel";
import { LeftDocsPanel } from "../LeftDocsPanel";
import { ScopeCounter } from "../ScopeCounter";
import type { GraphData, GraphNode } from "@sgrs/graph";
import type { ScopeItem } from "@/lib/types";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { UseDomainDataResult } from "@/lib/hooks/useDomainData";
import type { SgrsEvent } from "@sgrs/client-ts";

// ─── Graph data builder ───────────────────────────────────────────────────────

/**
 * Build a directed graph from domain data (claims, drifts, contradictions, risks, documents).
 *
 * Nodes:
 * - Documents (type: "doc")
 * - Claims (type: "claim", may be stale)
 * - Contradictions (type: "contradiction", may be veto)
 * - Risks (type: "risk")
 *
 * Edges:
 * - Document → Claim (document source → claim)
 * - Claim → Contradiction (conflicting claims)
 * - Claim → Risk (claim contributes to risk)
 * - Drift → Claim (drift detected between claims)
 */
function buildGraphData(domain: UseDomainDataResult): GraphData {
  const nodes: GraphNode[] = [];
  const edges: Array<{ source: string; target: string; type: "refers" | "supports" | "contradicts" }> = [];

  // Build a lookup: claim text → claim id (for contradiction edge resolution)
  const claimByText = new Map<string, string>();
  domain.claims.forEach((c) => claimByText.set(c.text, c.id));

  // Build a lookup: claim id → set of contradiction ids (to mark stale)
  const claimInContradiction = new Set<string>();
  domain.contradictions.forEach((contra) => {
    const idA = claimByText.get(contra.claim_a);
    const idB = claimByText.get(contra.claim_b);
    if (idA) claimInContradiction.add(idA);
    if (idB) claimInContradiction.add(idB);
  });

  // ── Document nodes ──────────────────────────────────────────────────────────
  domain.documents.forEach((doc) => {
    const claimCount = domain.claims.filter(c => c.source === doc.name).length;
    nodes.push({
      id: `doc-${doc.id}`,
      label: doc.name,
      type: "doc",
      info: {
        subtitle: `doc · ${new Date(doc.ingested_at).toLocaleDateString()} · ${claimCount} claims`,
        desc: doc.name,
      },
    });
  });

  // ── Claim nodes ──────────────────────────────────────────────────────────────
  domain.claims.forEach((claim) => {
    // A claim is stale if it appears in a critical contradiction (superseded)
    const isStale = claimInContradiction.has(claim.id) && claim.confidence < 0.6;
    nodes.push({
      id: `claim-${claim.id}`,
      label: claim.text.slice(0, 40) + (claim.text.length > 40 ? "…" : ""),
      type: "claim",
      conf: claim.confidence,
      stale: isStale,
      info: {
        subtitle: `claim · conf ${(claim.confidence * 100).toFixed(0)}% · round ${claim.round}`,
        desc: claim.text,
      },
    });

    // Edge: Document → Claim (matched by source name)
    const docNode = domain.documents.find(d => d.name === claim.source);
    if (docNode) {
      edges.push({
        source: `doc-${docNode.id}`,
        target: `claim-${claim.id}`,
        type: "refers",
      });
    }
  });

  // ── Contradiction nodes ──────────────────────────────────────────────────────
  // API schema: { claim_a (text), claim_b (text), source_a, source_b, severity, status }
  // "veto" = critical severity that is still open
  domain.contradictions.forEach((contra) => {
    const isVeto = contra.severity === "critical" && contra.status === "open";
    const shortA = contra.claim_a.slice(0, 35) + (contra.claim_a.length > 35 ? "…" : "");
    const shortB = contra.claim_b.slice(0, 35) + (contra.claim_b.length > 35 ? "…" : "");
    nodes.push({
      id: `contra-${contra.id}`,
      label: `⚡ Contradiction`,
      type: "contradiction",
      veto: isVeto,
      info: {
        subtitle: isVeto ? `contradiction · VETO · ${contra.severity}` : `contradiction · ${contra.severity} · ${contra.status}`,
        desc: `"${shortA}" vs "${shortB}"`,
      },
    });

    // Edges: Claims → Contradiction (matched by text lookup)
    const idA = claimByText.get(contra.claim_a);
    const idB = claimByText.get(contra.claim_b);
    if (idA) {
      edges.push({ source: `claim-${idA}`, target: `contra-${contra.id}`, type: "contradicts" });
    }
    if (idB) {
      edges.push({ source: `claim-${idB}`, target: `contra-${contra.id}`, type: "contradicts" });
    }
    // If no matching claims found, link by source document instead
    if (!idA && !idB) {
      const docA = domain.documents.find(d => d.name === contra.source_a);
      const docB = domain.documents.find(d => d.name === contra.source_b);
      if (docA) edges.push({ source: `doc-${docA.id}`, target: `contra-${contra.id}`, type: "contradicts" });
      if (docB) edges.push({ source: `doc-${docB.id}`, target: `contra-${contra.id}`, type: "contradicts" });
    }
  });

  // ── Risk nodes ───────────────────────────────────────────────────────────────
  // API schema: { description, level, category, source, round }
  domain.risks.forEach((risk) => {
    const label = risk.description.slice(0, 40) + (risk.description.length > 40 ? "…" : "");
    nodes.push({
      id: `risk-${risk.id}`,
      label,
      type: "risk",
      info: {
        subtitle: `risk · ${risk.level}${risk.category ? ` · ${risk.category}` : ""}`,
        desc: risk.description,
      },
    });

    // Edges: Source document → Risk (matched by source name)
    const sourceDoc = domain.documents.find(d => d.name === risk.source);
    if (sourceDoc) {
      edges.push({ source: `doc-${sourceDoc.id}`, target: `risk-${risk.id}`, type: "supports" });
    }
    // Also connect claims from same source to risk
    domain.claims
      .filter(c => c.source === risk.source)
      .forEach(c => {
        edges.push({ source: `claim-${c.id}`, target: `risk-${risk.id}`, type: "supports" });
      });
  });

  // ── Drift connections ────────────────────────────────────────────────────────
  // API schema: { claim_id (optional), subject, delta, severity }
  // Connect the drifted claim to its drift-implicated contradiction if any
  domain.drifts.forEach((drift) => {
    if (drift.claim_id) {
      // Find a contradiction involving this claim
      const relatedContra = domain.contradictions.find(
        contra =>
          claimByText.get(contra.claim_a) === drift.claim_id ||
          claimByText.get(contra.claim_b) === drift.claim_id,
      );
      if (relatedContra) {
        edges.push({
          source: `claim-${drift.claim_id}`,
          target: `contra-${relatedContra.id}`,
          type: "contradicts",
        });
      }
    }
  });

  return { nodes, edges };
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type Tab = "overview" | "facts" | "issues" | "summary";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "facts",    label: "Facts"    },
  { id: "issues",   label: "Issues"   },
  { id: "summary",  label: "Summary"  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  scope: ScopeItem;
  finalityStatus: ApiFinalityStatus | null;
  finalityLoading: boolean;
  activityEvents: SgrsEvent[];
  domain: UseDomainDataResult;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BusinessMode({
  scope,
  finalityStatus,
  finalityLoading,
  activityEvents,
  domain,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  // ── Badge counts for tab labels ───────────────────────────────────────────
  const openContradictions = domain.contradictions.filter((c) => c.status === "open").length;
  const highDrifts         = domain.drifts.filter((d) => d.severity === "high").length;
  const issueCount         = openContradictions + highDrifts;

  // ── Derived data for docs panel ───────────────────────────────────────────
  const claimsByDoc = Object.fromEntries(
    domain.documents.map((d) => [
      d.name,
      domain.claims.filter((c) => c.source === d.name),
    ]),
  );

  // ── Build dynamic graph from domain data ──────────────────────────────────
  const graphData = useMemo(
    () => buildGraphData(domain),
    [domain.claims, domain.contradictions, domain.drifts, domain.risks, domain.documents],
  );

  return (
    // Flex row: [LeftDocsPanel] [graph + counter column] [right sidebar]
    // The LeftDocsPanel handles its own width animation; flex accommodates it.
    <div className="flex h-full overflow-hidden">

      {/* ── Left documents panel ────────────────────────────────────────── */}
      <LeftDocsPanel
        documents={domain.documents}
        claimsByDoc={claimsByDoc}
      />

      {/* ── Center: counter bar + graph ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Scope counter — live metric bar */}
        <ScopeCounter
          finalityStatus={finalityStatus}
          claims={domain.claims.length}
          openContradictions={openContradictions}
          risks={domain.risks}
          currentRound={domain.epochSummary?.round ?? null}
        />

        {/* Graph — fills remaining vertical space */}
        <div className="min-h-0 flex-1 overflow-hidden p-3 pb-0">
          <Graph data={graphData} className="h-full" />
        </div>
      </div>

      {/* ── Right sidebar ────────────────────────────────────────────────── */}
      <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-graphite">

        {/* Progress card — always pinned at top */}
        <div className="shrink-0 border-b border-graphite p-3">
          <ProgressCard
            scope={scope}
            finalityStatus={finalityStatus}
            isLoading={finalityLoading}
          />
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 border-b border-graphite">
          {TABS.map(({ id, label }) => {
            const badge =
              id === "issues" ? issueCount :
              id === "facts"  ? domain.claims.length :
              0;

            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative flex-1 py-2 text-[11.5px] font-medium transition-colors duration-smooth",
                  tab === id
                    ? "border-b-2 border-blue text-mist"
                    : "text-fog hover:text-fog-2",
                )}
              >
                {label}
                {badge > 0 && (
                  <span className={cn(
                    "ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px]",
                    id === "issues" ? "bg-risk/20 text-risk" : "bg-blue/15 text-blue",
                  )}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "overview" && (
            <OverviewPanel
              scope={scope}
              finalityStatus={finalityStatus}
              risks={domain.risks}
              drifts={domain.drifts}
              activityEvents={activityEvents}
            />
          )}
          {tab === "facts" && (
            <ClaimsPanel
              claims={domain.claims}
              documents={domain.documents}
            />
          )}
          {tab === "issues" && (
            <IssuesPanel
              contradictions={domain.contradictions}
              drifts={domain.drifts}
              scopeId={scope.id}
              onContradictionResolved={domain.resolveContradiction}
            />
          )}
          {tab === "summary" && (
            <SummaryPanel
              epochSummary={domain.epochSummary}
              scopeId={scope.id}
              onCommentAdded={domain.addEpochComment}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
