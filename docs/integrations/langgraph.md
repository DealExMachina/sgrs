# SGRS + LangGraph

[LangGraph](https://langchain-ai.github.io/langgraph/) builds agents as stateful
graphs. This guide wires SGRS into a LangGraph agent in two ways: as a
**governed retriever tool** and as a **swarm participant** node.

## Install

```bash
pip install langgraph langchain-core langchain-openai sgrs-client httpx
# real-time swarm events:
pip install "sgrs-client[nats]"
```

Set the connection details once:

```python
import os

SGRS_BASE_URL = os.environ.get("SGRS_BASE_URL", "http://localhost:3003")
SGRS_TENANT = os.environ.get("SGRS_TENANT", "acme")
SGRS_API_KEY = os.environ.get("SGRS_API_KEY")  # optional

def sgrs_headers() -> dict[str, str]:
    headers = {"X-Tenant-ID": SGRS_TENANT}
    if SGRS_API_KEY:
        headers["Authorization"] = f"Bearer {SGRS_API_KEY}"
    return headers
```

---

## 1. SGRS as a retriever

The retriever queries governed claims for a scope and returns only high-confidence
facts, skipping any claim entangled in an open contradiction. Expose it as a
LangGraph/LangChain tool so the model can call it while reasoning.

```python
import asyncio
import httpx
from langchain_core.tools import tool

async def fetch_governed_claims(scope_id: str, min_confidence: float = 0.6) -> list[dict]:
    async with httpx.AsyncClient(base_url=SGRS_BASE_URL, headers=sgrs_headers()) as http:
        claims_res, contra_res = await asyncio.gather(
            http.get(f"/api/claims/{scope_id}"),
            http.get(f"/api/contradictions/{scope_id}"),
        )
    claims_res.raise_for_status()
    claims = claims_res.json()

    # Drop claims whose source is currently contradicted.
    contradicted_sources: set[str] = set()
    if contra_res.status_code == 200:
        for c in contra_res.json():
            if c.get("status") == "open":
                contradicted_sources.update({c.get("source_a"), c.get("source_b")})

    return [
        claim
        for claim in claims
        if claim["confidence"] >= min_confidence
        and claim["source"] not in contradicted_sources
    ]


@tool
async def sgrs_retriever(scope_id: str, min_confidence: float = 0.6) -> str:
    """Retrieve governed, contradiction-free claims from an SGRS scope.

    Use this instead of a plain document search when you need facts that the
    governance swarm has vetted. Returns claims with their confidence and source.
    """
    claims = await fetch_governed_claims(scope_id, min_confidence)
    if not claims:
        return "No governed claims above the confidence threshold yet."
    return "\n".join(
        f"- ({c['confidence']:.2f}) {c['text']}  [source: {c['source']}]"
        for c in claims
    )
```

Bind the tool to a model and drop it into a LangGraph `ReAct`-style agent:

```python
import asyncio
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

agent = create_react_agent(
    model=ChatOpenAI(model="gpt-4o-mini"),
    tools=[sgrs_retriever],
    prompt=(
        "You answer questions using only governed claims retrieved from SGRS. "
        "Call sgrs_retriever with the relevant scope_id before answering, and "
        "cite the source of each claim you rely on."
    ),
)

async def main():
    result = await agent.ainvoke(
        {"messages": [("user", "What do we know about the acme-q4 deal? scope_id=acme-q4")]}
    )
    print(result["messages"][-1].content)

asyncio.run(main())
```

**Optional: feed the scope first.** If the scope has no claims yet, ingest a
document and let the swarm populate it (claims appear asynchronously, usually in
30–90s):

```python
async def ingest(scope_id: str, name: str, text: str) -> None:
    async with httpx.AsyncClient(base_url=SGRS_BASE_URL, headers=sgrs_headers()) as http:
        res = await http.post("/api/ingest", json={
            "scope_id": scope_id, "name": name, "type": "txt", "text": text,
        })
        res.raise_for_status()  # 202 Accepted
```

**Why "governed"?** Unlike a vector-store retriever that returns whatever is
semantically nearest, `sgrs_retriever` only surfaces claims the swarm has scored
and cross-checked. You can tighten it further by gating on finality — only trust
the scope once `GET /api/finality/{scope_id}` reports `state` of `near-final` or
`resolved`.

---

## 2. SGRS as a swarm participant

Here the LangGraph agent joins the swarm as an **external** worker. It listens
for tasks on a NATS queue group, runs its graph, contributes claims back into the
scope, and — most importantly — halts the moment the kernel vetoes the scope.

```python
import asyncio
import contextlib
import httpx
from sgrs_client import create_client, NatsConfig

TENANT = SGRS_TENANT
vetoed_scopes: set[str] = set()

client = create_client(
    base_url=SGRS_BASE_URL,
    api_key=SGRS_API_KEY,
    nats=NatsConfig(servers=os.environ.get("SGRS_NATS", "nats://localhost:4222")),
)

async def publish_claim(scope_id: str, text: str, confidence: float) -> None:
    async with httpx.AsyncClient(base_url=SGRS_BASE_URL, headers=sgrs_headers()) as http:
        await http.post("/api/claims", json={
            "scope_id": scope_id,
            "text": text,
            "source": "langgraph-reviewer",   # this agent's identity
            "confidence": confidence,
            "dimension": "claim_confidence",
        })

async def handle_task(task: dict, reply: str | None) -> None:
    scope_id = task["scope_id"]
    if scope_id in vetoed_scopes:
        return  # governance says stop — do nothing

    # Run your LangGraph agent to produce a reviewed finding.
    result = await agent.ainvoke({"messages": [("user", task["prompt"])]})
    finding = result["messages"][-1].content
    await publish_claim(scope_id, finding, confidence=0.72)

async def main():
    await client.connect()

    # CRITICAL PATH: stop working on a scope the instant it is vetoed.
    await client.events.on_veto_activated(TENANT, lambda ev, subj: vetoed_scopes.add(ev.scope_id))
    await client.events.on_veto_lifted(TENANT, lambda ev, subj: vetoed_scopes.discard(ev.scope_id))

    # Join a queue group: the swarm delivers each "review" task to one worker.
    await client.events.join_queue(TENANT, "review", handle_task, group="langgraph-reviewers")

    try:
        await asyncio.Event().wait()  # run until cancelled
    finally:
        await client.close()

asyncio.run(main())
```

Key points:

- **Identity.** Set `source` on every claim to a stable agent id (here
  `langgraph-reviewer`). This is what shows up in contradictions and the agent
  registry (`GET /api/agents`).
- **Veto is non-negotiable.** The veto handler must be cheap and reliable. Pass
  `on_handler_error` in `NatsConfig` so a failing handler still triggers your
  fallback halt logic.
- **Back-pressure.** Queue groups load-balance tasks across every worker sharing
  the same `group` name — run several replicas of this process to scale out.

---

## Where to go next

- Full REST + events reference: [`packages/client-py/README.md`](../../packages/client-py/README.md)
- Shared concepts and endpoint table: [integrations README](./README.md)
- Ports and env vars: [ROUTING_ARCHITECTURE.md](../../ROUTING_ARCHITECTURE.md)
