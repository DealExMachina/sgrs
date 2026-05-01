# SGRS Routing Architecture

## Port Assignments

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
│                                    (talks to)        │              │
│                                                      │              │
│                                    ┌─────────────────┴──────────┐  │
│                                    │                            │  │
│                            ┌──────▼──────┐           ┌──────────▼─┐│
│                            │  PostgreSQL  │           │   DuckDB   ││
│                            │ :5433        │           │  (in-mem)  ││
│                            └──────────────┘           └────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Service Configuration

### Root Directory (`.env.local`)
```env
# API Backend — must match NEXT_PUBLIC_BACKEND_API_URL
PORT=3003                                    # ✓ API listens here
NATS_URL=nats://localhost:4222               # ✓ Real-time events

# Frontend Service Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001    # ✓ Studio frontend
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  # ✓ Matches PORT=3003
```

### Studio App (`apps/studio/.env.local`)
```env
# Frontend addresses
NEXT_PUBLIC_API_URL=http://localhost:3001          # Frontend itself
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  # Backend API

# Real-time events
NATS_URL=nats://localhost:4222
```

## Request Flow

### 1. Frontend to Frontend API (Proxied)
```
Browser (localhost:3001)
    ↓ fetch('/api/claims/deal-horizon')
Studio Frontend (Next.js)
    ↓ api-client.ts defaults to http://localhost:3001
Studio API Routes (app/api/[...slug]/route.ts)
    ↓ proxies to NEXT_PUBLIC_BACKEND_API_URL
Backend API (:3003)
```

**Code References:**
- `apps/studio/lib/api-client.ts:63` — defaults to `NEXT_PUBLIC_API_URL` (http://localhost:3001)
- `apps/studio/app/api/[...slug]/route.ts:20` — proxies to `NEXT_PUBLIC_BACKEND_API_URL` (http://localhost:3003)
- `apps/studio/app/api/scopes/route.ts:9` — proxies to `NEXT_PUBLIC_BACKEND_API_URL` (http://localhost:3003)

### 2. Real-Time Events (SSE + NATS)
```
Browser (localhost:3001)
    ↓ fetch('/api/stream/horizon')
Studio Frontend SSE Route (app/api/stream/[tenant]/route.ts)
    ↓ connects to NATS_URL
NATS Server (nats://localhost:4222)
    ↓ streams scope events
Browser (receives SSE data)
```

**Code References:**
- `apps/studio/app/api/stream/[tenant]/route.ts:36,57` — uses `NATS_URL` environment variable

### 3. Backend API Internal Connections
```
Backend API (:3003)
    ↓ connects to
    ├─ PostgreSQL (localhost:5433)
    ├─ DuckDB (in-memory or file)
    └─ NATS (localhost:4222)
```

**Code References:**
- `apps/api/src/index.ts:81` — PORT environment variable (default: 3001, override: 3003)
- `apps/api/src/index.ts:58` — PostgreSQL connection via `DATABASE_URL`
- `apps/api/src/index.ts:64-77` — NATS connection via `NATS_URL`

## Environment Variable Mapping

| Variable | Source | Used By | Value | Purpose |
|----------|--------|---------|-------|---------|
| `PORT` | Root .env.local | API Server | `3003` | Backend API listening port |
| `NEXT_PUBLIC_API_URL` | Root/Studio .env.local | Frontend API Client | `http://localhost:3001` | Frontend's own /api routes (proxies) |
| `NEXT_PUBLIC_BACKEND_API_URL` | Root/Studio .env.local | API Proxy Routes | `http://localhost:3003` | Where proxies forward requests |
| `NATS_URL` | Root/Studio .env.local | Both | `nats://localhost:4222` | Real-time event broker |
| `DATABASE_URL` | Root .env.local | API Server | `postgresql://...` | Primary database |

## Route Consistency Checklist

- [x] **apps/api/src/index.ts** — `PORT=3003` (from root .env.local)
- [x] **apps/studio/package.json** — `next dev --port 3001` (no conflict with 3003)
- [x] **apps/studio/lib/api-client.ts** — defaults to `http://localhost:3001` (studio proxy)
- [x] **apps/studio/app/api/[...slug]/route.ts** — proxies to `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003`
- [x] **apps/studio/app/api/scopes/route.ts** — proxies to `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003`
- [x] **apps/studio/app/api/stream/[tenant]/route.ts** — connects to `NATS_URL`

## Starting Services

```bash
# Terminal 1: Backend API (port 3003)
cd apps/api && npm run dev
# Output: [sgrs][api] Listening on http://localhost:3003

# Terminal 2: Frontend Studio (port 3001)
cd apps/studio && npm run dev
# Output: ▲ Next.js ... - Local: http://localhost:3001

# Terminal 3: Swarm services (docker-compose)
docker-compose up
# Services: PostgreSQL (:5433), NATS (:4222), MinIO (:9000), etc.
```

## Troubleshooting

**Q: "Backend API unreachable" errors**
- Check: Is API running on port 3003? (`PORT=3003` in root .env.local)
- Check: Is `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003` set?
- Check: Are proxies using the correct environment variable?

**Q: Port already in use**
- Check which service is on which port: `lsof -i :3001` and `lsof -i :3003`
- Verify: Studio on :3001, API on :3003 (not both on :3001)

**Q: SSE/Real-time events not working**
- Check: Is NATS running? (`nats://localhost:4222`)
- Check: Is `/api/stream/[tenant]` route accessible?
- Check: Is `NATS_URL` set in environment?
