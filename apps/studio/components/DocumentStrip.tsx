"use client";

import { useState } from "react";
import { cn } from "@sgrs/ui";
import type { ApiSgrsDocument, ApiClaim } from "@/lib/api-client";

// ─── File type icon ───────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  pdf:  "bg-risk/15 text-risk",
  docx: "bg-blue/15 text-blue",
  xlsx: "bg-ok/15 text-ok",
  txt:  "bg-fog/10 text-fog",
  url:  "bg-amber/15 text-amber",
};

function DocTypeChip({ type }: { type: string }) {
  const cls = TYPE_COLORS[type.toLowerCase()] ?? "bg-fog/10 text-fog";
  return (
    <span className={cn(
      "rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.6px]",
      cls,
    )}>
      {type}
    </span>
  );
}

// ─── Status dot ───────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  indexed:    "bg-ok",
  processing: "bg-amber animate-pulse",
  pending:    "bg-fog",
  failed:     "bg-risk",
};

// ─── Hover tooltip ────────────────────────────────────────────────────────────

function DocTooltip({
  doc,
  claims,
}: {
  doc: ApiSgrsDocument;
  claims: ApiClaim[];
}) {
  const avgConf =
    claims.length > 0
      ? claims.reduce((s, c) => s + c.confidence, 0) / claims.length
      : null;

  return (
    <div
      className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded border border-graphite bg-ink shadow-xl"
      role="tooltip"
    >
      <div className="border-b border-graphite px-3 py-2">
        <div className="flex items-center gap-2">
          <DocTypeChip type={doc.type} />
          <span className="truncate text-[12px] font-medium text-mist">{doc.name}</span>
        </div>
      </div>
      <div className="px-3 py-2 text-[11.5px] text-fog">
        <div className="flex justify-between py-0.5">
          <span>Status</span>
          <span className={cn(
            "font-medium capitalize",
            doc.status === "indexed" ? "text-ok" :
            doc.status === "failed"  ? "text-risk" :
            "text-amber",
          )}>
            {doc.status}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Claims extracted</span>
          <span className="font-mono text-mist">{doc.claim_count}</span>
        </div>
        {avgConf !== null && (
          <div className="flex justify-between py-0.5">
            <span>Avg confidence</span>
            <span className="font-mono text-mist">{(avgConf * 100).toFixed(0)}%</span>
          </div>
        )}
        <div className="flex justify-between py-0.5">
          <span>Ingested</span>
          <span className="text-[10.5px] text-fog">
            {new Date(doc.ingested_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
      {claims.length > 0 && (
        <div className="border-t border-graphite px-3 py-2">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.8px] text-fog">
            Top claims
          </div>
          {claims.slice(0, 2).map((c) => (
            <p key={c.id} className="py-0.5 text-[11px] leading-[1.4] text-mist line-clamp-2">
              {c.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single document chip ─────────────────────────────────────────────────────

function DocChip({
  doc,
  claims,
}: {
  doc: ApiSgrsDocument;
  claims: ApiClaim[];
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={cn(
          "flex items-center gap-2 rounded border px-3 py-1.5 text-[11.5px] transition-colors duration-smooth",
          hovered
            ? "border-blue/40 bg-blue/[0.07] text-mist"
            : "border-graphite bg-ink-soft text-fog hover:text-mist",
        )}
      >
        {/* Status dot */}
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[doc.status] ?? "bg-fog")} />
        {/* Name — truncate at ~24 chars */}
        <span className="max-w-[140px] truncate">{doc.name}</span>
        {/* Claim count badge */}
        {doc.claim_count > 0 && (
          <span className="ml-0.5 rounded-full bg-blue/15 px-1.5 py-0.5 font-mono text-[9px] text-blue">
            {doc.claim_count}
          </span>
        )}
      </button>

      {hovered && <DocTooltip doc={doc} claims={claims} />}
    </div>
  );
}

// ─── Mock documents for demo ──────────────────────────────────────────────────

const MOCK_DOCUMENTS: ApiSgrsDocument[] = [
  { id: "md1", scope_id: "demo", name: "Financial Model.xlsx",  type: "xlsx", status: "indexed",    claim_count: 2, ingested_at: new Date().toISOString() },
  { id: "md2", scope_id: "demo", name: "Term Sheet v3.docx",    type: "docx", status: "indexed",    claim_count: 1, ingested_at: new Date().toISOString() },
  { id: "md3", scope_id: "demo", name: "Legal Review.pdf",      type: "pdf",  status: "indexed",    claim_count: 1, ingested_at: new Date().toISOString() },
  { id: "md4", scope_id: "demo", name: "Data Room Index.pdf",   type: "pdf",  status: "processing", claim_count: 0, ingested_at: new Date().toISOString() },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  documents: ApiSgrsDocument[];
  /** Claims keyed by document name for the hover tooltip. */
  claimsByDoc: Record<string, ApiClaim[]>;
}

export function DocumentStrip({ documents, claimsByDoc }: Props) {
  const displayDocs = documents.length > 0 ? documents : MOCK_DOCUMENTS;
  const isDemo = documents.length === 0;

  return (
    <div className="flex h-full items-center gap-2 overflow-x-auto px-4 py-2">
      {/* Label */}
      <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.9px] text-fog">
        Source docs
      </span>
      <div className="mx-1.5 h-3 w-px shrink-0 bg-graphite" />

      {/* Document chips */}
      {displayDocs.map((doc) => (
        <DocChip
          key={doc.id}
          doc={doc}
          claims={claimsByDoc[doc.name] ?? []}
        />
      ))}

      {/* Demo label */}
      {isDemo && (
        <span className="ml-1 text-[10px] text-fog opacity-50">(demo)</span>
      )}

      {/* Add document button — Future release */}
      <div className="relative ml-auto shrink-0">
        <button
          disabled
          title="Add document — coming in a future release"
          className="flex h-7 w-7 items-center justify-center rounded border border-dashed border-graphite text-[15px] text-fog opacity-40 cursor-not-allowed"
          aria-label="Add document (coming soon)"
        >
          +
        </button>
      </div>
    </div>
  );
}
