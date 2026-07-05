echo "== dokploy-postgres creds (user/db only) =="
docker exec dokploy-postgres sh -c 'echo "USER=$POSTGRES_USER DB=$POSTGRES_DB"'
DU=$(docker exec dokploy-postgres sh -c 'echo $POSTGRES_USER'); DB=$(docker exec dokploy-postgres sh -c 'echo $POSTGRES_DB')
echo "== compose row (safe fields) =="
docker exec dokploy-postgres psql -U "$DU" -d "$DB" -tAc "SELECT 'name='||coalesce(name,'')||' | branch='||coalesce(branch,'')||' | customGitBranch='||coalesce(\"customGitBranch\",'')||' | autoDeploy='||coalesce(\"autoDeploy\"::text,'')||' | sourceType='||coalesce(\"sourceType\",'')||' | composeStatus='||coalesce(\"composeStatus\",'') FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';"
echo "== Dokploy env KEYS for this compose (names only, no values) =="
docker exec dokploy-postgres psql -U "$DU" -d "$DB" -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | sed 's/=.*//' | grep -v '^$' | sort
echo "== does Dokploy env include the required keys? =="
docker exec dokploy-postgres psql -U "$DU" -d "$DB" -tAc "SELECT env FROM compose WHERE \"composeId\"='z6xyxXGM1QTnRlFs_2Lmc';" | grep -oE '^(WHATSAPP_INTERNAL_TOKEN|CORS_ORIGINS|JWT_SECRET|ADMIN_PASSWORD|POSTGRES_PASSWORD)=' | sed 's/=.*/ PRESENT/' | sort -u
echo "INVESTIGATE_DONE"
