import type cytoscape from "cytoscape";

/**
 * DxM-themed Cytoscape stylesheet.
 *
 * Design principles:
 * - Labels hidden by default; toggled via the `show-label` class driven by zoom
 * - Confidence of a claim encoded as its diameter (pre-attentive)
 * - Stale claims keep their position but shift to dashed + desaturated
 * - Contradictions are diamonds, risks round-diamonds, goals hexagons
 *   (shape alone suffices to distinguish node types at any zoom)
 */
export const defaultStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      color: "#c9cdd6",
      "font-family": "Inter, system-ui, sans-serif",
      "font-size": 11,
      "font-weight": 500,
      "text-valign": "bottom",
      "text-margin-y": 8,
      "text-wrap": "wrap",
      "text-max-width": "120px",
      "text-outline-color": "#0b0c0f",
      "text-outline-width": 2,
      "border-width": 1,
      "border-color": "#363b47",
      "text-opacity": 0,
      "transition-property":
        "text-opacity, opacity, border-color, background-color",
      "transition-duration": 140,
      "transition-timing-function": "ease-out",
    },
  },
  {
    selector: 'node[type="doc"]',
    style: {
      shape: "round-rectangle",
      "background-color": "#12141a",
      "border-color": "#7a7f8b",
      width: 30,
      height: 30,
      color: "#9aa0ac",
      "font-size": 10.5,
    },
  },
  {
    selector: 'node[type="claim"]',
    style: {
      shape: "ellipse",
      "background-color": "#3e6b93",
      "border-color": "#6aa6d6",
      "border-width": 1.5,
      width: (n: cytoscape.NodeSingular) => 28 + (Number(n.data("conf")) || 0.5) * 22,
      height: (n: cytoscape.NodeSingular) => 28 + (Number(n.data("conf")) || 0.5) * 22,
    },
  },
  {
    selector: 'node[type="claim"][?stale]',
    style: {
      "background-color": "#1b1e25",
      "border-style": "dashed",
      color: "#7a7f8b",
    },
  },
  {
    selector: 'node[type="contradiction"]',
    style: {
      shape: "diamond",
      "background-color": "#12141a",
      "border-color": "#d97a6c",
      "border-width": 2,
      width: 34,
      height: 34,
      color: "#d97a6c",
    },
  },
  {
    selector: 'node[type="risk"]',
    style: {
      shape: "round-diamond",
      "background-color": "#12141a",
      "border-color": "#e8b765",
      "border-width": 1.5,
      width: 32,
      height: 32,
      color: "#e8b765",
    },
  },
  {
    selector: 'node[type="goal"]',
    style: {
      shape: "round-hexagon",
      "background-color": "#12141a",
      "border-color": "#7fb98b",
      "border-width": 1.5,
      width: 36,
      height: 36,
      color: "#7fb98b",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.7,
      "line-color": "#262a33",
      "target-arrow-color": "#262a33",
      opacity: 0.5,
      "transition-property": "opacity, line-color",
      "transition-duration": 140,
    },
  },
  {
    selector: 'edge[type="supports"]',
    style: {
      "line-color": "#3e6b93",
      "target-arrow-color": "#3e6b93",
      width: 1.1,
      opacity: 0.75,
    },
  },
  {
    selector: 'edge[type="contradicts"]',
    style: {
      "line-color": "#d97a6c",
      "target-arrow-color": "#d97a6c",
      "line-style": "dashed",
      width: 1.3,
      opacity: 0.8,
    },
  },
  {
    selector: ".show-label",
    style: { "text-opacity": 1 },
  },
  {
    selector: ".dim",
    style: {
      opacity: 0.14,
      "text-opacity": 0,
    },
  },
  {
    selector: ".hi",
    style: {
      "border-color": "#ff7a1a",
      "border-width": 2,
      "text-opacity": 1,
    },
  },
  {
    selector: "edge.hi",
    style: {
      "line-color": "#ff7a1a",
      "target-arrow-color": "#ff7a1a",
      width: 1.6,
      opacity: 1,
    },
  },
];

export const defaultLayout: cytoscape.LayoutOptions = {
  name: "cose",
  animate: false,
  randomize: true,
  componentSpacing: 90,
  nodeRepulsion: 32000,
  idealEdgeLength: 130,
  edgeElasticity: 110,
  gravity: 0.22,
  numIter: 2000,
  padding: 60,
  fit: true,
  nodeDimensionsIncludeLabels: true,
} as cytoscape.LayoutOptions;
