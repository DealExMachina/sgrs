"use client";

import { CytoGraph, type GraphData, type GraphNode } from "@sgrs/graph";
import { useRef, useState } from "react";
import { cn } from "@sgrs/ui";

interface Props {
  data: GraphData;
  className?: string;
}

export function Graph({ data, className }: Props) {
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative overflow-hidden rounded border border-graphite bg-ink-soft",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(rgba(38,42,51,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(38,42,51,0.35) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <CytoGraph data={data} onNodeHover={setHovered} />
      {hovered && <Tooltip node={hovered} />}
    </div>
  );
}

function Tooltip({ node }: { node: GraphNode }) {
  const tag = tagFor(node);
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-50 max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-sm border border-graphite-2 bg-ink-raised px-3 py-2.5 text-[12px] text-mist shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-opacity duration-100"
      style={{ opacity: 1 }}
    >
      <div className="mb-0.5 font-semibold text-mist">
        {tag}
        {node.label}
      </div>
      <div className="text-[11px] leading-[1.5] text-fog">
        {node.info?.subtitle}
        {node.info?.desc && (
          <>
            <br />
            {node.info.desc}
          </>
        )}
      </div>
    </div>
  );
}

function tagFor(node: GraphNode) {
  const base = "mr-1 inline-block rounded-[3px] px-1.5 py-px font-mono text-[10px]";
  if (node.type === "contradiction")
    return node.veto ? (
      <span className={cn(base, "bg-risk/15 text-risk")}>VETO</span>
    ) : (
      <span className={cn(base, "bg-amber/15 text-amber")}>soft</span>
    );
  if (node.type === "risk")
    return <span className={cn(base, "bg-amber/15 text-amber")}>risk</span>;
  if (node.type === "claim" && node.stale)
    return <span className={cn(base, "bg-fog/15 text-fog-2")}>stale</span>;
  if (node.type === "claim")
    return <span className={cn(base, "bg-blue/15 text-blue")}>claim</span>;
  if (node.type === "goal")
    return <span className={cn(base, "bg-blue/15 text-blue")}>goal</span>;
  return <span className={cn(base, "bg-blue/15 text-blue")}>doc</span>;
}
