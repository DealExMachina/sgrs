"use client";

import { useState, useCallback } from "react";
import { cn } from "@sgrs/ui";
import { createClient } from "@/lib/api-client";
import { DEFAULT_TENANT_ID } from "@/lib/types";
import type { ApiEpochSummary } from "@/lib/api-client";

// ─── Mock epoch summary for demo (no live data yet) ───────────────────────────

const MOCK_SUMMARY: ApiEpochSummary = {
  id: "mock-epoch-1",
  scope_id: "deal-horizon",
  round: 13,
  summary_text:
    "Round 13 completed with convergence score 0.78. Four claims extracted across three documents. " +
    "One critical contradiction remains open between the financial model and term sheet on ARR figures. " +
    "Goal completion stands at 79%. Risk mitigation is at 71% — within acceptable range. " +
    "Escalation to T3 governance is recommended if the ARR contradiction is not resolved in the next cycle.",
  claim_count: 4,
  drift_count: 1,
  contradiction_count: 1,
  risk_count: 1,
  score: 0.78,
  state: "near-final",
  comments: [],
  created_at: new Date().toISOString(),
};

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "risk" | "amber" | "ok" | "blue";
}) {
  const color =
    accent === "risk"  ? "text-risk"  :
    accent === "amber" ? "text-amber" :
    accent === "ok"    ? "text-ok"    :
    accent === "blue"  ? "text-blue"  :
    "text-mist";

  return (
    <div className="flex flex-col items-center rounded border border-graphite px-3 py-2">
      <span className={cn("font-mono text-[18px] font-semibold leading-none", color)}>
        {value}
      </span>
      <span className="mt-1 text-[10.5px] text-fog">{label}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  epochSummary: ApiEpochSummary | null;
  scopeId: string;
  onCommentAdded: (updated: ApiEpochSummary) => void;
}

export function SummaryPanel({ epochSummary, scopeId: _scopeId, onCommentAdded }: Props) {
  const summary = epochSummary ?? MOCK_SUMMARY;
  const isDemo  = epochSummary === null;

  const [commentText, setCommentText] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Copy summary text to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary.summary_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available (non-secure context)
    }
  }, [summary.summary_text]);

  // Submit a HITL comment
  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || isDemo) return;
    setIsCommenting(true);
    try {
      const api = createClient({ tenantId: DEFAULT_TENANT_ID });
      const updated = await api.epochs.addComment(summary.id, {
        author: "studio-user", // TODO: real user identity
        text: commentText.trim(),
      });
      onCommentAdded(updated);
      setCommentText("");
    } catch {
      // Silent fail — could add error state
    } finally {
      setIsCommenting(false);
    }
  }, [commentText, summary.id, isDemo, onCommentAdded]);

  return (
    <div className="flex flex-col gap-3 p-3">
      {isDemo && (
        <p className="rounded border border-graphite bg-graphite/30 px-3 py-1.5 text-[11px] text-fog">
          Demo data — a live summary appears when the swarm completes a round.
        </p>
      )}

      {/* Round header */}
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-mist">Round {summary.round} summary</h3>
        <span className="font-mono text-[11px] text-fog">
          score {summary.score.toFixed(3)} · {summary.state}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Claims"         value={summary.claim_count}         accent="blue"  />
        <StatPill label="Drifts"         value={summary.drift_count}         accent="amber" />
        <StatPill label="Contradictions" value={summary.contradiction_count} accent="risk"  />
        <StatPill label="Risks"          value={summary.risk_count}          accent="risk"  />
      </div>

      {/* Summary text */}
      <div className="rounded border border-graphite bg-ink-soft p-3">
        <p className="text-[12.5px] leading-[1.6] text-mist">{summary.summary_text}</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => void handleCopy()}
          className={cn(
            "flex items-center gap-1.5 rounded-[7px] border px-3.5 py-1.5 text-[12px] transition-all duration-smooth",
            copied
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-graphite text-fog hover:border-graphite-2 hover:text-mist",
          )}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
        <button
          className="rounded-[7px] border border-graphite px-3.5 py-1.5 text-[12px] text-fog hover:border-graphite-2 hover:text-mist transition-colors duration-smooth"
          title="Share (coming soon)"
          disabled
        >
          Send
        </button>
      </div>

      {/* Comments */}
      {summary.comments.length > 0 && (
        <section>
          <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.9px] text-fog">
            Comments ({summary.comments.length})
          </div>
          <div className="flex flex-col gap-2">
            {summary.comments.map((comment: { id: string; author: string; text: string; created_at: string }) => (
              <div key={comment.id} className="rounded border border-graphite bg-ink-soft px-3 py-2">
                <div className="mb-1 flex items-center gap-2 text-[10.5px] text-fog">
                  <span className="font-medium text-mist">{comment.author}</span>
                  <span>{new Date(comment.created_at).toLocaleString()}</span>
                </div>
                <p className="text-[12px] text-mist">{comment.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add comment (HITL) */}
      <div>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={isDemo ? "Comments available on live summaries…" : "Add a comment or observation…"}
          disabled={isDemo}
          rows={2}
          className="mb-2 w-full resize-none rounded border border-graphite bg-ink px-3 py-2 text-[12px] text-mist placeholder:text-fog focus:border-blue focus:outline-none disabled:opacity-40"
        />
        <button
          onClick={() => void handleAddComment()}
          disabled={!commentText.trim() || isCommenting || isDemo}
          className="rounded-[7px] bg-blue/20 px-4 py-1.5 text-[12px] font-medium text-blue disabled:opacity-40 hover:bg-blue/30 transition-colors"
        >
          {isCommenting ? "Adding…" : "Add comment"}
        </button>
      </div>
    </div>
  );
}
