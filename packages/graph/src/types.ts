export type NodeType =
  | "doc"
  | "claim"
  | "contradiction"
  | "risk"
  | "goal";

export interface NodeInfo {
  subtitle?: string;
  desc?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  conf?: number;
  stale?: boolean;
  veto?: boolean;
  info?: NodeInfo;
}

export type EdgeType = "refers" | "supports" | "contradicts";

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
