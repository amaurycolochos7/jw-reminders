PG=$(docker ps --format '{{.Names}}' | grep -E '^dokploy-postgres' | head -1)
echo "== branch / autoDeploy / refreshToken(len) =="
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT 'name='||name||' | branch='||coalesce(branch,'NULL')||' | autoDeploy='||\"autoDeploy\"::text||' | refreshTokenLen='||coalesce(length(\"refreshToken\")::text,'0') FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';"
echo "== sourceType (cast text) =="
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT \"sourceType\"::text FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" 2>&1 | head -2
echo "== compose columns available (for env editing) =="
docker exec "$PG" psql -U dokploy -d dokploy -tAc "SELECT string_agg(column_name,', ') FROM information_schema.columns WHERE table_name='compose';"
echo "DOKINV3_DONE"
