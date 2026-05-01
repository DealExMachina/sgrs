# Port Configuration Fix Summary

## Issues Found & Fixed

### Issue 1: API Port Collision ❌ → ✅
**Problem:** Both API and Studio were configured to run on port 3001
```
BEFORE:
  Studio: next dev --port 3001
  API:    PORT=3001
  Result: Port collision, one service won't start

AFTER:
  Studio: next dev --port 3001  (unchanged)
  API:    PORT=3003             (fixed in root .env.local)
  Result: No collision
```

**File Changed:** `/.env.local` (line 22)
```diff
- PORT=3001
+ PORT=3003
```

### Issue 2: Frontend-to-Backend Port Mismatch ❌ → ✅
**Problem:** Frontend expected backend on 3003, but backend was configured for 3001
```
BEFORE:
  NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003
  PORT=3001
  Result: Frontend proxies to 3003, but API listens on 3001

AFTER:
  NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003
  PORT=3003
  Result: Frontend proxies to correct port where API listens
```

### Issue 3: Incorrect Proxy Default Port ❌ → ✅
**Problem:** `/api/scopes/route.ts` defaulted to port 3002 instead of 3003
```
BEFORE:
  const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3002";

AFTER:
  const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3003";
```

**File Changed:** `apps/studio/app/api/scopes/route.ts` (line 9)
```diff
- const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3002";
+ const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3003";
```

## Verification Checklist

### Environment Variables
- [x] Root `.env.local`: `PORT=3003` (API port)
- [x] Root `.env.local`: `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003`
- [x] Studio `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3001`
- [x] Studio `.env.local`: `NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003`

### Service Startup
- [x] Studio: `next dev --port 3001` (apps/studio/package.json:9)
- [x] API: `PORT ?? 3001` overridden by environment (apps/api/src/index.ts:81)
- [x] API: Uses `PORT=3003` from root .env.local

### Proxy Routes
- [x] `apps/studio/app/api/[...slug]/route.ts` → proxies to `NEXT_PUBLIC_BACKEND_API_URL` (3003) ✓
- [x] `apps/studio/app/api/scopes/route.ts` → proxies to `NEXT_PUBLIC_BACKEND_API_URL` (3003) ✓
- [x] `apps/studio/app/api/stream/[tenant]/route.ts` → connects to `NATS_URL` ✓

### API Client
- [x] `apps/studio/lib/api-client.ts` defaults to `NEXT_PUBLIC_API_URL` (http://localhost:3001)
  - This is correct: it points to Studio's own proxy routes, not directly to backend

## How Requests Now Flow Correctly

```
1. Browser: fetch('/api/claims/deal-horizon')
   ↓
2. Studio API Proxy (/api/[...slug]/route.ts):
   - Reads: NEXT_PUBLIC_BACKEND_API_URL = http://localhost:3003
   - Forwards: GET http://localhost:3003/api/claims/deal-horizon
   ↓
3. Backend API (:3003):
   - Receives request
   - Returns domain data
```

## What to Do Now

1. **Kill running services** and restart:
   ```bash
   # Terminal 1: Backend API (now on 3003)
   cd apps/api && npm run dev
   
   # Terminal 2: Frontend Studio (still on 3001)
   cd apps/studio && npm run dev
   
   # Terminal 3: Swarm services (docker-compose)
   docker-compose up
   ```

2. **Verify in browser:**
   - Studio: http://localhost:3001
   - API: http://localhost:3003
   - Check browser Network tab: requests to `/api/*` should succeed

3. **Check logs:**
   - Studio: `GET /api/scopes 200` (proxied requests)
   - API: `[sgrs][api] Listening on http://localhost:3003`

## Related Files for Future Reference

See `ROUTING_ARCHITECTURE.md` for complete service architecture documentation.

- `/.env.local` — Root environment configuration
- `apps/studio/.env.local` — Frontend-specific overrides
- `apps/studio/lib/api-client.ts` — Frontend API client factory
- `apps/studio/app/api/[...slug]/route.ts` — Catch-all backend proxy
- `apps/studio/app/api/scopes/route.ts` — Scopes endpoint proxy
- `apps/api/src/index.ts` — Backend server startup
