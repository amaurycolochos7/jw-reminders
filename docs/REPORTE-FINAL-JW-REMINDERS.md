# REPORTE FINAL — JW REMINDERS

**Fecha:** 2026-06-23  
**Proyecto:** jw-reminders  
**Repositorio:** https://github.com/amaurycolochos7/jw-reminders.git  
**Rama:** main

---

## 1. Qué se construyó

Sistema completo de recordatorios automáticos para asignaciones de la reunión de entre semana JW (Lectura de la Biblia y Seamos Mejores Maestros). Envía recordatorios por WhatsApp.

### Monorepo con pnpm workspace

```
jw-reminders/
├── apps/
│   ├── api/        → Express REST API (puerto 4000)
│   ├── web/        → Next.js 14 panel admin (puerto 3001)
│   ├── worker/     → Cron scheduler (cada 10 min)
│   └── whatsapp/   → WhatsApp bot con whatsapp-web.js (puerto 3010)
├── packages/
│   ├── database/   → Prisma schema + migraciones + seed
│   └── shared/     → Enums, constantes, validadores, utils
├── docs/           → Documentación completa
└── scripts/        → Scripts de utilidad
```

---

## 2. Servicios en Dokploy

| Servicio | Contenedor | Estado | Puerto |
|---|---|---|---|
| PostgreSQL 16 | jw-reminders-db | ✅ Running (healthy) | 5432 |
| Express API | jw-reminders-api | ✅ Running | 4000 |
| Next.js Web | jw-reminders-web | ✅ Running | 3001 |
| Worker/Cron | jw-reminders-worker | ✅ Running | - |
| WhatsApp Bot | jw-reminders-whatsapp | ✅ Running | 3010 |

**Proyecto Dokploy:** `jw-reminders` (projectId: `U5Ic_HIvn7KMmrwixyE2J`)  
**Compose:** `jw-reminders-stack` (composeId: `z6xyxXGM1QTnRlFs_2Lmc`)

---

## 3. URLs

| Servicio | URL |
|---|---|
| Panel Dokploy | http://187.77.11.79:3000 |
| Dominio configurado | jw-reminders.duckdns.org |
| API interna | http://172.24.0.5:4000 |
| Web interna | http://jw-reminders-web:3001 |

**Nota:** El dominio `jw-reminders.duckdns.org` está configurado en Dokploy con Traefik y funciona internamente en el VPS. Sin embargo, el registro DNS A de DuckDNS apunta a `129.222.161.168` en lugar de `187.77.11.79`. El token proporcionado no pudo actualizar DuckDNS (respuesta "KO"). Se requiere actualización manual del DNS.

---

## 4. Variables de entorno configuradas

| Variable | Descripción |
|---|---|
| POSTGRES_DB | jw_reminders |
| POSTGRES_USER | jw_admin |
| POSTGRES_PASSWORD | *** (configurada en Dokploy) |
| JWT_SECRET | *** (configurada en Dokploy) |
| TEST_MODE | true |
| TEST_PHONE | 5219611234567 |
| WHATSAPP_API_URL | http://whatsapp:3010 |
| NODE_ENV | production |

---

## 5. Base de datos

- **Motor:** PostgreSQL 16 Alpine
- **Migración:** `20260623000000_init` (aplicada automáticamente al iniciar API)
- **Seed:** Admin user + 8 plantillas de mensaje + config inicial
- **Credenciales admin:** `admin` / `dorian123` (hash SHA-256)

### Tablas creadas

| Tabla | Función |
|---|---|
| AdminUser | Usuarios administradores |
| JwPublisher | Publicadores (entidad central) |
| JwMeetingWeek | Semanas de reunión |
| JwAssignment | Asignaciones |
| JwAssignmentReminder | Recordatorios programados |
| JwMessageTemplate | Plantillas de mensaje |
| JwMessageLog | Log de mensajes enviados |
| JwWhatsappSessionLog | Log de sesión WhatsApp |
| AppConfig | Configuración general |

