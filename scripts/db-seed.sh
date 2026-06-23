#!/bin/bash
# Seed the database with initial data
echo "Seeding database..."
docker exec jw-reminders-api npx prisma db seed
echo "Done."
