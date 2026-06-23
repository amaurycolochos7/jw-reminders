#!/bin/bash
# Run Prisma migrations in the API container
echo "Running migrations..."
docker exec jw-reminders-api npx prisma migrate deploy --schema=/app/prisma/schema.prisma
echo "Done."