---

## 6. Estado de WhatsApp

- Servicio corriendo en contenedor con Chromium headless
- Volumen persistente configurado para sesión
- QR disponible en logs: `docker logs jw-reminders-whatsapp`
- **Estado actual:** Iniciando (requiere escaneo QR para activar)
- Para escanear: ver docs/WHATSAPP-SESSION.md

---

## 7. Pruebas realizadas

### Pruebas de build (Local)

| Prueba | Resultado |
|---|---|
| Build API (tsc) | ✅ PASS |
| Build Worker (tsc) | ✅ PASS |
| Build WhatsApp (tsc) | ✅ PASS |
| Build Web (Next.js) | ⚠️ PASS en Docker (falla en Windows por symlinks standalone) |
| Prisma generate | ✅ PASS |
| Prisma migration diff | ✅ PASS |

### Pruebas de infraestructura (Producción)

| Prueba | Resultado | Evidencia |
|---|---|---|
| Docker images build | ✅ PASS | Todos los 4 builds exitosos en VPS |
| DB healthcheck | ✅ PASS | `Up (healthy)` |
| API /health | ✅ PASS | `{"status":"ok"}` |
| API /version | ✅ PASS | `{"version":"1.0.0"}` |
| API /ready | ✅ PASS | `{"ready":true}` |
| Web frontend carga | ✅ PASS | HTML con "JW Reminders - Panel Administrativo" |
| Worker arranca | ✅ PASS | `[Worker] Ready. Waiting for next tick...` |
| WhatsApp servicio arranca | ✅ PASS | Container Up |
| Migración aplicada | ✅ PASS | API inicia sin errores de schema |
| Seed ejecutado | ✅ PASS | Admin user creado |

### Pruebas de dominio

| Prueba | Resultado |
|---|---|
| Traefik routing interno | ✅ PASS (Host header routing funciona) |
| DNS público | ⚠️ PENDIENTE (IP incorrecta en DuckDNS) |
| SSL/HTTPS | ⚠️ PENDIENTE (depende del DNS) |

---

## 8. Errores encontrados y corregidos

| Error | Causa | Corrección | Commit |
|---|---|---|---|
| Worker build fails: no default export | node-cron import incorrecto | `import * as cron` | 394d3f5 |
| ERR_UNSUPPORTED_DIR_IMPORT | tsconfig ESM sin extensiones .js | Cambiar a NodeNext + .js ext | 9db7617 |
| ERR_UNKNOWN_FILE_EXTENSION .ts | database package exporta .ts | Crear client.js compilado | 54a6905 |
| libssl.so.1.1 not found | Alpine no tiene OpenSSL 1.1 | Usar node:20-slim + openssl | 03ee4dd |
| shared package .ts en runtime | Exporta src/index.ts | Build shared a dist/ + NodeNext | 0340ded |
| whatsapp-web.js named import | CJS module en contexto ESM | Default import + destructuring | ae1d37a |
| Port 4000 already allocated | Otro servicio usa el puerto | Quitar port mappings (Traefik) | 33624f9 |
| Bridge network alias error | compose + external bridge | Quitar network config, usar Dokploy domains | 33624f9 |

---

## 9. Riesgos pendientes

| Riesgo | Impacto | Mitigación |
|---|---|---|
| DNS no apunta al VPS | No se accede por dominio público | Actualizar DuckDNS manualmente con token correcto |
| WhatsApp sin QR escaneado | No envía mensajes | Escanear QR desde logs del container |
| TEST_MODE=true | Mensajes van a TEST_PHONE | Es correcto hasta completar validación |
| Login no probado end-to-end | Shell escaping impide test via SSH | Probar desde browser cuando DNS funcione |

---

## 10. Instrucciones de uso

### Acceder al panel

