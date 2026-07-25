# SGRS + Agentica

[Agentica](https://wrtnlabs.io/agentica/) is a TypeScript AI framework
specialized in **function calling**. It turns TypeScript classes, Swagger/OpenAPI
documents, and MCP servers into callable functions for an LLM. This guide
integrates SGRS as a **governed retriever** (a TypeScript controller) and as a
**swarm participant** worker, using [`@sgrs/client-ts`](../../packages/client-ts/README.md).

## Install

```bash
npm install @agentica/core @samchon/openapi typia openai @sgrs/client-ts
# real-time swarm events also need the NATS driver:
npm install nats
```

> Agentica uses `typia` for compile-time schema generation. Follow the
> [Agentica setup guide](https://wrtnlabs.io/agentica/docs/setup/) to enable the
> `typia` transformer (via `ts-patch` or `@ryoppippi/unplugin-typia`) so
> `typia.llm.controller<T>()` works.

Shared SGRS config:

```ts
// src/sgrs/config.ts
import { createClient } from "@sgrs/client-ts";

export const TENANT = process.env.SGRS_TENANT ?? "acme";
export const BASE_URL = process.env.SGRS_BASE_URL ?? "http://localhost:3003";
const API_KEY = process.env.SGRS_API_KEY;

export const sgrs = createClient({
  baseUrl: BASE_URL,
  tenantId: TENANT,
  apiKey: API_KEY,
  ...(process.env.SGRS_NATS && { nats: { servers: process.env.SGRS_NATS } }),
});

// Headers for the raw OpenAPI HTTP controller (see the ingest section below),
// which talks to the API directly rather than through the typed client.
export function sgrsHeaders(): Record<string, string> {
  const h: Record<string, string> = { "X-Tenant-ID": TENANT };
  if (API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  return h;
}
```

---

## 1. SGRS as a retriever

The public retrieval endpoints (`/api/claims`, `/api/contradictions`,
`/api/finality`) are best exposed as a **TypeScript class controller** so
Agentica can call them as functions. The class also holds the governance
filtering logic (confidence threshold + contradiction filtering).

```ts
// src/sgrs/SgrsRetriever.ts
import { sgrs } from "./config";

interface Claim {
  text: string;
  source: string;
  confidence: number;
}

export class SgrsRetriever {
  /**
   * Retrieve governed, contradiction-free claims from an SGRS scope.
   * Only returns claims at or above `minConfidence` whose source is not
   * currently entangled in an open contradiction.
   */
  async getGovernedClaims(props: {
    scopeId: string;
    minConfidence?: number;
  }): Promise<Claim[]> {
    const minConfidence = props.minConfidence ?? 0.6;

    const [claimsRes, contraRes] = await Promise.all([
      sgrs.claims.list(props.scopeId),
      sgrs.contradictions.list(props.scopeId),
    ]);
    const claims = claimsRes.ok ? (claimsRes.data ?? []) : [];

    const contradicted = new Set<string>();
    if (contraRes.ok) {
      for (const c of contraRes.data ?? []) {
        if (c.status === "open") {
          contradicted.add(c.source_a);
          contradicted.add(c.source_b);
        }
      }
    }

    return claims
      .filter((c) => c.confidence >= minConfidence && !contradicted.has(c.source))
      .map((c) => ({ text: c.text, source: c.source, confidence: c.confidence }));
  }

  /** Convergence status of a scope: is its knowledge stable yet? */
  async getFinality(props: { scopeId: string }): Promise<unknown> {
    const res = await sgrs.finality.status(props.scopeId);
    return res.ok ? res.data : { state: "unknown" };
  }
}
```

Register it as a controller so the agent can call it while answering:

```ts
// src/agent.ts
import { Agentica } from "@agentica/core";
import OpenAI from "openai";
import typia from "typia";
import { SgrsRetriever } from "./sgrs/SgrsRetriever";

export const agent = new Agentica({
  model: "chatgpt",
  vendor: {
    api: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    model: "gpt-4o-mini",
  },
  controllers: [
    typia.llm.controller<SgrsRetriever, "chatgpt">("sgrs", new SgrsRetriever()),
  ],
});

// Usage:
// const replies = await agent.conversate(
//   "Using governed claims, summarize the acme-q4 deal (scopeId=acme-q4) and cite sources.",
// );
```

Agentica's **validation feedback** ensures the model calls `getGovernedClaims`
with a well-typed `{ scopeId, minConfidence }` argument, retrying automatically
if it produces a malformed call.

### Alternative: ingest via the OpenAPI document

SGRS ships an OpenAPI 3.1 contract (`packages/api-schema/openapi.json`) that
documents the ingest surface. You can hand it straight to Agentica so the agent
can queue documents into a scope through function calling:

```ts
import { assertHttpController } from "@agentica/core";
import openapi from "@sgrs/api-schema/openapi.json" with { type: "json" };
import { BASE_URL, sgrsHeaders } from "./sgrs/config";

const ingestController = assertHttpController({
  name: "sgrs-http",
  model: "chatgpt",
  document: openapi, // documents POST /api/ingest, etc.
  connection: { host: BASE_URL, headers: sgrsHeaders() },
});
// add `ingestController` to the `controllers` array above
```

> For programmatic ingestion outside function calling, the SDK also exposes
> `await sgrs.ingest.document({ scope_id, name, type: "txt", text })` directly.
>
> The bundled OpenAPI document currently describes `/api/ingest` plus the
> `/admin/*` and `/internals/*` surfaces. The public read routes
> (`/api/claims`, `/api/contradictions`, `/api/finality`) are best exposed via
> the `SgrsRetriever` class controller shown above, which is why we combine both
> approaches. After ingesting, remember that claims appear asynchronously
> (~30–90s) — the agent should re-query `getGovernedClaims` rather than expect
> them immediately.

---

## 2. SGRS as a swarm participant

Agentica is a conversation/function-calling engine, so to act as a long-running
**external** swarm worker we wrap it with the `@sgrs/client-ts` NATS transport:
consume tasks from a queue group, run the Agentica agent to produce a finding,
publish it as a claim, and halt on veto.

Reuse the shared `sgrs` client from `config.ts` — set `SGRS_NATS` so its NATS
transport (and therefore `sgrs.events`) is active.

```ts
// src/swarm/worker.ts
import { agent } from "../agent";
import { sgrs, TENANT } from "../sgrs/config";

const vetoed = new Set<string>();

async function main() {
  await sgrs.connect();

  // CRITICAL PATH: halt work on a scope the instant it is vetoed.
  sgrs.events.onVetoActivated(TENANT, (ev) => {
    vetoed.add(ev.scopeId);
  });
  sgrs.events.onVetoLifted(TENANT, (ev) => {
    vetoed.delete(ev.scopeId);
  });

  // The swarm delivers each "propose" task to exactly one worker in the group.
  sgrs.events.joinQueue<{ scope_id: string; prompt: string }>(
    TENANT,
    "propose",
    async (task) => {
      if (vetoed.has(task.scope_id)) return; // governance says stop
      const replies = await agent.conversate(task.prompt);
      const text = replies
        .filter((r) => r.type === "assistantMessage")
        .map((r) => r.text)
        .join("\n");
      // Contribute the finding back into the scope via the SDK.
      await sgrs.claims.create({
        scope_id: task.scope_id,
        text,
        source: "agentica-proposer", // this agent's identity
        confidence: 0.72,
        dimension: "claim_confidence",
      });
    },
    "agentica-proposers",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Key points:

- **Identity.** Set `source` to a stable agent id (`agentica-proposer`); it is
  what surfaces in contradictions and `GET /api/agents`.
- **Veto is critical.** Subscribe to veto events before `joinQueue`, and set
  `nats.onHandlerError` in the client config so a failing veto handler still
  triggers your fallback halt.
- **Compiler-driven safety.** Because Agentica derives function schemas from
  your TypeScript types, the retriever and any tool you expose stay in sync with
  their implementations — no hand-written JSON schema to drift.

---

## Where to go next

- Full client API (events, finality, ingest): [`packages/client-ts/README.md`](../../packages/client-ts/README.md)
- Shared concepts and endpoint table: [integrations README](./README.md)
- Ports and env vars: [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md)
