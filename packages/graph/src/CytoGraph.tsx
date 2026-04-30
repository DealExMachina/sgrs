"use client";

import cytoscape, { type Core } from "cytoscape";
import { useEffect, useRef, useState } from "react";
import { defaultLayout, defaultStyle } from "./style.js";
import type { GraphData, GraphNode } from "./types.js";

export interface CytoGraphProps {
  data: GraphData;
  className?: string;
  onNodeHover?: (node: GraphNode | null) => void;
  onZoom?: (zoom: number) => void;
}

/**
 * Cytoscape graph with three progressive-disclosure behaviors:
 *
 * 1. Zoom-driven label reveal (landmarks first, then everything)
 * 2. Hover focus: neighbours highlighted, non-neighbours dimmed
 * 3. Tooltip rendered by the parent (onNodeHover callback)
 *
 * The component is fully client-side — do not import in an RSC.
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

  useEffect(() => {
    if (!containerRef.current || !data?.nodes?.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: {
        nodes: data.nodes.map((n) => ({ data: { ...n } })),
        edges: (data.edges || []).map((e) => ({ data: { ...e } })),
      },
      minZoom: 0.45,
      maxZoom: 2.4,
      wheelSensitivity: 0.22,
      style: defaultStyle,
      layout: defaultLayout,
    });

    cyRef.current = cy;

    function updateLabels() {
      const z = cy.zoom();
      cy.batch(() => {
        cy.nodes().removeClass("show-label");
        if (z < 0.7) {
          cy.nodes(
            '[type="contradiction"], [type="risk"]',
          ).addClass("show-label");
        } else if (z < 1.1) {
          cy.nodes(
            '[type="contradiction"], [type="risk"], [type="doc"], [type="goal"]',
          ).addClass("show-label");
        } else {
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
      // Defer fit with explicit container check to ensure dimensions are available
      setTimeout(() => {
        try {
          if (cyRef.current && containerRef.current?.offsetHeight > 0) {
            cyRef.current.fit(undefined, 60);
          }
        } catch (err) {
          console.warn("[cytoscape] fit failed (container may not be sized):", err);
        }
      }, 30);
    });

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

    cy.on("pan zoom", () => {
      onNodeHover?.(null);
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, onNodeHover, onZoom]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          bottom: 14,
          right: 14,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10.5,
          color: "var(--dxm-fog)",
          letterSpacing: "0.4px",
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "var(--dxm-mist)" }}>{zoomPct}%</span>
        <span style={{ marginLeft: 8 }}>hover · scroll</span>
      </div>
    </div>
  );
}
