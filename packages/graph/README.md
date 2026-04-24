# @sgrs/graph

React wrapper around [Cytoscape.js](https://js.cytoscape.org/) with SGRS-specific defaults:

- DxM-themed stylesheet (see `style.ts`)
- Progressive label disclosure by zoom level
- Hover-driven focus: neighbours highlighted, non-neighbours dimmed
- Tooltip delegated to the parent via `onNodeHover`

## Usage

```tsx
import { CytoGraph, type GraphData } from "@sgrs/graph";

const data: GraphData = {
  nodes: [
    { id: "c-1", label: "ARR €38M", type: "claim", conf: 0.94 },
    { id: "x-1", label: "ARR conflict", type: "contradiction", veto: true },
  ],
  edges: [{ source: "x-1", target: "c-1", type: "contradicts" }],
};

<CytoGraph data={data} onNodeHover={(n) => setHover(n)} />;
```

## License

BUSL-1.1 — see `LICENSE`.
