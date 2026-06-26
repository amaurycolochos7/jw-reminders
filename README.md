# JW Reminders

Sistema independiente de recordatorios automáticos para asignaciones de la reunión de entre semana (Lectura de la Biblia y Seamos Mejores Maestros). Envía recordatorios por WhatsApp.

## Arquitectura

```
jw-reminders/
├── apps/
│   ├── api/        → Express REST API (puerto 4000)
│   ├── web/        → Next.js panel admin (puerto 3001)
│   ├── worker/     → Cron scheduler (cada 10 min)
│   └── whatsapp/   → WhatsApp bot (puerto 3010)
├── packages/
│   ├── database/   → Prisma schema + migraciones
│   └── shared/     → Enums, constantes, validadores
├── docs/           → Documentación
└── scripts/        → Scripts de utilidad
```

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose
- PostgreSQL 16

## Desarrollo local

```bash
# 1. Copiar variables de entorno
cp .env.local.example .env.local

# 2. Levantar con Docker
docker compose -f docker-compose.local.yml up -d

# 3. Ejecutar migraciones
./scripts/db-migrate.sh

# 4. Seed inicial
./scripts/db-seed.sh

# 5. Verificar salud
./scripts/healthcheck.sh
```

### URLs locales

- Panel web: http://localhost:3001
- API: http://localhost:4000
- WhatsApp: http://localhost:3010

### Credenciales iniciales

- Usuario: `admin`
- Contraseña: `dorian123`

## Producción

Desplegado en Dokploy. Ver `docs/DEPLOY-DOKPLOY.md`.

- URL: https://jw-reminders.duckdns.org
- Dominio: jw-reminders.duckdns.org (DuckDNS)

## Servicios

| Servicio | Función |
|---|---|
| API | CRUD publicadores, semanas, asignaciones, recordatorios |
| Web | Panel administrativo |
| Worker | Procesa y envía recordatorios cada 10 min |
| WhatsApp | Bot de envío de mensajes |

## Recordatorios

Se generan automáticamente al crear asignaciones:
- Aviso inicial (al crear)
- 7 días antes (solo asignado)
- 3 días antes
- 1 día antes
- Mismo día

### Modo prueba

Con `TEST_MODE=true`, todos los mensajes van a `TEST_PHONE` en lugar de los números reales.

## Documentación

- [Directiva Maestra](docs/MASTER-PROJECT-DIRECTIVE.md)
- [Arquitectura](ARCHITECTURE.md)
- [Release](RELEASE.md)
- [Changelog](CHANGELOG.md)
- [Deploy en Dokploy](docs/DEPLOY-DOKPLOY.md)
- [Deploy rapido](DEPLOY.md)
- [Sesión WhatsApp](docs/WHATSAPP-SESSION.md)
- [Checklist de pruebas](docs/TESTING-CHECKLIST.md)
- [Plan completo](PLAN-JW-REMINDERS.md)
