set -e
PG=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres' | head -1)
WT=$(grep '^WHATSAPP_INTERNAL_TOKEN=' /etc/dokploy/compose/compose-back-up-open-source-firewall-2rmfv5/code/.env | cut -d= -f2- | tr -d '\r\n')
case "$WT" in *[!0-9a-f]*) echo "TOKEN NOT PURE HEX -> abort"; exit 1;; esac
[ ${#WT} -eq 64 ] || { echo "bad token len ${#WT} -> abort"; exit 1; }
echo "token ok (hex, len 64)"
HAS=$(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT (env LIKE '%WHATSAPP_INTERNAL_TOKEN=%')::text FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';")
if [ "$HAS" != "t" ]; then
  docker exec "$PG" psql -U dokploy -d dokploy -c "UPDATE compose SET env = env || E'\nWHATSAPP_INTERNAL_TOKEN=${WT}\nCORS_ORIGINS=https://jw-reminders.duckdns.org' WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';"
else
  echo "(already present; skip)"
fi
echo "keys_after: $(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | sed 's/=.*//' | grep -v '^$' | sort | tr '\n' ' ')"
echo "required_present:"
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep -oE '^(WHATSAPP_INTERNAL_TOKEN|CORS_ORIGINS)=' | sed 's/=/=>OK/' | sort -u
WTLEN=$(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep '^WHATSAPP_INTERNAL_TOKEN=' | cut -d= -f2- | tr -d '\r\n' | wc -c)
CORS=$(docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep '^CORS_ORIGINS=' | cut -d= -f2- | tr -d '\r\n')
echo "dokploy_token_len=$WTLEN | cors=$CORS"
echo "DEPLOYA2_DONE"
