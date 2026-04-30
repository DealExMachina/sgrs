"use client";

import { useState } from "react";
import { cn } from "@sgrs/ui";
import type { ApiClaim, ApiSgrsDocument } from "@/lib/api-client";

// ─── Confidence display helpers ───────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 0.8)  return "text-ok";
  if (score >= 0.55) return "text-amber";
  return "text-risk";
}

function confidenceBarColor(score: number): string {
  if (score >= 0.8)  return "bg-ok";
  if (score >= 0.55) return "bg-amber";
  return "bg-risk";
}

function confidenceLabel(score: number): string {
  if (score >= 0.9)  return "Very high";
  if (score >= 0.8)  return "High";
  if (score >= 0.65) return "Moderate";
  if (score >= 0.5)  return "Low";
  return "Very low";
}

// ─── Single claim card ────────────────────────────────────────────────────────

function ClaimCard({ claim }: { claim: ApiClaim }) {
  return (
    <article className="rounded border border-graphite bg-ink-soft px-3 py-2.5">
      <p className="mb-2 text-[12.5px] leading-[1.5] text-mist">{claim.text}</p>
      <div className="flex items-center gap-3">
        {/* Confidence bar */}
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-graphite">
          <div
            className={cn("h-full transition-all duration-700", confidenceBarColor(claim.confidence))}
            style={{ width: `${claim.confidence * 100}%` }}
          />
        </div>
        <span className={cn("font-mono text-[11px]", confidenceColor(claim.confidence))}>
          {(claim.confidence * 100).toFixed(0)}%
        </span>
        <span className="text-[10.5px] text-fog">{confidenceLabel(claim.confidence)}</span>
      </div>
      {/* Meta */}
      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-fog">
        <span className="truncate">{claim.source}</span>
        <span className="ml-auto shrink-0">round {claim.round}</span>
      </div>
    </article>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type Filter = "all" | "high" | "low";

const FILTER_LABELS: Record<Filter, string> = {
  all:  "All",
  high: "High conf.",
  low:  "Low conf.",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  claims: ApiClaim[];
  documents: ApiSgrsDocument[];
}

const MOCK_CLAIMS: ApiClaim[] = [
  { id: "m1", scope_id: "demo", text: "ARR stands at €50M for FY2024 per the financial model.", source: "Financial Model.xlsx", confidence: 0.91, round: 12, created_at: new Date().toISOString() },
  { id: "m2", scope_id: "demo", text: "The term sheet references ARR of €38M as of Q3 2024.", source: "Term Sheet v3.docx", confidence: 0.44, round: 12, created_at: new Date().toISOString() },
  { id: "m3", scope_id: "demo", text: "No material litigation is pending as of the review date.", source: "Legal Review.pdf", confidence: 0.87, round: 11, created_at: new Date().toISOString() },
  { id: "m4", scope_id: "demo", text: "Churn rate is 8.3% annualised, within covenant tolerance.", source: "Financial Model.xlsx", confidence: 0.76, round: 11, created_at: new Date().toISOString() },
];

export function ClaimsPanel({ claims, documents: _docs }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const displayClaims = (claims.length > 0 ? claims : MOCK_CLAIMS).filter((c) => {
    if (filter === "high") return c.confidence >= 0.8;
    if (filter === "low")  return c.confidence < 0.6;
    return true;
  });

  const isEmpty = displayClaims.length === 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 flex gap-1 border-b border-graphite bg-ink px-3 py-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] transition-colors",
              filter === f
                ? "bg-blue/15 text-blue"
                : "text-fog hover:text-fog-2",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[10.5px] text-fog">
          {displayClaims.length} claim{displayClaims.length !== 1 ? "s" : ""}
          {claims.length === 0 && <span className="ml-1 text-fog opacity-50">(demo)</span>}
        </span>
      </div>

      {/* Claims list */}
      <div className="flex flex-col gap-2 p-3">
        {isEmpty ? (
          <p className="py-6 text-center text-[12px] text-fog">
            No claims match the current filter.
          </p>
        ) : (
          displayClaims.map((c) => <ClaimCard key={c.id} claim={c} />)
        )}
      </div>
    </div>
  );
}
