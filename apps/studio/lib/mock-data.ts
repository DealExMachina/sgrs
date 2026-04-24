import type { GraphData } from "@sgrs/graph";

/**
 * Project Horizon — M&A due-diligence scenario seed.
 * Mirrors the demo/scenario/docs-ma fixtures in the SGRS kernel repo,
 * flattened to graph form for the Studio business view.
 */
export const horizonScenario: GraphData = {
  nodes: [
    {
      id: "doc-1",
      label: "Analyst Briefing",
      type: "doc",
      info: {
        subtitle: "doc · 2026-03-01 · 3 claims",
        desc: "Initial profile · ARR €50M · CAGR 45% · 7 patents",
      },
    },
    {
      id: "doc-2",
      label: "Financial DD",
      type: "doc",
      info: {
        subtitle: "doc · 2026-03-18 · 5 claims",
        desc: "ARR €38M · 2 patents disputed · drift high vs doc-1",
      },
    },
    {
      id: "doc-3",
      label: "Technical",
      type: "doc",
      info: {
        subtitle: "doc · 2026-03-26 · 4 claims",
        desc: "Core tech solid · CTO + 2 seniors departing",
      },
    },
    {
      id: "doc-4",
      label: "Market Intel",
      type: "doc",
      info: {
        subtitle: "doc · 2026-04-04 · 3 claims",
        desc: "Patent suit · top client evaluating alternatives",
      },
    },
    {
      id: "doc-5",
      label: "Legal Review",
      type: "doc",
      info: {
        subtitle: "doc · 2026-04-11 · 4 claims",
        desc: "IP risks manageable · price band €270–290M",
      },
    },

    {
      id: "c-arr-50",
      label: "ARR €50M",
      type: "claim",
      conf: 0.82,
      stale: true,
      info: {
        subtitle: "claim · stale · superseded 2026-03-18",
        desc: "From doc-1 · conf 0.82 · superseded by c-arr-38",
      },
    },
    {
      id: "c-arr-38",
      label: "ARR €38M",
      type: "claim",
      conf: 0.94,
      info: {
        subtitle: "claim · current",
        desc: "From doc-2 · conf 0.94 · supports r-overstate",
      },
    },
    {
      id: "c-cagr",
      label: "CAGR 45%",
      type: "claim",
      conf: 0.7,
      info: {
        subtitle: "claim · current",
        desc: "From doc-1 · conf 0.70 · no corroboration yet",
      },
    },
    {
      id: "c-patents-7",
      label: "7 patents",
      type: "claim",
      conf: 0.78,
      info: {
        subtitle: "claim · qualified",
        desc: "From doc-1 · conf 0.78 · 2 disputed per doc-2",
      },
    },
    {
      id: "c-patents-disp",
      label: "2 disputed",
      type: "claim",
      conf: 0.89,
      info: {
        subtitle: "claim · current",
        desc: "From doc-2 · conf 0.89 · qualifies c-patents-7",
      },
    },
    {
      id: "c-cto",
      label: "CTO departing",
      type: "claim",
      conf: 0.86,
      info: {
        subtitle: "claim · current",
        desc: "From doc-3 · conf 0.86 · supports r-talent",
      },
    },
    {
      id: "c-client",
      label: "Client evaluating alt.",
      type: "claim",
      conf: 0.74,
      info: {
        subtitle: "claim · current",
        desc: "From doc-4 · conf 0.74 · supports r-concent",
      },
    },
    {
      id: "c-ip-ok",
      label: "IP risks manageable",
      type: "claim",
      conf: 0.81,
      info: {
        subtitle: "claim · current",
        desc: "From doc-5 · conf 0.81 · supports g-signoff",
      },
    },

    {
      id: "x-arr",
      label: "ARR conflict",
      type: "contradiction",
      veto: true,
      info: {
        subtitle: "contradiction · unresolved · VETO",
        desc: "€50M (doc-1) ↔ €38M (doc-2) · valid-time overlap",
      },
    },
    {
      id: "x-risk",
      label: "'low risk' qualified",
      type: "contradiction",
      veto: false,
      info: {
        subtitle: "contradiction · soft · qualified",
        desc: "doc-1 low-risk claim ↔ evidence from docs 2–4",
      },
    },

    {
      id: "r-overstate",
      label: "Overstatement",
      type: "risk",
      info: { subtitle: "risk · high", desc: "Financial overstatement · supported by c-arr-38" },
    },
    {
      id: "r-talent",
      label: "Talent flight",
      type: "risk",
      info: { subtitle: "risk · medium", desc: "Key talent departure · supported by c-cto" },
    },
    {
      id: "r-ip",
      label: "IP disputes",
      type: "risk",
      info: { subtitle: "risk · medium", desc: "Patent ownership · supported by c-patents-disp" },
    },
    {
      id: "r-concent",
      label: "Client concentration",
      type: "risk",
      info: { subtitle: "risk · medium", desc: "Top-client churn · supported by c-client" },
    },

    {
      id: "g-price",
      label: "Price €270–290M",
      type: "goal",
      info: {
        subtitle: "goal · 79% complete",
        desc: "Acquisition price band · refs r-overstate, c-arr-38",
      },
    },
    {
      id: "g-complete",
      label: "DD complete",
      type: "goal",
      info: { subtitle: "goal · active", desc: "Full due-diligence closure" },
    },
    {
      id: "g-signoff",
      label: "Legal sign-off",
      type: "goal",
      info: {
        subtitle: "goal · 81% complete",
        desc: "Legal recommendation · refs c-ip-ok, r-ip",
      },
    },
  ],
  edges: [
    { source: "doc-1", target: "c-arr-50", type: "refers" },
    { source: "doc-1", target: "c-cagr", type: "refers" },
    { source: "doc-1", target: "c-patents-7", type: "refers" },
    { source: "doc-2", target: "c-arr-38", type: "refers" },
    { source: "doc-2", target: "c-patents-disp", type: "refers" },
    { source: "doc-3", target: "c-cto", type: "refers" },
    { source: "doc-4", target: "c-client", type: "refers" },
    { source: "doc-5", target: "c-ip-ok", type: "refers" },
    { source: "x-arr", target: "c-arr-50", type: "contradicts" },
    { source: "x-arr", target: "c-arr-38", type: "contradicts" },
    { source: "x-risk", target: "c-cto", type: "contradicts" },
    { source: "x-risk", target: "c-client", type: "contradicts" },
    { source: "c-arr-38", target: "r-overstate", type: "supports" },
    { source: "c-cto", target: "r-talent", type: "supports" },
    { source: "c-patents-disp", target: "r-ip", type: "supports" },
    { source: "c-client", target: "r-concent", type: "supports" },
    { source: "r-overstate", target: "g-price", type: "refers" },
    { source: "r-ip", target: "g-signoff", type: "refers" },
    { source: "c-ip-ok", target: "g-signoff", type: "supports" },
    { source: "c-arr-38", target: "g-price", type: "supports" },
  ],
};

export interface ScopeSummary {
  id: string;
  name: string;
  tag: string;
  score: number;
  cycles: number;
  state: "active" | "near-final" | "resolved" | "archived";
  note?: string;
}

export const scopes: ScopeSummary[] = [
  {
    id: "deal-horizon",
    name: "Horizon",
    tag: "M&A",
    score: 0.78,
    cycles: 14,
    state: "near-final",
    note: "14 cycles · 2 contradictions",
  },
  {
    id: "green-bond-2026",
    name: "Green Bond 2026",
    tag: "EUGBS",
    score: 0.64,
    cycles: 23,
    state: "active",
    note: "23 cycles · 38 docs",
  },
  {
    id: "solvency-ii-q1",
    name: "Solvency II Q1",
    tag: "Insurance",
    score: 0.94,
    cycles: 8,
    state: "resolved",
    note: "8 cycles · certified",
  },
  {
    id: "kyc-2025-h2",
    name: "KYC-2025-H2",
    tag: "AML",
    score: 0.91,
    cycles: 41,
    state: "archived",
    note: "41 cycles · 12 certificates",
  },
];
