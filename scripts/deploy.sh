#!/bin/bash
# Deploy script - builds and starts all services
set -e

echo "=== JW Reminders Deploy ==="

echo "1. Building images..."
docker compose -f docker-compose.local.yml build

echo "2. Starting services..."
docker compose -f docker-compose.local.yml up -d

echo "3. Waiting for database..."
sleep 5

echo "4. Running migrations..."
docker exec jw-reminders-api npx prisma migrate deploy --schema=/app/prisma/schema.prisma || true

echo "5. Running seed..."
docker exec jw-reminders-api npx prisma db seed || true

echo ""
echo "=== Deploy complete ==="
echo "Web:      http://localhost:3001"
echo "API:      http://localhost:4000"
echo "WhatsApp: http://localhost:3010"
