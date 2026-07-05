PG=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres' | head -1)
echo "dokploy pg container = $PG"
DU=$(docker exec "$PG" sh -c 'echo $POSTGRES_USER'); DB=$(docker exec "$PG" sh -c 'echo $POSTGRES_DB')
echo "USER=$DU DB=$DB"
echo "== compose row (safe fields) =="
docker exec "$PG" psql -U "$DU" -d "$DB" -tAc "SELECT 'name='||coalesce(name,'')||' | branch='||coalesce(branch,'')||' | customGitBranch='||coalesce(\"customGitBranch\",'')||' | autoDeploy='||coalesce(\"autoDeploy\"::text,'')||' | sourceType='||coalesce(\"sourceType\",'')||' | composeStatus='||coalesce(\"composeStatus\",'') FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';"
echo "== Dokploy env KEYS for this compose (names only) =="
docker exec "$PG" psql -U "$DU" -d "$DB" -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | sed 's/=.*//' | grep -v '^$' | sort
echo "== required keys present in Dokploy env? =="
docker exec "$PG" psql -U "$DU" -d "$DB" -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep -oE '^(WHATSAPP_INTERNAL_TOKEN|CORS_ORIGINS|JWT_SECRET|ADMIN_PASSWORD|POSTGRES_PASSWORD|TEST_MODE)=' | sed 's/=/ =>PRESENT/' | sort -u
echo "INVESTIGATE2_DONE"
