# SGRS routing and local dev

Ports, environment variables, and how the Studio (`:3001`), API (`:3003`), proxy routes, and NATS fit together.

## Quickstart

From the repo root (Node 20+, pnpm 9+):

```bash
pnpm install
pnpm dev
```

Turbo starts Studio on **:3001** and the API on the port from your root `.env.local` (set `PORT=3003` so Studio’s proxy matches `NEXT_PUBLIC_BACKEND_API_URL`).

The API dev script loads **`/.env.local`** via `apps/api` (`tsx --env-file=../../.env.local`). Studio can use `apps/studio/.env.local` for overrides.

**Supporting services:** this monorepo does not ship `docker-compose`; run Postgres, NATS, and anything else required by `DATABASE_URL` and `NATS_URL` the way your team does (for example the companion swarm kernel repo).

## Port assignments

| Service | Port | Notes |
|--------|------|--------|
| Studio (Next.js) | `3001` | `apps/studio` — browser and `/api/*` proxy routes |
| API (Hono) | `3003` (recommended) | `apps/api` — default without env is `3001`; use `PORT=3003` in root `.env.local` to match Studio proxy defaults |
| NATS | `4222` | Typical local URL `nats://localhost:4222` |
| PostgreSQL | often `5433` | When mapped from Docker to avoid clashing with a local `5432` |

```
┌──────────────────────────────────────────────────────────────────┐
│                    SERVICE PORT LAYOUT                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Browser/Client                                                  │
│       │                                                           │
│       └──→ :3001  ┌─────────────────┐                             │
│               │   │ STUDIO FRONTEND │  (Next.js / React)         │
│               │   │ (apps/studio)   │                             │
│               └─→ └────────┬────────┘                             │
│                            │                                       │
│                    /api/* proxy routes                            │
│                            │                                       │
│                            ├──→ /api/stream/[tenant]              │
│                            │    └──→ NATS (nats://localhost:4222) │
│                            │                                       │
│                            └──→ /api/[...slug]                    │
│                                 └──→ :3003  ┌─────────────────┐   │
│                                         │   │ API BACKEND     │   │
│                                         │   │ (apps/api)      │   │
│                                         └─→ └─────────────────┘   │
│                                                      │              │
│                                    ┌─────────────────┴──────────┐  │
│                            ┌──────▼──────┐           ┌──────────▼─┐│
│                            │  PostgreSQL │           │   DuckDB    ││
│                            │ :5433 ...   │           │  (analytics) ││
│                            └─────────────┘           └─────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

## Service configuration

Templates live in `.env.example` — copy values into **root** `.env.local` and optionally `apps/studio/.env.local`.

### Root (`.env.local`)

```env
# API listen port — must match NEXT_PUBLIC_BACKEND_API_URL
PORT=3003

NATS_URL=nats://localhost:4222
DATABASE_URL=postgresql://...

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003
```

### Studio (`apps/studio/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003
NATS_URL=nats://localhost:4222
```

## Request flow

### Browser → Studio proxy → API

```
Browser (:3001)
  → fetch("/api/…") relative to Studio
Studio `app/api/[...slug]/route.ts` (and `app/api/scopes/route.ts`)
  → forwards to NEXT_PUBLIC_BACKEND_API_URL (e.g. :3003)
API
  → JSON response
```

**Code:**

- `apps/studio/lib/api-client.ts` — default base URL `NEXT_PUBLIC_API_URL` → Studio’s own origin (same-origin `/api` proxy).
- `apps/studio/app/api/[...slug]/route.ts` — catch-all proxy to the backend.
- `apps/studio/app/api/scopes/route.ts` — scopes proxy (same backend base URL).

### Real-time events (SSE + NATS)

```
Browser
  → GET /api/stream/[tenant]
Studio `app/api/stream/[tenant]/route.ts`
  → subscribes using NATS_URL
NATS
  → streamed as SSE to the browser
```

### Backend dependencies

```
apps/api (:3003)
  → DATABASE_URL (Postgres / PGlite per config)
  → DuckDB analytics
  → optional NATS_URL for publishing and event wiring
```

`apps/api/src/index.ts`: `PORT` from env, default **`3001`** — set **`PORT=3003`** locally so it matches the Studio proxy.

## Environment variable map

| Variable | Used by | Purpose |
|----------|---------|---------|
| `PORT` | API | HTTP listen port |
| `NEXT_PUBLIC_API_URL` | Studio client | Base URL for API calls (usually Studio origin) |
| `NEXT_PUBLIC_BACKEND_API_URL` | Studio route handlers | Where `/api/*` proxies forward |
| `NATS_URL` | Studio SSE route, API | Event broker |
| `DATABASE_URL` | API | Primary SQL store |

## Consistency checklist (local)

- [ ] Root `.env.local`: `PORT=3003` and `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003`
- [ ] Studio: `next dev --port 3001` (`apps/studio/package.json`)
- [ ] `NEXT_PUBLIC_API_URL=http://localhost:3001` so the client hits the proxy, not the API origin directly (unless you intentionally bypass the proxy)

## Running apps individually

```bash
pnpm --filter @sgrs/studio dev
pnpm --filter @sgrs/api dev
```

## Common issues

| Symptom | What to check |
|---------|----------------|
| Backend unreachable / 503 from proxy | API listening? `curl -sS http://localhost:3003/api/health` (or your `PORT`) |
| Wrong port / ECONNREFUSED | `lsof -i :3001` and `lsof -i :3003` — Studio vs API must differ |
| No graph / no domain data | API up, DB reachable, tenant header matches seeded data |
| SSE never opens | NATS running; `NATS_URL` set where the stream route runs |
| Stream returns JSON `NATS_DISABLED` | `NATS_URL` unset — stream route deliberately refuses upgrade |

## Key files

- `/.env.local` — API port, DB, NATS, public URLs consumed at build/run time
- `apps/studio/.env.local` — Studio-only overrides
- `apps/studio/app/api/[...slug]/route.ts` — generic backend proxy
- `apps/studio/app/api/scopes/route.ts` — scopes proxy
- `apps/api/src/index.ts` — API bootstrap (port, NATS, DB)

## Debugging

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/
curl -sS http://localhost:3003/api/health
```

In the browser DevTools Network tab, `/api/*` from the Studio origin should succeed when the API and env vars match.
