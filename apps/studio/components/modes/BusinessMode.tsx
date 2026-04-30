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

  // ── Document nodes ──────────────────────────────────────────────────────────
  domain.documents.forEach((doc) => {
    nodes.push({
      id: `doc-${doc.id}`,
      label: doc.name,
      type: "doc",
      info: {
        subtitle: `doc · ${new Date(doc.created_at).toLocaleDateString()}`,
        desc: `${domain.claims.filter(c => c.source === doc.name).length} claims`,
      },
    });
  });

  // ── Claim nodes ──────────────────────────────────────────────────────────────
  domain.claims.forEach((claim) => {
    nodes.push({
      id: `claim-${claim.id}`,
      label: claim.text.slice(0, 40) + (claim.text.length > 40 ? "…" : ""),
      type: "claim",
      conf: claim.confidence,
      stale: claim.status === "superseded",
      info: {
        subtitle: `claim · conf ${(claim.confidence * 100).toFixed(0)}%`,
        desc: claim.text,
      },
    });

    // Edge: Document → Claim
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
  domain.contradictions.forEach((contra) => {
    nodes.push({
      id: `contra-${contra.id}`,
      label: `Contradiction`,
      type: "contradiction",
      veto: contra.veto_active,
      info: {
        subtitle: contra.veto_active ? "contradiction · VETO" : "contradiction · soft",
        desc: contra.reason || "Conflicting claims detected",
      },
    });

    // Edges: Claims → Contradiction
    contra.claim_ids.forEach((claimId) => {
      edges.push({
        source: `claim-${claimId}`,
        target: `contra-${contra.id}`,
        type: "contradicts",
      });
    });
  });

  // ── Risk nodes ───────────────────────────────────────────────────────────────
  domain.risks.forEach((risk) => {
    nodes.push({
      id: `risk-${risk.id}`,
      label: risk.label,
      type: "risk",
      info: {
        subtitle: `risk · severity ${risk.severity}`,
        desc: risk.description,
      },
    });

    // Edges: Contributing claims → Risk
    risk.contributing_claim_ids.forEach((claimId) => {
      edges.push({
        source: `claim-${claimId}`,
        target: `risk-${risk.id}`,
        type: "supports",
      });
    });
  });

  // ── Drift connections ────────────────────────────────────────────────────────
  // Drifts represent detected conflicts between claims; create edges between them
  domain.drifts.forEach((drift) => {
    if (drift.claim_a_id && drift.claim_b_id) {
      edges.push({
        source: `claim-${drift.claim_a_id}`,
        target: `claim-${drift.claim_b_id}`,
        type: "contradicts",
      });
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
