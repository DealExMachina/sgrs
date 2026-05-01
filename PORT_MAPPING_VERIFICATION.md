# Port Mapping Verification Report

## Current Status: ✅ ALL PORTS OPERATIONAL

Generated: 2026-04-30 15:45 UTC

### Local SGRS Services

| Service | Port | Status | Endpoint | Notes |
|---------|------|--------|----------|-------|
| **Studio Frontend** | 3001 | ✅ RUNNING | http://localhost:3001 | Next.js development server |
| **Backend API** | 3003 | ✅ RUNNING | http://localhost:3003 | Hono REST API |

### Docker Container Services

| Service | Port | Host Port | Status | Container |
|---------|------|-----------|--------|-----------|
| **PostgreSQL** | 5433 | 5432 → 5433 | ✅ OPEN | open-governed-swarm-of-agents-postgres-1 |
| **NATS JetStream** | 4222 | 4222 → 4222 | ✅ OPEN | open-governed-swarm-of-agents-nats-1 |
| **MinIO (S3)** | 9000 | 9000 → 9000 | ✅ OPEN | open-governed-swarm-of-agents-s3-1 |
| **Prometheus** | 9090 | 9090 → 9090 | ✅ OPEN | open-governed-swarm-of-agents-prometheus-1 |
| **Grafana** | 3004 | 3004 → 3000 | ✅ OPEN | open-governed-swarm-of-agents-grafana-1 |

## Environment Variable Consistency

### Root Configuration (/.env.local)
```env
PORT=3003                                    # ✓ API port (matches Backend API)
NEXT_PUBLIC_API_URL=http://localhost:3001    # ✓ Studio frontend
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  # ✓ Matches PORT=3003
NATS_URL=nats://localhost:4222               # ✓ NATS accessible
DATABASE_URL=postgresql://swarm:swarm@localhost:5433/swarm  # ✓ PostgreSQL accessible
```

### Studio Configuration (apps/studio/.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001    # ✓ Points to Studio's proxy routes
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003  # ✓ Matches root config
NATS_URL=nats://localhost:4222               # ✓ Real-time events
```

## Request Flow Validation

### Frontend → Backend
```
Browser (http://localhost:3001)
  ↓ fetch('/api/claims')
Studio Proxy Routes (apps/studio/app/api/[...slug]/route.ts)
  ↓ reads: NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003
Backend API (http://localhost:3003)
  ↓ responds with data
```
**Status: ✓ VERIFIED**

### Backend → Database
```
Backend API (:3003)
  ↓ DATABASE_URL=postgresql://...@localhost:5433
PostgreSQL (:5433)
  ↓ responds with data
```
**Status: ✓ VERIFIED** (API successfully connected)

### Real-time Events
```
Browser (:3001)
  ↓ fetch('/api/stream/[tenant]')
Studio SSE Route (apps/studio/app/api/stream/[tenant]/route.ts)
  ↓ connects to NATS_URL=nats://localhost:4222
NATS JetStream (:4222)
  ↓ streams scope events
Browser receives SSE data
```
**Status: ✓ VERIFIED** (connection path confirmed)

## Port Conflict Prevention

### No Conflicts Detected
- Studio frontend: 3001 (Next.js)
- Backend API: 3003 (Hono) — separated to avoid collision
- Docker services: 4222, 5433, 9000, 3004, 9090 — all unique and isolated

### Previously Fixed Issues
1. ❌ API was on 3001 (collided with Studio) → ✅ Fixed to 3003
2. ❌ /api/scopes route defaulted to 3002 → ✅ Fixed to 3003
3. ❌ Docker port mappings not exposed → ✅ Fixed by restarting docker-compose

## How to Verify Ports Manually

```bash
# Check local services
curl http://localhost:3001          # Studio should respond with HTML
curl http://localhost:3003          # API should respond

# Check Docker services
nc -zv localhost 5433               # PostgreSQL
nc -zv localhost 4222               # NATS
nc -zv localhost 9000               # MinIO

# Monitor all listening ports
lsof -i -P -n | grep LISTEN
```

## Troubleshooting

### If ports appear closed:
```bash
# Restart docker-compose if services aren't accessible
cd /Users/jeanbapt/GitHub/open-governed-swarm-of-agents
docker-compose down && docker-compose up -d

# Kill old service processes if they're stale
pkill -f "npm run dev"

# Restart SGRS services
cd /Users/jeanbapt/GitHub/sgrs/apps/api && npm run dev     # Terminal 1
cd /Users/jeanbapt/GitHub/sgrs/apps/studio && npm run dev  # Terminal 2
```

### Verify database connection:
```bash
psql -h localhost -p 5433 -U swarm -d swarm -c "SELECT 1"
```

### Verify NATS connection:
```bash
nc -zv localhost 4222 && echo "NATS OK" || echo "NATS DOWN"
```

---
**Next Step:** Open http://localhost:3001 in browser and verify graph displays with live data from backend API
