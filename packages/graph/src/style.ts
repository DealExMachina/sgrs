import type cytoscape from "cytoscape";

/**
 * Governance Graph — obsidian-style minimal design.
 *
 * - Small nodes, dot-like at low zoom
 * - Labels on hover only (no zoom thresholds)
 * - Very thin, subtle edges
 * - Contradiction edges always visible in red
 * - Dark fills, colored borders encode type/state
 */
export const defaultStyle: cytoscape.StylesheetStyle[] = [

  // ── Base node ────────────────────────────────────────────────────────────────
  {
    selector: "node",
    style: {
      label: "data(label)",
      color: "#9aa5b4",
      "font-family": "Inter, system-ui, sans-serif",
      "font-size": 10,
      "font-weight": 400,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 5,
      "text-wrap": "wrap",
      "text-max-width": "100px",
      "text-outline-color": "#05070a",
      "text-outline-width": 2,
      "border-width": 1,
      "border-color": "#1e2535",
      // Labels hidden by default — only shown via .hi class (hover)
      "text-opacity": 0,
      "transition-property": "opacity, border-color, border-width, background-color, text-opacity",
      "transition-duration": 150,
      "transition-timing-function": "ease-out",
    },
  },

  // ── Document nodes ───────────────────────────────────────────────────────────
  {
    selector: "node[type='doc']",
    style: {
      shape: "round-rectangle",
      "background-color": "#0d1018",
      "border-color": "#2a3650",
      "border-width": 1,
      width: 18,
      height: 18,
    },
  },

  // ── Claim nodes ──────────────────────────────────────────────────────────────
  {
    selector: "node[type='claim']",
    style: {
      shape: "ellipse",
      "background-color": (n: cytoscape.NodeSingular) => {
        const c = Number(n.data("conf")) || 0.5;
        if (c >= 0.8) return "#071a0d";
        if (c >= 0.6) return "#07122b";
        return "#0e0e11";
      },
      "border-color": (n: cytoscape.NodeSingular) => {
        const c = Number(n.data("conf")) || 0.5;
        if (c >= 0.8) return "#16a34a";
        if (c >= 0.6) return "#2563eb";
        return "#3f3f46";
      },
      "border-width": 1.2,
      // Size scales gently with confidence: 14–20px
      width: (n: cytoscape.NodeSingular) => 14 + (Number(n.data("conf")) || 0.5) * 12,
      height: (n: cytoscape.NodeSingular) => 14 + (Number(n.data("conf")) || 0.5) * 12,
    },
  },

  // Stale
  {
    selector: "node[type='claim'][?stale]",
    style: { opacity: 0.35, "border-style": "dashed" },
  },

  // ── Contradiction nodes ──────────────────────────────────────────────────────
  {
    selector: "node[type='contradiction']",
    style: {
      shape: "diamond",
      "background-color": (n: cytoscape.NodeSingular) =>
        n.data("veto") ? "#180808" : "#110606",
      "border-color": (n: cytoscape.NodeSingular) =>
        n.data("veto") ? "#dc2626" : "#7f1d1d",
      "border-width": (n: cytoscape.NodeSingular) =>
        n.data("veto") ? 2 : 1.2,
      width: 20,
      height: 20,
    },
  },

  // ── Risk nodes ───────────────────────────────────────────────────────────────
  {
    selector: "node[type='risk']",
    style: {
      shape: "triangle",
      "background-color": "#100900",
      "border-color": "#92400e",
      "border-width": 1.2,
      width: 20,
      height: 20,
    },
  },

  // ── Base edge ────────────────────────────────────────────────────────────────
  {
    selector: "edge",
    style: {
      width: 0.8,
      "curve-style": "bezier",
      "target-arrow-shape": "none",   // no arrowheads by default — cleaner
      "line-color": "#151b28",
      opacity: 0.5,
      "transition-property": "opacity, line-color, width",
      "transition-duration": 150,
    },
  },

  // Doc → Claim  (barely visible dotted)
  {
    selector: "edge[type='refers']",
    style: {
      "line-color": "#1c2438",
      "line-style": "dashed",
      "line-dash-pattern": [3, 4],
      width: 0.6,
      opacity: 0.25,
    },
  },

  // Claim → Risk
  {
    selector: "edge[type='supports']",
    style: {
      "line-color": "#14532d",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#14532d",
      "arrow-scale": 0.5,
      width: 0.9,
      opacity: 0.55,
    },
  },

  // Contradicts — always visible, red, solid
  {
    selector: "edge[type='contradicts']",
    style: {
      "line-color": "#7f1d1d",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#7f1d1d",
      "arrow-scale": 0.5,
      "line-style": "solid",
      width: 1.2,
      opacity: 0.85,
    },
  },

  // ── Hover: dim everything outside neighbourhood ───────────────────────────────
  {
    selector: ".dim",
    style: {
      opacity: 0.06,
      "text-opacity": 0,
    },
  },

  // ── Hover: highlight neighbourhood ───────────────────────────────────────────
  {
    selector: ".hi",
    style: {
      "border-color": "#f97316",
      "border-width": 2,
      "text-opacity": 1,           // label appears ONLY on hover
      opacity: 1,
    },
  },
  {
    selector: "edge.hi",
    style: {
      "line-color": "#f97316",
      "target-arrow-color": "#f97316",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.5,
      width: 1.5,
      opacity: 1,
    },
  },
];

export const defaultLayout: cytoscape.LayoutOptions = {
  name: "cose",
  animate: false,
  avoidOverlap: true,
  avoidOverlapPadding: 20,
  nodeSpacing: 10,
  directed: true,
  edgeElasticity: 0.4,
  nestingFactor: 0.1,
  gravity: 0.25,
  numIter: 2500,
  initialTemp: 200,
  coolingFactor: 0.95,
  minTemp: 1.0,
  randomize: false,
  fit: true,
  padding: 48,
} as cytoscape.LayoutOptions;
