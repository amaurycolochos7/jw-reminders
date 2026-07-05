set -e
TS=$(date +%Y%m%d_%H%M%S); echo "TS=$TS"
mkdir -p /root/jw-backups
echo "== fresh app DB backup =="
docker exec jw-reminders-db pg_dump -U jw_admin -d jw_reminders > "/root/jw-backups/db_predokploy_${TS}.sql"
echo "db_backup_bytes=$(wc -c < /root/jw-backups/db_predokploy_${TS}.sql)"
PG=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres' | head -1)
echo "pg=$PG"
echo "== backup current Dokploy env (for rollback) =="
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" > "/root/jw-backups/dokploy_env_${TS}.txt"
echo "dokploy_env_backup_bytes=$(wc -c < /root/jw-backups/dokploy_env_${TS}.txt)"
echo "keys_before: $(sed 's/=.*//' /root/jw-backups/dokploy_env_${TS}.txt | grep -v '^$' | sort | tr '\n' ' ')"
WT=$(grep '^WHATSAPP_INTERNAL_TOKEN=' /etc/dokploy/compose/compose-back-up-open-source-firewall-2rmfv5/code/.env | cut -d= -f2-)
echo "token_len_to_inject=${#WT}"
HAS=$(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT (env LIKE '%WHATSAPP_INTERNAL_TOKEN=%')::text FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';")
echo "already_has_token=$HAS"
if [ "$HAS" != "t" ]; then
  docker exec "$PG" psql -U dokploy -d dokploy -v tok="$WT" -c "UPDATE compose SET env = env || E'\nWHATSAPP_INTERNAL_TOKEN=' || :'tok' || E'\nCORS_ORIGINS=https://jw-reminders.duckdns.org' WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';"
else
  echo "(token already present; skipping append)"
fi
echo "keys_after: $(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | sed 's/=.*//' | grep -v '^$' | sort | tr '\n' ' ')"
echo "required_present_after:"
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep -oE '^(WHATSAPP_INTERNAL_TOKEN|CORS_ORIGINS)=' | sed 's/=/=>OK/' | sort -u
WTLEN=$(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep '^WHATSAPP_INTERNAL_TOKEN=' | cut -d= -f2- | tr -d '\n' | wc -c)
echo "dokploy_env_token_len=$WTLEN"
echo "DEPLOYA_DONE TS=$TS"
