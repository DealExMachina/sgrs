"use client";

import { useState, useCallback } from "react";
import { cn } from "@sgrs/ui";
import { createClient } from "@/lib/api-client";
import { DEFAULT_TENANT_ID } from "@/lib/types";
import type { ApiContradiction, ApiDrift } from "@/lib/api-client";

// ─── Contradiction card with HITL resolve ─────────────────────────────────────

const SEV_COLORS = {
  critical: "border-risk/35 bg-risk/[0.04]",
  medium:   "border-amber/35 bg-amber/[0.04]",
  low:      "border-graphite bg-transparent",
};

const SEV_BADGE = {
  critical: "bg-risk/15 text-risk",
  medium:   "bg-amber/15 text-amber",
  low:      "bg-fog/10 text-fog",
};

interface ContradictionCardProps {
  contradiction: ApiContradiction;
  onResolved: (updated: ApiContradiction) => void;
}

function ContradictionCard({ contradiction: c, onResolved }: ContradictionCardProps) {
  const [mode, setMode] = useState<"idle" | "resolving" | "deferring">("idle");
  const [resolutionText, setResolutionText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = c.status === "open";

  const handleSubmit = useCallback(async (status: "resolved" | "deferred") => {
    if (status === "resolved" && !resolutionText.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const api = createClient({ tenantId: DEFAULT_TENANT_ID });
      const updated = await api.contradictions.resolve(c.id, {
        status,
        resolution: status === "resolved" ? resolutionText.trim() : undefined,
        resolved_by: "studio-user", // TODO: real user identity
      });
      onResolved(updated);
    } catch {
      setError("Failed to update — please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }, [c.id, resolutionText, onResolved]);

  type Sev = keyof typeof SEV_COLORS;

  return (
    <article className={cn("rounded border px-3.5 py-3", SEV_COLORS[c.severity as Sev])}>
      {/* Header */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.8px]",
          SEV_BADGE[c.severity as Sev],
        )}>
          {c.severity}
        </span>
        {!isOpen && (
          <span className={cn(
            "ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.6px]",
            c.status === "resolved" ? "bg-ok/10 text-ok" : "bg-fog/10 text-fog",
          )}>
            {c.status}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-fog">round {c.round}</span>
      </div>

      {/* Two conflicting claims */}
      <div className="mb-2.5 flex flex-col gap-1.5">
        <ClaimBubble text={c.claim_a} source={c.source_a} side="a" />
        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.8px] text-risk">
          ↕ conflicts with
        </div>
        <ClaimBubble text={c.claim_b} source={c.source_b} side="b" />
      </div>

      {/* Resolution text (if already resolved) */}
      {c.resolution && (
        <div className="mb-2 rounded bg-ok/[0.06] px-3 py-2 text-[11.5px] text-mist">
          <span className="font-medium text-ok">Resolution: </span>{c.resolution}
        </div>
      )}

      {/* HITL action area — only for open contradictions */}
      {isOpen && (
        <>
          {mode === "idle" && (
            <div className="flex gap-1.5 pt-0.5">
              <button
                onClick={() => setMode("resolving")}
                className="rounded-[6px] border border-orange bg-orange px-3 py-1.5 text-[12px] font-medium text-[#1a0d00] hover:bg-orange-soft transition-colors duration-smooth"
              >
                Resolve
              </button>
              <button
                onClick={() => void handleSubmit("deferred")}
                disabled={isSubmitting}
                className="rounded-[6px] border border-transparent px-3 py-1.5 text-[12px] text-fog-2 hover:border-graphite-2 transition-colors duration-smooth disabled:opacity-40"
              >
                Defer
              </button>
            </div>
          )}

          {mode === "resolving" && (
            <div className="pt-1">
              <textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="Describe how this contradiction is resolved…"
                rows={2}
                className="mb-2 w-full resize-none rounded border border-graphite bg-ink px-3 py-2 text-[12px] text-mist placeholder:text-fog focus:border-blue focus:outline-none"
              />
              {error && <p className="mb-1.5 text-[11px] text-risk">{error}</p>}
              <div className="flex gap-1.5">
                <button
                  onClick={() => void handleSubmit("resolved")}
                  disabled={isSubmitting || !resolutionText.trim()}
                  className="rounded-[6px] bg-ok px-3 py-1.5 text-[12px] font-medium text-[#0d1a0d] disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {isSubmitting ? "Saving…" : "Confirm"}
                </button>
                <button
                  onClick={() => { setMode("idle"); setResolutionText(""); setError(null); }}
                  className="rounded-[6px] border border-transparent px-3 py-1.5 text-[12px] text-fog-2 hover:border-graphite-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ClaimBubble({ text, source, side }: { text: string; source: string; side: "a" | "b" }) {
  return (
    <div className={cn(
      "rounded px-2.5 py-1.5",
      side === "a" ? "bg-blue/[0.07]" : "bg-graphite/50",
    )}>
      <p className="text-[12px] leading-[1.45] text-mist">{text}</p>
      <span className="mt-0.5 block text-[10.5px] text-fog">{source}</span>
    </div>
  );
}

// ─── Drift section ────────────────────────────────────────────────────────────

function DriftItem({ drift: d }: { drift: ApiDrift }) {
  const isNeg = d.delta < 0;
  return (
    <div className="flex items-start gap-2.5 rounded border border-graphite px-3 py-2">
      <div className={cn(
        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.6px]",
        d.severity === "high"   ? "bg-risk/15 text-risk"  :
        d.severity === "medium" ? "bg-amber/15 text-amber" :
                                  "bg-fog/10 text-fog",
      )}>
        {d.severity}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-mist">{d.subject}</div>
        <div className="text-[11px] text-fog">
          {(d.previous_confidence * 100).toFixed(0)}%
          <span className="mx-1">→</span>
          <span className={isNeg ? "text-risk" : "text-ok"}>
            {(d.current_confidence * 100).toFixed(0)}%
          </span>
          <span className={cn("ml-1 font-mono", isNeg ? "text-risk" : "text-ok")}>
            ({isNeg ? "" : "+"}{d.delta.toFixed(3)})
          </span>
        </div>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-fog">r{d.round}</span>
    </div>
  );
}

// ─── Mock data for demo ───────────────────────────────────────────────────────

const MOCK_CONTRADICTIONS: ApiContradiction[] = [
  {
    id: "mc1", scope_id: "demo",
    claim_a: "ARR stands at €50M for FY2024 per the financial model.",
    claim_b: "The term sheet references ARR of €38M as of Q3 2024.",
    source_a: "Financial Model.xlsx", source_b: "Term Sheet v3.docx",
    severity: "critical", status: "open", round: 12,
    created_at: new Date().toISOString(),
  },
];

const MOCK_DRIFTS: ApiDrift[] = [
  {
    id: "md1", scope_id: "demo", subject: "claim.ARR",
    previous_confidence: 0.82, current_confidence: 0.44, delta: -0.38,
    severity: "high", round: 12, created_at: new Date().toISOString(),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  contradictions: ApiContradiction[];
  drifts: ApiDrift[];
  scopeId: string;
  onContradictionResolved: (updated: ApiContradiction) => void;
}

export function IssuesPanel({ contradictions, drifts, scopeId: _scopeId, onContradictionResolved }: Props) {
  const displayContradictions = contradictions.length > 0 ? contradictions : MOCK_CONTRADICTIONS;
  const displayDrifts = drifts.length > 0 ? drifts : MOCK_DRIFTS;
  const isDemo = contradictions.length === 0;

  const open = displayContradictions.filter((c) => c.status === "open");
  const closed = displayContradictions.filter((c) => c.status !== "open");

  return (
    <div className="flex flex-col gap-0 p-3">
      {isDemo && (
        <p className="mb-2 rounded border border-graphite bg-graphite/30 px-3 py-1.5 text-[11px] text-fog">
          Demo data — live contradictions will appear here as the swarm runs.
        </p>
      )}

      {/* Open contradictions */}
      {open.length > 0 && (
        <section className="mb-3">
          <SectionHeading label="Open contradictions" count={open.length} accent="risk" />
          <div className="flex flex-col gap-2 pt-2">
            {open.map((c) => (
              <ContradictionCard
                key={c.id}
                contradiction={c}
                onResolved={onContradictionResolved}
              />
            ))}
          </div>
        </section>
      )}

      {/* Drifts */}
      {displayDrifts.length > 0 && (
        <section className="mb-3">
          <SectionHeading label="Confidence drifts" count={displayDrifts.length} accent="amber" />
          <div className="flex flex-col gap-1.5 pt-2">
            {displayDrifts.map((d) => <DriftItem key={d.id} drift={d} />)}
          </div>
        </section>
      )}

      {/* Resolved / deferred contradictions */}
      {closed.length > 0 && (
        <section>
          <SectionHeading label="Resolved / deferred" count={closed.length} />
          <div className="flex flex-col gap-2 pt-2">
            {closed.map((c) => (
              <ContradictionCard
                key={c.id}
                contradiction={c}
                onResolved={onContradictionResolved}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent?: "risk" | "amber";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "text-[10.5px] font-medium uppercase tracking-[0.9px]",
        accent === "risk" ? "text-risk" : accent === "amber" ? "text-amber" : "text-fog",
      )}>
        {label}
      </span>
      <span className="font-mono text-[10px] text-fog">{count}</span>
    </div>
  );
}
