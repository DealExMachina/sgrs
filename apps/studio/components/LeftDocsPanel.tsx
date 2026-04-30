"use client";

/**
 * LeftDocsPanel — collapsible left-side panel showing indexed source documents.
 *
 * Collapsed (w-9 / 36px): narrow strip with status dots and a toggle chevron.
 * Expanded (w-56 / 224px): full document cards with name, type chip, claim count.
 *
 * Hovering any row (in either state) reveals a tooltip positioned to the RIGHT
 * of the panel so it never gets clipped by the left edge.
 *
 * The panel transitions its own width; the parent layout (flex) accommodates
 * the change automatically — CSS Grid `auto` columns don't animate, flex does.
 */

import { useState } from "react";
import { cn } from "@sgrs/ui";
import type { ApiSgrsDocument, ApiClaim } from "@/lib/api-client";

// ─── Type chip ────────────────────────────────────────────────────────────────

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

// ─── Hover tooltip (positioned to the right of the panel) ────────────────────

function DocTooltip({ doc, claims }: { doc: ApiSgrsDocument; claims: ApiClaim[] }) {
  const avgConf =
    claims.length > 0
      ? claims.reduce((s, c) => s + c.confidence, 0) / claims.length
      : null;

  return (
    <div
      className="absolute left-full top-0 z-50 ml-2 w-64 rounded border border-graphite bg-ink shadow-xl"
      role="tooltip"
    >
      {/* Header */}
      <div className="border-b border-graphite px-3 py-2">
        <div className="flex items-center gap-2">
          <DocTypeChip type={doc.type} />
          <span className="truncate text-[12px] font-medium text-mist">{doc.name}</span>
        </div>
      </div>

      {/* Stats */}
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
            {new Date(doc.ingested_at).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Top claims */}
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

// ─── Single document row ──────────────────────────────────────────────────────

interface DocRowProps {
  doc: ApiSgrsDocument;
  claims: ApiClaim[];
  expanded: boolean;
}

function DocRow({ doc, claims, expanded }: DocRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={cn(
          "flex w-full items-center gap-2 border-b border-graphite/50 px-2 py-2.5 text-left transition-colors duration-smooth",
          hovered ? "bg-blue/[0.07]" : "hover:bg-graphite/30",
          expanded ? "pr-3" : "justify-center",
        )}
      >
        {/* Status dot — always visible */}
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            STATUS_DOT[doc.status] ?? "bg-fog",
          )}
        />

        {/* Full content — only in expanded state */}
        {expanded && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] leading-tight text-mist">{doc.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <DocTypeChip type={doc.type} />
              {doc.claim_count > 0 && (
                <span className="font-mono text-[9px] text-fog">{doc.claim_count}c</span>
              )}
            </div>
          </div>
        )}
      </button>

      {hovered && <DocTooltip doc={doc} claims={claims} />}
    </div>
  );
}

// ─── Mock data for demo ───────────────────────────────────────────────────────

const MOCK_DOCUMENTS: ApiSgrsDocument[] = [
  {
    id: "md1", scope_id: "demo", name: "Financial Model.xlsx",
    type: "xlsx", status: "indexed", claim_count: 2,
    ingested_at: new Date().toISOString(),
  },
  {
    id: "md2", scope_id: "demo", name: "Term Sheet v3.docx",
    type: "docx", status: "indexed", claim_count: 1,
    ingested_at: new Date().toISOString(),
  },
  {
    id: "md3", scope_id: "demo", name: "Legal Review.pdf",
    type: "pdf", status: "indexed", claim_count: 1,
    ingested_at: new Date().toISOString(),
  },
  {
    id: "md4", scope_id: "demo", name: "Data Room Index.pdf",
    type: "pdf", status: "processing", claim_count: 0,
    ingested_at: new Date().toISOString(),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  documents: ApiSgrsDocument[];
  /** Claims keyed by document name — used in the hover tooltip. */
  claimsByDoc: Record<string, ApiClaim[]>;
}

export function LeftDocsPanel({ documents, claimsByDoc }: Props) {
  const [expanded, setExpanded] = useState(false);

  const displayDocs = documents.length > 0 ? documents : MOCK_DOCUMENTS;
  const isDemo = documents.length === 0;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-graphite bg-ink-soft",
        "transition-[width] duration-200 ease-in-out",
        expanded ? "w-56" : "w-9",
      )}
    >
      {/* ── Toggle header ────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex h-8 shrink-0 items-center border-b border-graphite text-fog",
          "transition-colors duration-smooth hover:text-mist",
          expanded ? "justify-between px-2.5" : "justify-center",
        )}
        title={expanded ? "Collapse document panel" : "Expand document panel"}
        aria-label={expanded ? "Collapse document panel" : "Expand document panel"}
        aria-expanded={expanded}
      >
        {expanded && (
          <span className="truncate text-[9.5px] font-medium uppercase tracking-[0.9px]">
            Docs{isDemo && <span className="ml-1 opacity-40">(demo)</span>}
          </span>
        )}

        {/* Chevron — points right (expand) when collapsed, left when expanded */}
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          className={cn(
            "shrink-0 transition-transform duration-200",
            expanded ? "rotate-0" : "rotate-180",
          )}
          aria-hidden
        >
          <path
            d="M5.5 1.5L2.5 4.5L5.5 7.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {/* ── Document list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        {displayDocs.map((doc) => (
          <DocRow
            key={doc.id}
            doc={doc}
            claims={claimsByDoc[doc.name] ?? []}
            expanded={expanded}
          />
        ))}
      </div>

      {/* ── Add document placeholder (future release) ────────────────────── */}
      {expanded && (
        <div className="shrink-0 border-t border-graphite p-2">
          <button
            disabled
            title="Add document — coming in a future release"
            className="flex w-full cursor-not-allowed items-center justify-center gap-1 rounded border border-dashed border-graphite py-1.5 text-[10.5px] text-fog opacity-40"
          >
            <span>+</span>
            <span>Add document</span>
          </button>
        </div>
      )}
    </div>
  );
}
