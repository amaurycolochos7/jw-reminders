# Deploy en Dokploy

## Requisitos previos

- Acceso al panel Dokploy en `http://187.77.11.79:3000`
- Repositorio conectado: `https://github.com/amaurycolochos7/jw-reminders.git`
- Dominio DNS configurado: `jw-reminders.duckdns.org` → `187.77.11.79`

## Servicios

| Servicio | Nombre en Dokploy | Puerto interno |
|---|---|---|
| PostgreSQL | jw-reminders-db | 5432 |
| API | jw-reminders-api | 4000 |
| Frontend | jw-reminders-web | 3001 |
| Worker | jw-reminders-worker | - |
| WhatsApp | jw-reminders-whatsapp | 3010 |

## Pasos de deploy

1. Crear proyecto `jw-reminders` en Dokploy
2. Conectar repositorio GitHub (rama: `main`)
3. Configurar deploy tipo Docker Compose (`docker-compose.yml`)
4. Agregar variables de entorno (ver `.env.example`)
5. Configurar dominio `jw-reminders.duckdns.org` con SSL
6. Deploy inicial
7. Ejecutar migraciones: `docker exec jw-reminders-api npx prisma migrate deploy`
8. Ejecutar seed: `docker exec jw-reminders-api npx prisma db seed`

## Variables de entorno requeridas

Ver archivo `.env.example` en la raíz del proyecto.

**Nunca** subir valores reales al repositorio.

## Redeploy

Cada push a `main` puede disparar un redeploy desde Dokploy.

## Redeploy

Cada push a `main` puede disparar un redeploy desde Dokploy.

### Cuando el webhook NO dispara el deploy (procedimiento correcto)

El servicio `jw-reminders-stack` es `sourceType=git` (git custom + webhook por `refreshToken`, sin GitHub App). A veces el webhook de GitHub no dispara el redeploy tras un push. En ese caso, el flujo correcto es desplegar via API de Dokploy con `compose.deploy` (NO redeploy manual desde el panel):

1. **Verificar ultimos commits** (que el push llego a `main`):
   ```bash
   git log --oneline -3 origin/main
   ```

2. **Verificar el ultimo deployment** en Dokploy (confirmar que no incluye tu commit):
   ```bash
   # Listar proyectos y obtener composeId del servicio jw-reminders-stack
   curl -s -H "x-api-key: $DOKPLOY_TOKEN" "$DOKPLOY_URL/api/project.all"
   curl -s -H "x-api-key: $DOKPLOY_TOKEN" "$DOKPLOY_URL/api/compose.one?composeId=$COMPOSE_ID"
   # -> revisar .deployments[] ordenado por createdAt (status/title del ultimo)
   ```

3. **Disparar el deploy via API** (`POST /api/compose.deploy`):
   ```bash
   curl -s -X POST -H "x-api-key: $DOKPLOY_TOKEN" -H "Content-Type: application/json" \
     -d "{\"composeId\":\"$COMPOSE_ID\"}" \
     "$DOKPLOY_URL/api/compose.deploy"
   # Respuesta esperada: {"success":true,"message":"Deployment queued","composeId":"..."}
   ```

4. **Validar `composeStatus=done`** (esperar a que termine el build):
   ```bash
   curl -s -H "x-api-key: $DOKPLOY_TOKEN" "$DOKPLOY_URL/api/compose.one?composeId=$COMPOSE_ID" \
     | jq -r '.composeStatus'   # debe ser "done" (pasa por "running")
   ```

5. **Probar produccion** (que el codigo nuevo esta vivo):
   ```bash
   curl -s "https://jw-reminders.duckdns.org/api/..."  # validar el cambio desplegado
   ```

Referencia del proyecto:
- `DOKPLOY_URL = http://187.77.11.79:3000`
- Proyecto `jw-reminders` -> `projectId = U5Ic_HIvn7KMmrwixyE2J`
- Entorno `production`, servicio compose `jw-reminders-stack` -> `composeId = z6xyxXGM1QTnRlFs_2Lmc`, `composePath = ./docker-compose.yml`
- El contenedor de API ejecuta `prisma migrate deploy` al arrancar, asi que las migraciones nuevas se aplican solas en cada deploy.
- El token de la API de Dokploy (`x-api-key`) no debe subirse al repositorio; guardarlo como variable de entorno (`DOKPLOY_TOKEN`).

## Rollback

1. En Dokploy, ir al historial de deploys
2. Seleccionar deploy anterior
3. Redeploy a esa versión

## Troubleshooting

```bash
# Ver logs
docker logs jw-reminders-api
docker logs jw-reminders-worker
docker logs jw-reminders-whatsapp

# Reiniciar servicio
docker restart jw-reminders-api

# Revisar DB
docker exec -it jw-reminders-db psql -U jw_admin -d jw_reminders
```
