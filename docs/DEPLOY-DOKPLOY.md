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
