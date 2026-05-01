# SGRS Services Quick Reference

## Start Development Stack

```bash
# Terminal 1: Backend API
cd apps/api && npm run dev
# Listens: http://localhost:3003

# Terminal 2: Frontend Studio
cd apps/studio && npm run dev
# Listens: http://localhost:3001

# Terminal 3: Swarm Services
docker-compose up
# NATS: nats://localhost:4222
# PostgreSQL: postgresql://localhost:5433
# MinIO: http://localhost:9000
```

## Service Ports (Do Not Change)

| Service | Port | Purpose |
|---------|------|---------|
| **Studio Frontend** | `:3001` | Next.js app + API proxy |
| **Backend API** | `:3003` | Hono REST API |
| **NATS** | `:4222` | Real-time events (SSE) |
| **PostgreSQL** | `:5433` | Primary database |
| **MinIO S3** | `:9000` | Document storage |

## Environment Variables (Must Match)

```env
# ROOT: /.env.local
PORT=3003  ← API listens here
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  ← Must match PORT

# STUDIO: apps/studio/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001  ← Points to Studio proxy
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  ← Points to API
```

## Request Path: Frontend → Backend

```
Browser
  ↓ fetch('/api/claims/xyz')
Studio (:3001)
  ↓ app/api/[...slug]/route.ts
  ↓ reads NEXT_PUBLIC_BACKEND_API_URL
  ↓ forwards to http://localhost:3003
Backend API (:3003)
  ↓ returns response
Studio
  ↓ returns to browser
```

## Common Issues & Fixes

| Problem | Check |
|---------|-------|
| "Backend unreachable" | `PORT=3003` in /.env.local |
| Port already in use | Wrong service on wrong port; check `lsof -i :3001` and `lsof -i :3003` |
| Graph shows no data | Are all 3 services running? Is NATS connected? |
| SSE events not streaming | Is `NATS_URL=nats://localhost:4222` set? |
| API returning 503 | Is backend actually listening? Run `curl http://localhost:3003/health` |

## File Reference

### Always Check These First
- `/.env.local` — Root environment (PORT, NATS_URL, database, API URLs)
- `apps/studio/.env.local` — Frontend overrides
- `apps/api/src/index.ts` — Backend startup configuration
- `apps/studio/app/api/[...slug]/route.ts` — Proxy routing logic

### Proxy Routes
- `apps/studio/app/api/[...slug]/route.ts` → Generic proxy for all /api/* requests
- `apps/studio/app/api/scopes/route.ts` → Specific scopes endpoint proxy
- `apps/studio/app/api/stream/[tenant]/route.ts` → SSE real-time event stream

### Hook Files
- `apps/studio/lib/hooks/useScopes.ts` — Load scopes list
- `apps/studio/lib/hooks/useDomainData.ts` — Load claims, drifts, contradictions, risks
- `apps/studio/lib/hooks/useFinality.ts` — Load finality status
- `apps/studio/lib/hooks/useEventStream.ts` — Subscribe to SSE stream

## Debugging Tips

### Check if services are listening
```bash
curl http://localhost:3001  # Studio (should show Next.js app)
curl http://localhost:3003  # API (should show Hono app or endpoint)
curl http://localhost:4222  # NATS (telnet test)
```

### Check network requests
1. Open browser DevTools (F12)
2. Network tab → filter by "api"
3. Should see requests like `GET /api/scopes 200`
4. Should NOT see `503` or `ECONNREFUSED` errors

### Check API logs
```bash
# In Terminal 1 (API):
[sgrs][api] Listening on http://localhost:3003
```

### Check frontend logs
```bash
# In Terminal 2 (Studio):
[graph-container] dimensions: { width: ..., height: ... }
[cytoscape] initializing with { nodeCount: ..., edgeCount: ... }
```

## Architecture Decision: Why These Ports?

- `:3001` → Studio frontend (commonly Next.js default)
- `:3003` → Backend API (separate from frontend, avoids collision)
- `:4222` → NATS (standard NATS WebSocket/core port)
- `:5433` → PostgreSQL (non-standard 5432 to avoid local conflicts)

This prevents port collisions and follows conventional separation of concerns.