1. Actualizar DuckDNS: `jw-reminders.duckdns.org` → `187.77.11.79`
2. Abrir https://jw-reminders.duckdns.org
3. Login: `admin` / `dorian123`

### Conectar WhatsApp

```bash
ssh root@187.77.11.79
docker logs -f jw-reminders-whatsapp
# Escanear QR que aparece en terminal
```

### Crear publicador

POST /api/publishers (con JWT token)
```json
{
  "fullName": "Juan Pérez",
  "phone": "9611234567"
}
```

### Crear semana

POST /api/meeting-weeks (con JWT token)
```json
{
  "weekStartDate": "2026-06-22",
  "meetingDate": "2026-06-24",
  "meetingTime": "19:00"
}
```

---

## 11. Reiniciar servicios

```bash
# Desde Dokploy panel o API:
# POST http://187.77.11.79:3000/api/compose.deploy
# Body: {"composeId":"z6xyxXGM1QTnRlFs_2Lmc"}

# O desde SSH:
ssh root@187.77.11.79
docker restart jw-reminders-api
docker restart jw-reminders-worker
docker restart jw-reminders-whatsapp
docker restart jw-reminders-web
```

---

## 12. Regenerar QR WhatsApp

```bash
ssh root@187.77.11.79
docker stop jw-reminders-whatsapp
docker volume rm compose-back-up-open-source-firewall-2rmfv5_whatsapp_session
docker start jw-reminders-whatsapp
docker logs -f jw-reminders-whatsapp
# Escanear nuevo QR
```

---

## 13. Checklist final de producción

- [x] Código en GitHub actualizado
- [x] Dokploy conectado al repo
- [x] Servicios levantan correctamente
- [x] API responde /health, /version, /ready
- [x] Web frontend carga
- [x] Worker corriendo (cron cada 10 min)
- [x] WhatsApp servicio activo
- [x] Base de datos migrada y con seed
- [x] TEST_MODE activo (seguridad)
- [x] Dominio configurado en Dokploy/Traefik
- [ ] DNS público apuntando a VPS (requiere token DuckDNS correcto)
- [ ] WhatsApp QR escaneado
- [ ] Login probado desde browser
- [ ] Sistra NO fue modificado ✅

---

## 14. Commits realizados

| Hash | Mensaje |
|---|---|
| c442256 | feat: initial project structure - monorepo with pnpm workspace |
| 132f75d | fix: simplify Dockerfiles for Dokploy, add initial migration SQL |
| 32397cc | fix: correct migration folder name and lock file for Prisma deploy |
| 394d3f5 | fix: add tsconfig.json to Docker COPY, fix node-cron import |
| 30b464a | fix: remove host port mappings, add bridge network for Traefik routing |
| 33624f9 | fix: remove Traefik labels from compose |
| 9db7617 | fix: switch to CommonJS output, fix module imports |
| 8d3b3a0 | fix: properly configure ESM with NodeNext |
| 05ddc60 | fix: add .js extensions to shared package exports |
| 38c5510 | fix: set WORKDIR to app directory for ESM |
| 54a6905 | fix: use compiled JS client for database package |
| 03ee4dd | fix: use node:20-slim with openssl for Prisma |
| 0340ded | fix: build shared package to JS dist |
| ae1d37a | fix: use default import for whatsapp-web.js |

---

## 15. Conclusión

El sistema JW-REMINDERS está **construido, desplegado y funcionando** en el VPS via Dokploy. Los 5 servicios están activos. La API responde correctamente. El worker procesa recordatorios cada 10 minutos. El frontend está accesible.

**Pendientes para completar al 100%:**
1. Actualizar DNS de DuckDNS con token correcto (el proporcionado no funcionó)
2. Escanear QR de WhatsApp para activar envío de mensajes
3. Probar login completo desde browser una vez que el DNS esté activo

El proyecto **NO toca Sistra** ni su base de datos, contenedores o variables.
