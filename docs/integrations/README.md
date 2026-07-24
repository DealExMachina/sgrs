# Integrating SGRS with agent frameworks

SGRS is a **governed swarm of agents**. It exposes a small REST surface and an
optional NATS event stream that any external agent framework can talk to. This
folder shows how to plug SGRS into four popular frameworks:

| Framework   | Language   | Guide                              |
| ----------- | ---------- | ---------------------------------- |
| LangGraph   | Python     | [langgraph.md](./langgraph.md)     |
| Pydantic AI | Python     | [pydantic-ai.md](./pydantic-ai.md) |
| Mastra      | TypeScript | [mastra.md](./mastra.md)           |
| Agentica    | TypeScript | [agentica.md](./agentica.md)       |

Every guide covers the same two integration patterns, so you can pick the one
that matches your use case:

1. **SGRS as a retriever** — your agent queries a governed scope for vetted
   claims, contradictions, risks, and convergence status, and uses them as
   grounding context (a _governed_ alternative to a plain vector-store
   retriever).
2. **SGRS as a swarm participant** — your agent joins the swarm as an external
   worker: it receives tasks, contributes claims back into a scope, and honors
   the governance **veto** so it halts the moment the kernel says stop.

---

## Prerequisites

- A running SGRS API (see the repo [Quickstart](../../README.md#quickstart-dev)).
  The API defaults to `http://localhost:3003`.
- A tenant id. Every authenticated route requires the `X-Tenant-ID` header
  (kebab-case slug, e.g. `acme`).
- Optional: an API key sent as `Authorization: Bearer <key>`.
- For real-time swarm participation: a NATS server reachable from your agent,
  and the `nats` package for your language.

Install the SGRS client for your language:

```bash
npm install @sgrs/client-ts     # TypeScript (Mastra, Agentica)
pip install sgrs-client         # Python (LangGraph, Pydantic AI)
```

> Both clients cover the same surface: scopes, models, finality, agents,
> health, ingest, the governance read helpers (claims, contradictions, risks,
> documents, epochs), and NATS events. The one route neither SDK wraps yet is
> claim *creation* (`POST /api/claims`), so the swarm-participant examples make a
> thin HTTP call for that single step.

---

## The endpoints an agent uses

These are the only routes you need for both patterns. All of them are scoped to
a tenant (via `X-Tenant-ID`) and, where relevant, a `scope_id`.

### Retriever pattern

| Method & path                      | Purpose                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/ingest`                 | Feed source text into a scope; the swarm extracts claims, detects contradictions, and scores risk asynchronously. |
| `GET /api/claims/:scopeId`         | Governed claims (text, `source`, `confidence`, `dimension`, `round`).                                             |
| `GET /api/contradictions/:scopeId` | Open/resolved contradictions between claims.                                                                      |
| `GET /api/risks/:scopeId`          | Identified risks with `level` and `category`.                                                                     |
| `GET /api/finality/:scopeId`       | Convergence status: `score`, `state`, `veto_active`.                                                              |

A **governed retriever** is just a call to `GET /api/claims/:scopeId` that:

- filters claims by a `confidence` threshold,
- optionally drops claims whose subject appears in an open contradiction,
- optionally gates on `finality.state` (only trust a scope once it is
  `near-final` or `resolved`).

### Swarm-participant pattern

| Method / subscription                                | Purpose                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/claims`                                   | Contribute a claim back into a scope (`{ scope_id, text, source, confidence, dimension?, round? }`). |
| `events.onVetoActivated(tenant, handler)`            | **Critical path** — halt all local work when the kernel vetoes a scope.                              |
| `events.onScope(tenant, scopeId, handler)`           | React to claims added, contradictions detected, finality changes, etc.                               |
| `events.joinQueue(tenant, taskType, handler, group)` | Receive tasks distributed to exactly one worker in a queue group.                                    |
| `GET /api/agents`                                    | Inspect the registry of internal and external agents.                                                |

Swarm agents identify with a **role** (`extractor`, `comparator`, `arbiter`,
`proposer`, `reviewer`, `planner`, `resolver`, `status`, `tuner`) and a **kind**
(`internal` for kernel agents, `external` for the agents you build with these
frameworks).

---

## Governance rules every integration should follow

1. **Always honor the veto.** Subscribe to `onVetoActivated` and stop producing
   claims / tool output for the affected scope until `onVetoLifted`. Configure
   `onHandlerError` so a veto handler failure still triggers your fallback halt.
2. **Carry confidence, don't fabricate it.** When you contribute a claim,
   report a calibrated `confidence` in `[0, 1]`. The kernel uses it for drift
   and convergence math.
3. **Respect tenant isolation.** Never send a claim or read a scope for a
   tenant you weren't asked to act on. The event transport rejects cross-tenant
   subjects, and the REST API scopes every row by `X-Tenant-ID`.
4. **Treat ingest as asynchronous.** `POST /api/ingest` returns `202 Accepted`;
   claims typically appear 30–90s later. Poll `GET /api/claims/:scopeId` or
   subscribe to `scope.claim.added` events instead of blocking.

See [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md) for ports and env
vars, and the client READMEs in
[`packages/client-ts`](../../packages/client-ts/README.md) and
[`packages/client-py`](../../packages/client-py/README.md) for the full SDK API.
