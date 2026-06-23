#!/bin/bash
# Check health of all services
echo "=== JW Reminders Health Check ==="

echo -n "API:       "
curl -sf http://localhost:4000/health && echo " OK" || echo " FAIL"

echo -n "Web:       "
curl -sf http://localhost:3001 > /dev/null && echo " OK" || echo " FAIL"

echo -n "WhatsApp:  "
curl -sf http://localhost:3010/health && echo " OK" || echo " FAIL"

echo -n "Database:  "
docker exec jw-reminders-db pg_isready -U jw_admin -d jw_reminders > /dev/null 2>&1 && echo " OK" || echo " FAIL"

echo ""
echo "WhatsApp Status:"
curl -sf http://localhost:3010/status 2>/dev/null || echo "  Could not reach WhatsApp service"
