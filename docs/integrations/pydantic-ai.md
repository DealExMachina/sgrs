# SGRS + Pydantic AI

[Pydantic AI](https://ai.pydantic.dev/) builds type-safe agents with
dependency injection via `RunContext` and tools registered with `@agent.tool`.
This guide integrates SGRS as a **governed retriever tool** and as a **swarm
participant** worker.

## Install

```bash
pip install pydantic-ai sgrs-client httpx
# real-time swarm events:
pip install "sgrs-client[nats]"
```

Define a dependencies dataclass so the SGRS connection is injected (no globals):

```python
import os
from dataclasses import dataclass
import httpx

@dataclass
class SgrsDeps:
    http: httpx.AsyncClient        # pre-configured with base_url + headers
    tenant: str

def make_http() -> httpx.AsyncClient:
    headers = {"X-Tenant-ID": os.environ.get("SGRS_TENANT", "acme")}
    if os.environ.get("SGRS_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['SGRS_API_KEY']}"
    return httpx.AsyncClient(
        base_url=os.environ.get("SGRS_BASE_URL", "http://localhost:3003"),
        headers=headers,
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
    claims_res = await ctx.deps.http.get(f"/api/claims/{scope_id}")
    claims_res.raise_for_status()
    claims = claims_res.json()

    contra_res = await ctx.deps.http.get(f"/api/contradictions/{scope_id}")
    contradicted: set[str] = set()
    if contra_res.status_code == 200:
        for c in contra_res.json():
            if c.get("status") == "open":
                contradicted.update({c.get("source_a"), c.get("source_b")})

    vetted = [
        c for c in claims
        if c["confidence"] >= min_confidence and c["source"] not in contradicted
    ]
    if not vetted:
        return "No governed claims above the confidence threshold yet."
    return "\n".join(
        f"- ({c['confidence']:.2f}) {c['text']}  [source: {c['source']}]"
        for c in vetted
    )
```

Run the agent, injecting the SGRS dependency at call time:

```python
import asyncio

async def main():
    async with make_http() as http:
        deps = SgrsDeps(http=http, tenant=os.environ.get("SGRS_TENANT", "acme"))
        result = await agent.run(
            "Summarize what we know about the acme-q4 deal. scope_id=acme-q4",
            deps=deps,
        )
        print(result.output)

asyncio.run(main())
```

**Optional: ingest first.** Add a second tool (or a plain helper) that posts to
`/api/ingest` when a scope is empty; claims appear asynchronously (30–90s):

```python
@agent.tool
async def sgrs_ingest(ctx: RunContext[SgrsDeps], scope_id: str, name: str, text: str) -> str:
    """Queue a document into an SGRS scope for governance."""
    res = await ctx.deps.http.post("/api/ingest", json={
        "scope_id": scope_id, "name": name, "type": "txt", "text": text,
    })
    res.raise_for_status()
    return "Queued. Claims will appear once the swarm processes the document."
```

Gate on convergence when you need stability guarantees: only trust a scope after
`GET /api/finality/{scope_id}` returns `state` `near-final` or `resolved`.

---

## 2. SGRS as a swarm participant

The Pydantic AI agent joins the swarm as an **external** worker. It processes
tasks from a NATS queue group, publishes its reviewed output as claims, and
halts on veto.

```python
import asyncio
from sgrs_client import create_client, NatsConfig

TENANT = os.environ.get("SGRS_TENANT", "acme")
vetoed: set[str] = set()

client = create_client(
    base_url=os.environ.get("SGRS_BASE_URL", "http://localhost:3003"),
    api_key=os.environ.get("SGRS_API_KEY"),
    nats=NatsConfig(servers=os.environ.get("SGRS_NATS", "nats://localhost:4222")),
)

async def publish_claim(http: httpx.AsyncClient, scope_id: str, text: str, confidence: float):
    await http.post("/api/claims", json={
        "scope_id": scope_id,
        "text": text,
        "source": "pydantic-ai-proposer",   # this agent's identity
        "confidence": confidence,
        "dimension": "claim_confidence",
    })

async def main():
    async with make_http() as http:
        deps = SgrsDeps(http=http, tenant=TENANT)
        await client.connect()

        # CRITICAL PATH: honor the governance veto.
        await client.events.on_veto_activated(TENANT, lambda ev, s: vetoed.add(ev.scope_id))
        await client.events.on_veto_lifted(TENANT, lambda ev, s: vetoed.discard(ev.scope_id))

        async def handle_task(task: dict, reply: str | None):
            scope_id = task["scope_id"]
            if scope_id in vetoed:
                return  # governance says stop
            result = await agent.run(task["prompt"], deps=deps)
            await publish_claim(http, scope_id, result.output, confidence=0.72)

        # The swarm delivers each "propose" task to exactly one worker in the group.
        await client.events.join_queue(TENANT, "propose", handle_task, group="pydantic-proposers")

        try:
            await asyncio.Event().wait()
        finally:
            await client.close()

asyncio.run(main())
```

Key points:

- **Typed deps everywhere.** The same `SgrsDeps` powers both the retriever tool
  and the worker, so there is one place that owns the SGRS connection.
- **Veto first.** Register the veto handlers before joining the queue, and set
  `on_handler_error` on `NatsConfig` so a veto-handler failure still halts you.
- **Confidence is data.** Report a calibrated `confidence` on every claim; the
  kernel uses it for drift and convergence scoring.

---

## Where to go next

- Full REST + events reference: [`packages/client-py/README.md`](../../packages/client-py/README.md)
- Shared concepts and endpoint table: [integrations README](./README.md)
- Ports and env vars: [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md)
