#!/bin/bash
# Backup PostgreSQL database
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

echo "Backing up database..."
docker exec jw-reminders-db pg_dump -U jw_admin -d jw_reminders > "$BACKUP_DIR/jw_reminders_$TIMESTAMP.sql"
echo "Backup saved to: $BACKUP_DIR/jw_reminders_$TIMESTAMP.sql"
