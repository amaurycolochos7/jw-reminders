# Deploy

## Fuente principal

La guia operativa de despliegue vive en:

- `docs/DEPLOY-DOKPLOY.md`

Este archivo existe para cumplir la Directiva Maestra y servir como entrada rapida.

## Produccion

- URL: `https://jw-reminders.duckdns.org`
- Plataforma: Dokploy
- Compose: `jw-reminders-stack`
- Rama: `main`
- Compose path: `./docker-compose.yml`

## Flujo obligatorio

```text
Commit
  -> Push
  -> Deploy Dokploy
  -> Migraciones
  -> Health checks
  -> Smoke tests
  -> Verificacion manual
  -> Reporte
```

## Migraciones

El contenedor API ejecuta `prisma migrate deploy` al iniciar. Las migraciones deben estar versionadas antes del deploy.

## Si el webhook no dispara deploy

Usar el procedimiento por API documentado en `docs/DEPLOY-DOKPLOY.md`.

## Smoke tests minimos

- `GET /api/health`;
- login admin;
- dashboard autenticado;
- programas mensuales;
- centro de automatizaciones;
- import providers;
- flujo relevante de la fase desplegada.

