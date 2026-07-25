# SGRS + Pydantic AI

[Pydantic AI](https://ai.pydantic.dev/) builds type-safe agents with
dependency injection via `RunContext` and tools registered with `@agent.tool`.
This guide integrates SGRS as a **governed retriever tool** and as a **swarm
participant** worker.

## Install

```bash
pip install pydantic-ai sgrs-client
# real-time swarm events:
pip install "sgrs-client[nats]"
```

Define a dependencies dataclass that injects the SGRS **client** (no globals).
Pass `tenant_id` — the SDK sends it as `X-Tenant-ID` automatically:

```python
import os
from dataclasses import dataclass
from sgrs_client import Client, create_client

@dataclass
class SgrsDeps:
    client: Client
    tenant: str

def make_client() -> Client:
    return create_client(
        base_url=os.environ.get("SGRS_BASE_URL", "http://localhost:3003"),
        tenant_id=os.environ.get("SGRS_TENANT", "acme"),
        api_key=os.environ.get("SGRS_API_KEY"),  # optional
    )
```

---

## 1. SGRS as a retriever

Register a tool that returns governed, contradiction-free claims. Because the
tool takes `RunContext[SgrsDeps]`, it gets a fully typed, injected SGRS client.

```python
from pydantic_ai import Agent, RunContext

agent = Agent(
    "openai:gpt-4o-mini",
    deps_type=SgrsDeps,
    instructions=(
        "You answer strictly from governed SGRS claims. Call sgrs_retriever "
        "with the relevant scope_id, then cite the source of each claim you use. "
        "If no claims are returned, say the scope has not converged yet."
    ),
)

@agent.tool
async def sgrs_retriever(
    ctx: RunContext[SgrsDeps],
    scope_id: str,
    min_confidence: float = 0.6,
) -> str:
    """Retrieve governed, contradiction-free claims from an SGRS scope."""
    sgrs = ctx.deps.client
    claims_res = await sgrs.list_claims(scope_id)
    contra_res = await sgrs.list_contradictions(scope_id)
    claims = claims_res.data if claims_res.ok else []

    contradicted: set[str] = set()
    if contra_res.ok:
        for c in contra_res.data:
            if c.status == "open":
                contradicted.update({c.source_a, c.source_b})

    vetted = [
        c for c in claims
        if c.confidence >= min_confidence and c.source not in contradicted
    ]
    if not vetted:
        return "No governed claims above the confidence threshold yet."
    return "\n".join(
        f"- ({c.confidence:.2f}) {c.text}  [source: {c.source}]"
        for c in vetted
    )
```

`list_claims` / `list_contradictions` return an `ApiResponse` with `.ok` and
`.data` (typed `Claim` / `Contradiction` models).

Run the agent, injecting the SGRS dependency at call time (the client is an
async context manager):

```python
import asyncio

async def main():
    async with make_client() as sgrs:
        deps = SgrsDeps(client=sgrs, tenant=os.environ.get("SGRS_TENANT", "acme"))
        result = await agent.run(
            "Summarize what we know about the acme-q4 deal. scope_id=acme-q4",
            deps=deps,
        )
        print(result.output)

asyncio.run(main())
```

**Optional: ingest first.** Add a second tool (or a plain helper) that ingests a
document when a scope is empty; claims appear asynchronously (30–90s):

```python
from sgrs_client import IngestDocumentRequest

@agent.tool
async def sgrs_ingest(ctx: RunContext[SgrsDeps], scope_id: str, name: str, text: str) -> str:
    """Queue a document into an SGRS scope for governance."""
    await ctx.deps.client.ingest_document(
        IngestDocumentRequest(scope_id=scope_id, name=name, type="txt", text=text)
    )
    return "Queued. Claims will appear once the swarm processes the document."
```

Gate on convergence when you need stability guarantees: only trust a scope after
`client.get_finality_status(scope_id)` returns `state` `near-final` or
`resolved`.

---

## 2. SGRS as a swarm participant

The Pydantic AI agent joins the swarm as an **external** worker. It processes
tasks from a NATS queue group, publishes its reviewed output as claims, and
halts on veto.

Build the client with a `nats` config so `client.events` is active. Contribute
the agent's reviewed output back into the scope with `client.create_claim`.

```python
import asyncio
from sgrs_client import create_client, NatsConfig

TENANT = os.environ.get("SGRS_TENANT", "acme")
vetoed: set[str] = set()

client = create_client(
    base_url=os.environ.get("SGRS_BASE_URL", "http://localhost:3003"),
    tenant_id=TENANT,
    api_key=os.environ.get("SGRS_API_KEY"),
    nats=NatsConfig(servers=os.environ.get("SGRS_NATS", "nats://localhost:4222")),
)

async def main():
    deps = SgrsDeps(client=client, tenant=TENANT)
    await client.connect()

    # CRITICAL PATH: honor the governance veto.
    await client.events.on_veto_activated(TENANT, lambda ev, s: vetoed.add(ev.scope_id))
    await client.events.on_veto_lifted(TENANT, lambda ev, s: vetoed.discard(ev.scope_id))

    async def handle_task(task: dict, reply: str | None):
        scope_id = task["scope_id"]
        if scope_id in vetoed:
            return  # governance says stop
        result = await agent.run(task["prompt"], deps=deps)
        await client.create_claim(
            scope_id=scope_id,
            text=result.output,
            source="pydantic-ai-proposer",   # this agent's identity
            confidence=0.72,
            dimension="claim_confidence",
        )

    # The swarm delivers each "propose" task to exactly one worker in the group.
    await client.events.join_queue(TENANT, "propose", handle_task, group="pydantic-proposers")

    try:
        await asyncio.Event().wait()
    finally:
        await client.close()

asyncio.run(main())
```

Key points:

- **Typed deps everywhere.** The same `SgrsDeps` (carrying the SGRS client)
  powers both the retriever tool and the worker, so there is one place that owns
  the SGRS connection.
- **Veto first.** Register the veto handlers before joining the queue, and set
  `on_handler_error` on `NatsConfig` so a veto-handler failure still halts you.
- **Confidence is data.** Report a calibrated `confidence` on every claim; the
  kernel uses it for drift and convergence scoring.

---

## Where to go next

- Full REST + events reference: [`packages/client-py/README.md`](../../packages/client-py/README.md)
- Shared concepts and endpoint table: [integrations README](./README.md)
- Ports and env vars: [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md)
