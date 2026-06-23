#!/bin/bash
# Fix DB migration issue - run on VPS
# This sets password and runs migration

echo "=== Setting password ==="
docker exec jw-reminders-db psql -U jw_admin -d jw_reminders -c "ALTER USER jw_admin WITH PASSWORD 'JwR3m1nd3rs2026Prod';"

echo "=== Running migration ==="
docker exec jw-reminders-api /bin/sh -c "cd /app/packages/database && npx prisma migrate deploy"

echo "=== Running seed ==="
docker exec jw-reminders-api /bin/sh -c "cd /app/packages/database && npx tsx prisma/seed.ts"

echo "=== Restarting WhatsApp ==="
docker restart jw-reminders-whatsapp

echo "=== Done ==="
