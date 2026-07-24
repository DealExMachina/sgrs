# SGRS + Mastra

[Mastra](https://mastra.ai/) is a TypeScript agent framework. Tools are created
with `createTool` and attached to an `Agent`. This guide integrates SGRS as a
**governed retriever tool** and as a **swarm participant** worker, using the
official [`@sgrs/client-ts`](../../packages/client-ts/README.md) client.

## Install

```bash
npm install @mastra/core @sgrs/client-ts zod
# real-time swarm events also need the NATS driver:
npm install nats
```

Create one shared SGRS client. `@sgrs/client-ts` covers ingest, finality,
scopes, and NATS events; for claims and contradictions we call the REST
endpoints directly with `fetch` (they are not yet wrapped by the SDK).

```ts
// src/sgrs/client.ts
import { createClient } from "@sgrs/client-ts";

export const TENANT = process.env.SGRS_TENANT ?? "acme";
export const BASE_URL = process.env.SGRS_BASE_URL ?? "http://localhost:3003";
const API_KEY = process.env.SGRS_API_KEY;

export const sgrs = createClient({
  baseUrl: BASE_URL,
  tenantId: TENANT,
  apiKey: API_KEY,
  ...(process.env.SGRS_NATS && {
    nats: { servers: process.env.SGRS_NATS },
  }),
});

export function sgrsHeaders(): Record<string, string> {
  const h: Record<string, string> = { "X-Tenant-ID": TENANT };
  if (API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  return h;
}

export interface Claim {
  id: string;
  scope_id: string;
  text: string;
  source: string;
  confidence: number;
  dimension?: string;
  round: number;
  created_at: string;
}
```

---

## 1. SGRS as a retriever

Define a Mastra tool that fetches governed claims and drops any claim caught in
an open contradiction. Attach it to an agent so the model can call it.

```ts
// src/mastra/tools/sgrs-retriever.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { BASE_URL, sgrsHeaders, type Claim } from "../../sgrs/client";

export const sgrsRetrieverTool = createTool({
  id: "sgrs-retriever",
  description:
    "Retrieve governed, contradiction-free claims from an SGRS scope. Use this " +
    "instead of a plain document search when you need facts the governance " +
    "swarm has vetted. Returns claims with confidence and source.",
  inputSchema: z.object({
    scopeId: z.string().describe("The SGRS scope id, e.g. acme-q4"),
    minConfidence: z.number().min(0).max(1).default(0.6),
  }),
  outputSchema: z.object({
    claims: z.array(
      z.object({
        text: z.string(),
        source: z.string(),
        confidence: z.number(),
      }),
    ),
  }),
  execute: async ({ scopeId, minConfidence }) => {
    const headers = sgrsHeaders();
    const [claimsRes, contraRes] = await Promise.all([
      fetch(`${BASE_URL}/api/claims/${scopeId}`, { headers }),
      fetch(`${BASE_URL}/api/contradictions/${scopeId}`, { headers }),
    ]);
    const claims: Claim[] = claimsRes.ok ? await claimsRes.json() : [];

    const contradicted = new Set<string>();
    if (contraRes.ok) {
      for (const c of (await contraRes.json()) as Array<Record<string, string>>) {
        if (c.status === "open") {
          contradicted.add(c.source_a);
          contradicted.add(c.source_b);
        }
      }
    }

    return {
      claims: claims
        .filter((c) => c.confidence >= minConfidence && !contradicted.has(c.source))
        .map((c) => ({ text: c.text, source: c.source, confidence: c.confidence })),
    };
  },
});
```

```ts
// src/mastra/agents/analyst.ts
import { Agent } from "@mastra/core/agent";
import { sgrsRetrieverTool } from "../tools/sgrs-retriever";

export const analystAgent = new Agent({
  id: "sgrs-analyst",
  name: "SGRS Analyst",
  model: "openai/gpt-4o-mini",
  instructions:
    "You answer using only governed claims retrieved from SGRS. Call the " +
    "sgrs-retriever tool with the relevant scopeId before answering, and cite " +
    "the source of each claim. If no claims are returned, say the scope has " +
    "not converged yet.",
  tools: { sgrsRetrieverTool },
});

// Usage:
// const res = await analystAgent.generate(
//   "What do we know about the acme-q4 deal? scopeId=acme-q4"
// );
// console.log(res.text);
```

**Optional: ingest first.** Use the client to queue a document when a scope is
empty (claims appear asynchronously, ~30–90s later):

```ts
await sgrs.ingest.document({
  scope_id: "acme-q4",
  name: "Q4 memo",
  type: "txt",
  text: "…document text…",
});
```

For stability guarantees, gate on convergence with
`await sgrs.finality.status(scopeId)` and only trust `state` of `near-final` or
`resolved`.

---

## 2. SGRS as a swarm participant

The Mastra agent joins the swarm as an **external** worker: it consumes tasks
from a NATS queue group, publishes reviewed output as claims, and halts on veto.

```ts
// src/swarm/worker.ts
import { analystAgent } from "../mastra/agents/analyst";
import { sgrs, TENANT, BASE_URL, sgrsHeaders } from "../sgrs/client";

const vetoed = new Set<string>();

async function publishClaim(scopeId: string, text: string, confidence: number) {
  await fetch(`${BASE_URL}/api/claims`, {
    method: "POST",
    headers: { ...sgrsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      scope_id: scopeId,
      text,
      source: "mastra-reviewer", // this agent's identity
      confidence,
      dimension: "claim_confidence",
    }),
  });
}

async function main() {
  await sgrs.connect();

  // CRITICAL PATH: halt work on a scope the instant it is vetoed.
  sgrs.events.onVetoActivated(TENANT, (ev) => {
    vetoed.add(ev.scopeId);
  });
  sgrs.events.onVetoLifted(TENANT, (ev) => {
    vetoed.delete(ev.scopeId);
  });

  // The swarm delivers each "review" task to exactly one worker in the group.
  sgrs.events.joinQueue<{ scope_id: string; prompt: string }>(
    TENANT,
    "review",
    async (task) => {
      if (vetoed.has(task.scope_id)) return; // governance says stop
      const res = await analystAgent.generate(task.prompt);
      await publishClaim(task.scope_id, res.text, 0.72);
    },
    "mastra-reviewers",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Key points:

- **Identity.** Set `source` on every claim to a stable id (`mastra-reviewer`);
  it is what appears in contradictions and `GET /api/agents`.
- **Veto is critical.** Register the veto subscriptions before `joinQueue`, and
  pass `nats.onHandlerError` in the client config so a veto-handler failure
  still triggers your fallback halt.
- **Scale out.** Run multiple worker processes with the same queue group name to
  load-balance tasks across replicas.

---

## Where to go next

- Full client API (events, finality, ingest): [`packages/client-ts/README.md`](../../packages/client-ts/README.md)
- Shared concepts and endpoint table: [integrations README](./README.md)
- Ports and env vars: [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md)
