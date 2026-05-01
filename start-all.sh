#!/bin/bash

echo "🔧 Starting SGRS Development Stack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verify .env.local is correct
echo -e "${BLUE}📋 Verifying configuration...${NC}"
if grep -q "PORT=3003" .env.local; then
  echo -e "${GREEN}✓ API port: 3003${NC}"
else
  echo -e "${RED}✗ API port not set to 3003${NC}"
  exit 1
fi

if grep -q "NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3003" .env.local; then
  echo -e "${GREEN}✓ Backend URL: http://localhost:3003${NC}"
else
  echo -e "${RED}✗ Backend URL not configured${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Starting services...${NC}"
echo ""

# Kill existing processes on ports
echo "🧹 Cleaning up old processes..."
lsof -ti:3001,3003 | xargs kill -9 2>/dev/null || true
sleep 1

# Start Backend API (port 3003)
echo -e "${BLUE}[1/2] Starting Backend API (:3003)...${NC}"
cd apps/api
npm run dev > /tmp/api.log 2>&1 &
API_PID=$!
echo "      PID: $API_PID"
sleep 2

# Check if API started
if ps -p $API_PID > /dev/null; then
  echo -e "${GREEN}✓ API started${NC}"
  tail -3 /tmp/api.log
else
  echo -e "${RED}✗ API failed to start${NC}"
  cat /tmp/api.log
  exit 1
fi

cd /Users/jeanbapt/GitHub/sgrs
echo ""

# Start Frontend Studio (port 3001)
echo -e "${BLUE}[2/2] Starting Frontend Studio (:3001)...${NC}"
cd apps/studio
npm run dev > /tmp/studio.log 2>&1 &
STUDIO_PID=$!
echo "      PID: $STUDIO_PID"
sleep 3

# Check if Studio started
if ps -p $STUDIO_PID > /dev/null; then
  echo -e "${GREEN}✓ Studio started${NC}"
  tail -3 /tmp/studio.log
else
  echo -e "${RED}✗ Studio failed to start${NC}"
  cat /tmp/studio.log
  kill $API_PID
  exit 1
fi

cd /Users/jeanbapt/GitHub/sgrs
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ All services started!${NC}"
echo ""
echo -e "${BLUE}Studio:${NC}  http://localhost:3001"
echo -e "${BLUE}API:${NC}     http://localhost:3003"
echo ""
echo "🔍 Monitoring logs..."
echo ""
echo "API Log (/tmp/api.log):"
tail -f /tmp/api.log &
API_LOG_PID=$!

echo ""
echo "Studio Log (/tmp/studio.log):"
tail -f /tmp/studio.log &
STUDIO_LOG_PID=$!

# Cleanup on exit
trap "kill $API_PID $STUDIO_PID $API_LOG_PID $STUDIO_LOG_PID 2>/dev/null; echo -e '\n${YELLOW}Services stopped${NC}'" EXIT

wait
