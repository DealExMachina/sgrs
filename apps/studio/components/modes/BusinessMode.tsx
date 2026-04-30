"use client";

import { useState } from "react";
import { cn } from "@sgrs/ui";
import { Graph } from "../Graph";
import { ProgressCard } from "../cards/ProgressCard";
import { ClaimsPanel } from "../panels/ClaimsPanel";
import { IssuesPanel } from "../panels/IssuesPanel";
import { SummaryPanel } from "../panels/SummaryPanel";
import { OverviewPanel } from "../panels/OverviewPanel";
import { LeftDocsPanel } from "../LeftDocsPanel";
import { ScopeCounter } from "../ScopeCounter";
import { horizonScenario } from "@/lib/mock-data";
import type { ScopeItem } from "@/lib/types";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { UseDomainDataResult } from "@/lib/hooks/useDomainData";
import type { SgrsEvent } from "@sgrs/client-ts";

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
          <Graph data={horizonScenario} className="h-full" />
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
