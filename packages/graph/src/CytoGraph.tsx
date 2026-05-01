"use client";

import cytoscape, { type Core } from "cytoscape";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultLayout, defaultStyle } from "./style.js";
import type { GraphData, GraphNode } from "./types.js";

export interface CytoGraphProps {
  data: GraphData;
  className?: string;
  onNodeHover?: (node: GraphNode | null) => void;
  onZoom?: (zoom: number) => void;
}

/** Minimal icon button for the pan/zoom toolbar */
function ToolBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        background: "rgba(20,24,32,0.82)",
        border: "1px solid #1e2535",
        borderRadius: 5,
        color: "#8b95a8",
        fontSize: 14,
        cursor: "pointer",
        backdropFilter: "blur(4px)",
        transition: "color 120ms, border-color 120ms",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#c9cdd6";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#3d4d6b";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#8b95a8";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2535";
      }}
    >
      {children}
    </button>
  );
}

/**
 * Cytoscape graph with progressive-disclosure labels, hover focus,
 * and a compact pan/zoom toolbar.
 *
 * Behaviors:
 * 1. Zoom-driven label reveal (conflicts/risks first, then all at high zoom)
 * 2. Hover neighbourhood highlight + dim non-neighbours
 * 3. Keyboard: + / - / 0 for zoom/fit
 * 4. Mouse: scroll to zoom, drag to pan
 */
export function CytoGraph({
  data,
  className,
  onNodeHover,
  onZoom,
}: CytoGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  // ── Toolbar handlers (stable refs) ───────────────────────────────────────────
  const zoomIn = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.animate({ zoom: { level: cyRef.current.zoom() * 1.3, renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } }, duration: 220 });
  }, []);

  const zoomOut = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.animate({ zoom: { level: cyRef.current.zoom() * 0.77, renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } }, duration: 220 });
  }, []);

  const fitAll = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.animate({ fit: { eles: cyRef.current.elements(), padding: 56 }, duration: 260 });
  }, []);

  // ── Graph initialization ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !data?.nodes?.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: {
        nodes: data.nodes.map((n) => ({ data: { ...n } })),
        edges: (data.edges ?? []).map((e) => ({ data: { ...e } })),
      },
      minZoom: 0.3,
      maxZoom: 3.0,
      wheelSensitivity: 0.18,
      style: defaultStyle,
      layout: defaultLayout,
    });

    cyRef.current = cy;

    // ── Label reveal thresholds ─────────────────────────────────────────────────
    function updateLabels() {
      const z = cy.zoom();
      cy.batch(() => {
        cy.nodes().removeClass("show-label");
        if (z < 0.65) {
          // Only show critical items at low zoom
          cy.nodes('[type="contradiction"], [type="risk"]').addClass("show-label");
        } else if (z < 1.05) {
          // Show landmark nodes at medium zoom
          cy.nodes('[type="contradiction"], [type="risk"], [type="doc"]').addClass("show-label");
        } else {
          // Show all labels at high zoom
          cy.nodes().addClass("show-label");
        }
      });
    }

    function handleZoom() {
      updateLabels();
      const pct = Math.round(cy.zoom() * 100);
      setZoomPct(pct);
      onZoom?.(cy.zoom());
    }

    cy.on("zoom", handleZoom);

    cy.ready(() => {
      updateLabels();
      setTimeout(() => {
        try {
          if (cyRef.current && containerRef.current && containerRef.current.offsetHeight > 0) {
            cyRef.current.fit(undefined, 56);
          }
        } catch (err) {
          console.warn("[cytoscape] fit failed:", err);
        }
      }, 30);
    });

    // ── Hover neighbourhood ─────────────────────────────────────────────────────
    cy.on("mouseover", "node", (e) => {
      const n = e.target;
      const nbh = n.closedNeighborhood();
      cy.elements().difference(nbh).addClass("dim");
      nbh.addClass("hi");
      onNodeHover?.(n.data() as GraphNode);
    });

    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("dim hi");
      onNodeHover?.(null);
    });

    cy.on("pan zoom", () => onNodeHover?.(null));

    // ── Keyboard shortcuts ──────────────────────────────────────────────────────
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
      if (e.key === "0" || e.key === "f") fitAll();
    }
    window.addEventListener("keydown", handleKey);

    return () => {
      cy.destroy();
      cyRef.current = null;
      window.removeEventListener("keydown", handleKey);
    };
  }, [data, onNodeHover, onZoom, zoomIn, zoomOut, fitAll]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Graph canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "transparent" }} />

      {/* Pan/Zoom toolbar — bottom right */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          right: 14,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
        }}
      >
        <ToolBtn title="Zoom in  (+)" onClick={zoomIn}>+</ToolBtn>
        <ToolBtn title="Zoom out (−)" onClick={zoomOut}>−</ToolBtn>
        <ToolBtn title="Fit all  (0)" onClick={fitAll}>⤢</ToolBtn>

        {/* Zoom % indicator */}
        <div
          style={{
            marginTop: 2,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 10,
            color: "#4a5168",
            letterSpacing: "0.3px",
            textAlign: "center",
          }}
        >
          {zoomPct}%
        </div>
      </div>

      {/* Hint label — bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 9.5,
          color: "#2d3447",
          letterSpacing: "0.4px",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        scroll · drag · hover
      </div>
    </div>
  );
}
