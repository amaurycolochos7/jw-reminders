# JW Reminders — Sistema de mensajería robusta

Rama: `feature/mensajeria-robusta` · Estado: **listo para revisión / producción BLOQUEADA**.

> Este documento describe la reestructuración del sistema de mensajería (plantillas, render, snapshots, worker, WhatsApp, manual/prueba y seguridad). El deploy a producción está **gated**: requiere rotación de credenciales, validación visual, revisión de este documento y aprobación explícita.

---

## 1. Resumen ejecutivo
Se convirtió el panel de plantillas en la **fuente real** de los mensajes. Un único `renderMessage` en `@jw-reminders/shared` alimenta preview, generación y (como fallback legacy) el worker. Al generar una automatización se **congela** el mensaje final (`renderedMessage`) por persona; el worker envía ese snapshot **tal cual** y ya no inventa texto. Se añadió pausa/reanudación con protección de cola, mensajes manual y de prueba aislados, y endurecimiento de seguridad. Todo verificado con tests (185), E2E full-stack, smoke HTTP y build web en Linux/Docker.

## 2. Problema original
Existían **tres formatos de mensaje** distintos y solo uno se enviaba: el editor de plantillas era decorativo (los 4 mensajes activos salían de código hardcodeado), la vista de semanas mostraba un preview con emojis obsoleto, y no había snapshot: el texto se renderizaba con datos vivos al momento de enviar, por lo que un cambio de datos alteraba el mensaje. Resultado: "lo que veo no es lo que se envía".

## 3. Cómo funcionaba antes
- Plantillas editables (`JwMessageTemplate`) que el worker **ignoraba** para inicial/7/3/1.
- Texto real generado en `packages/shared/src/grouped-message` (código).
- Preview de semanas con `assignment-message.ts` (emojis) — no era lo enviado.
- Worker renderizaba en vivo al enviar (sin snapshot).

## 4. Cómo funciona ahora
`Editar plantilla → preview (render único) → guardar versión → generar automatización → snapshot congelado por persona → revisar/editar/regenerar → aprobar (READY) → worker envía el snapshot → enviado === snapshot`. Se cumple la invariante **preview === snapshot === enviado**.

## 5. Arquitectura final
```
Plantilla (JwMessageTemplate) + versiones (MessageTemplateVersion)
        │  body con {{variables}} y {{listaAsignaciones}}
        ▼
renderMessage(body, variables)   ← @jw-reminders/shared (ÚNICO)
        │  (listaAsignaciones lo genera buildInitial/ReminderAssignmentsList)
        ▼
generateSnapshots()  → congela renderedMessage en ReminderDelivery
        │              (status DRAFT, batchId, templateVersionId)
        ▼
MessageBatch (revisión)  → edit-final / regenerate → approve (DRAFT→READY)
        ▼
Worker (cron)  → gate (pausa/READY) → envía renderedMessage TAL CUAL
        │        idempotencia + outbox + reaper (H1–H5)
        ▼
Servicio WhatsApp Web (whatsapp-web.js, sesión en volumen)
```

## 6. Flujo de plantillas
Panel `Plantillas`: lista activas (badge "Conectada al envío real") vs legacy/inactivas. Editor con textarea WhatsApp + panel de variables (clic para insertar) + **preview en vivo** (`POST /message-templates/:id/preview`, render único) + validación. Guardar (`PUT /message-templates/:id`) **crea una versión nueva** (`MessageTemplateVersion`); no sobrescribe. Historial en `GET /:id/versions`.

## 7. Flujo de mensajes generados
Panel `Mensajes`: generar (`POST /automation-center/batches/generate` con tipo + programa mensual) → `MessageBatch` en DRAFT → lista de **un mensaje por persona** (`GET /batches/:id` colapsa hermanas). Cada mensaje: editar / regenerar / preview visual.

## 8. Flujo de aviso inicial agrupado
La agrupación ocurre **al generar** (no al enviar): `groupDeliveries` agrupa por `persona|mes|INITIAL_NOTICE`; se renderiza **un** mensaje con `{{listaAsignaciones}}` que contiene todas las asignaciones del mes agrupadas por fecha; ese texto se congela en todas las entregas hermanas. En WhatsApp sale **1 mensaje físico** por persona.

## 9. Flujo de edición manual
`POST /automation-center/deliveries/:id/edit-final { text }` guarda el texto exacto en todas las hermanas del grupo, marca `manuallyEdited=true` y `editedAt`. El worker enviará **exactamente** ese texto.

## 10. Flujo de regeneración
`POST /automation-center/deliveries/:id/regenerate` recalcula desde la **plantilla activa actual**, descarta la edición manual, marca `regeneratedAt` y `sourceType=REGENERATED_TEMPLATE`.

## 11. Flujo de aprobación
`POST /automation-center/batches/:id/approve` pasa entregas `DRAFT→READY`. **Guardia**: falla si alguna entrega tiene `renderedMessage` vacío (no se aprueba un mensaje sin snapshot).

## 12. Flujo del worker
Cada tick: reconcilia atascados (reaper) → **gate** (si pausa manual o WhatsApp≠READY, no reclama nada, cola intacta) → toma `PENDING`/`READY` vencidos → agrupa → envía `renderedMessage` congelado (fallback a render vivo **solo** para legacy sin `batchId`/`sourceType`; flujo nuevo sin snapshot se marca `SKIPPED`) → idempotencia/outbox → registra `JwMessageLog` + `NotificationLog`.

## 13. Flujo de WhatsApp y pausa/reanudación
Estados: STARTING/QR_REQUIRED/AUTHENTICATED/READY/DISCONNECTED/FAILED (+ reconexión automática con backoff, H4). Envíos: `GET /whatsapp/send-state` combina pausa manual (`SENDS_PAUSED` en AppConfig) + readiness. `POST /whatsapp/pause|resume`. **Pausa manual es sticky** (se mantiene tras reconectar); **pausa automática** (WhatsApp≠READY) se levanta sola al volver a READY. El panel muestra "cola protegida" cuando aplica.

## 14. Mensaje manual
Pantalla `Enviar` (pestaña Manual): texto libre + preview + confirmación. `POST /whatsapp/manual-send` con **guardia** (no envía si pausado/no READY). No crea batch ni deliveries; deja solo un `JwMessageLog` técnico (`messageType=MANUAL`).

## 15. Mensaje de prueba
Pantalla `Enviar` (pestaña Prueba): probar cualquier plantilla activa con datos de ejemplo o de un publicador real, a un teléfono autorizado. `POST /whatsapp/test-template(/preview)`. Muestra plantilla, versión, variables, mensaje final. **No dispara automatizaciones** (sin batch/deliveries). `preview === enviado`.

## 16. Seguridad aplicada
- **JWT_SECRET** sin fallback inseguro; obligatorio (>=16) en producción o el API no arranca.
- **Contraseñas bcrypt**; login migra automáticamente los hashes legacy sha256 a bcrypt.
- **ADMIN_PASSWORD** por env; sin credencial hardcodeada; el seed no resetea un admin existente.
- **CORS** restringido por `CORS_ORIGINS`; obligatorio en producción (nunca abierto).
- **Auth interna WhatsApp** (`x-internal-token`): API y worker lo envían; el servicio WhatsApp lo exige; en producción es **obligatorio** (el servicio no arranca sin él).
- **Rate limit** en `/auth` (10/min por IP).
- **Logs** con teléfonos enmascarados (`52****99`); sin secretos.
- Endpoints WhatsApp: `/send,/restart,/disconnect,/generate-qr,/status` protegidos por token interno; `/pause,/resume,/send-state` viven en la API tras `authMiddleware` (JWT). El QR solo se expone tras JWT (nunca público).
- `git grep` confirma 0 secretos en el repo.

## 17. Variables de entorno requeridas (sin valores)
| Variable | Uso | Obligatoria en prod |
|---|---|---|
| `DATABASE_URL` | Postgres | Sí |
| `JWT_SECRET` (>=16) | Firma de tokens | Sí (API no arranca sin él) |
| `ADMIN_PASSWORD` | Contraseña admin al sembrar | Recomendado (si no, temporal impresa) |
| `CORS_ORIGINS` | Orígenes permitidos | Sí |
| `WHATSAPP_INTERNAL_TOKEN` (>=16) | Auth interna API/worker↔WhatsApp | Sí (API y WhatsApp no arrancan sin él) |
| `WHATSAPP_API_URL` | URL interna del bot | Sí |
| `WHATSAPP_SESSION_PATH` | Ruta de sesión (volumen) | Sí |
| `TEST_MODE` / `TEST_PHONE` | Redirección de pruebas | Opcional |
| `CRON_SCHEDULE` | Frecuencia worker | Opcional (default 10 min) |

## 18. Migraciones aplicadas
15 migraciones aplican limpio desde cero (incluye `20260703190000_h1_h5_whatsapp_hardening`). Nueva: **`20260703210000_p14_message_snapshot_versions`** (aditiva): enum `ReminderStatus` +`DRAFT/READY/PAUSED`; tablas `MessageTemplateVersion`, `MessageBatch`; columnas snapshot en `ReminderDelivery` (`renderedMessage, renderedVariables, templateId, templateVersionId, manuallyEdited, editedAt, regeneratedAt, sourceType, batchId`); `JwMessageTemplate` +`description/activeVersion`. No borra ni altera datos existentes.

## 19. Archivos principales modificados
- `packages/shared/src/message-render/*` (render único + catálogo), `grouped-message/*` (list builders + assembleMessageVariables), `delivery-grouping/*` (agrupación canónica).
- `packages/database/prisma/{schema.prisma,seed.ts,migrations/…p14…}`.
- `apps/api/src/services/{message-snapshot.service.ts,manual-send.service.ts,notifications/assignment-preview.service.ts}`; `config/security.ts`; `modules/{message-templates,automation-center,whatsapp,auth}`; `middleware/auth.ts`; `server.ts`; `routes/index.ts`.
- `apps/worker/src/{jobs/process-reminders.ts,services/{delivery-outcome.ts,whatsapp-client.ts}}`.
- `apps/whatsapp/src/{index.ts,services/message-sender.ts}`.
- `apps/web/src/app/dashboard/{plantillas,mensajes,enviar,whatsapp}/page.tsx`; `components/Sidebar.tsx`.
- Eliminado: `apps/api/src/services/notifications/assignment-message.ts` (+test) — renderizador emoji obsoleto.
- Config: `docker-compose.yml`, `.env.example`, `README.md`.

## 20. Endpoints nuevos/modificados
- `GET /message-templates` (con `connectedToSend`/`isLegacy`), `GET /message-templates/variables`, `GET /:id/versions`, `POST /:id/preview`, `PUT /:id` (crea versión).
- `POST /automation-center/batches/generate`, `GET /batches`, `GET /batches/:id`, `POST /deliveries/:id/edit-final`, `/regenerate`, `POST /batches/:id/approve`, `GET /deliveries/:id/frozen-preview`.
- `GET /whatsapp/send-state`, `POST /whatsapp/pause`, `/resume`, `/manual-send`, `/test-template`, `/test-template/preview`; `send-test` (compat → manual con guardia).

## 21. Pruebas ejecutadas
- `tsc --noEmit`: shared, api, worker, whatsapp, web = **0 errores**.
- Unitarias: **shared 19, worker 28, api 138 = 185** verde.
- **E2E** (`apps/api/scripts/e2e-mensajeria.ts`): flujo completo con worker real + WhatsApp mock.
- **Smoke HTTP** (`apps/api/scripts/smoke-endpoints.ts`): endpoints del frontend.
- `migrate deploy` desde cero (15) + `migrate status` up to date + `seed` idempotente.
- **Build web en Linux/Docker**: imagen creada OK (el `EPERM` de standalone era solo de Windows).

## 22. Matriz formal de pruebas
Ver **`docs/JW-REMINDERS-MATRIZ-PRUEBAS.md`** (8 categorías, ~50 casos con objetivo/pasos/datos/esperado/obtenido/evidencia/estado/riesgo). Resultado: todos **PASS** salvo los **BLOCKED** por diseño (envío real, validación visual, deploy) que dependen de tu acción.

## 23. Riesgos pendientes
- Sin validación visual del panel (no hay navegador en el entorno de trabajo).
- No se han enviado mensajes reales por WhatsApp Web (solo mock).
- Rate limit in-memory (por instancia); multiinstancia futura necesitaría store compartido.
- Fallback de render vivo sigue disponible para datos legacy (intencional, temporal).
- Credenciales del VPS/Dokploy/SSH quedaron expuestas en el chat → **rotarlas**.

## 24. Checklist antes de producción
- [ ] Rotar credenciales VPS root, token Dokploy, SSH.
- [ ] Definir en prod: `JWT_SECRET` (>=16), `WHATSAPP_INTERNAL_TOKEN` (>=16), `CORS_ORIGINS`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`.
- [ ] Backup de base de datos.
- [ ] Backup del volumen de sesión WhatsApp (`whatsapp_session`).
- [ ] Validación visual en local o staging del flujo completo.
- [ ] Revisión de este documento.
- [ ] Aprobación explícita para deploy.

## 25. Plan de deploy (gated — NO ejecutar aún)
1. Backup DB: `docker exec <db> pg_dump -U <user> <db> > backup_pre_p14.sql`.
2. Backup sesión: `docker run --rm -v whatsapp_session:/s -v $PWD:/b alpine tar czf /b/wa_session_backup.tgz -C /s .`.
3. `git merge feature/mensajeria-robusta` (o desplegar la rama) tras revisión.
4. Definir variables de entorno nuevas en Dokploy.
5. Deploy en orden: **db → api (corre `prisma migrate deploy`) → whatsapp → worker → web**.
6. Verificar `migrate status` = up to date.
7. Smoke post-deploy (§ siguiente).
8. `db:seed` (idempotente; no resetea admin; crea plantillas nuevas si faltan).

## 26. Plan de rollback
- Código: `main` intacto; revertir = no mergear o `git revert` por fase.
- DB: migración aditiva; rollback = `DROP TABLE "MessageBatch","MessageTemplateVersion"; ALTER TABLE "ReminderDelivery" DROP COLUMN "renderedMessage",…;` (los valores de enum `DRAFT/READY/PAUSED` pueden permanecer). Restaurar `backup_pre_p14.sql` si es necesario.
- Sesión WhatsApp: restaurar `wa_session_backup.tgz` al volumen.

## 27. Qué validar visualmente
- **Plantillas**: editar → preview con negritas → guardar → aparece nueva versión.
- **Mensajes**: generar un mes → ver **1 mensaje por persona** con varias asignaciones → editar final → regenerar → aprobar (DRAFT→READY).
- **Enviar**: prueba (plantilla + ejemplo/publicador + teléfono) y manual (texto + confirmación) con la guardia visible.
- **WhatsApp**: estados, pausar/reanudar, aviso de cola protegida.
- Confirmar que **el mensaje aprobado es el que llega** (con un número autorizado en staging).

## 28. Smoke tests post-deploy (resumen)
- `GET /health` API + `GET /whatsapp/status` (tras token).
- Login admin (con `ADMIN_PASSWORD`).
- Editar una plantilla → verificar nueva versión.
- Generar un batch pequeño → revisar → aprobar.
- Con un número autorizado y `TEST_MODE`/staging: enviar prueba → confirmar `enviado === snapshot`.
- Verificar que no hay duplicados y que el historial (`JwMessageLog`) coincide.

## Fase futura (fuera de alcance ahora)
- Multiorganización (`organizationId` + sesión WhatsApp por organización).
- Alertas/monitoreo (desconexión, acumulación de pendientes, UNCERTAIN/FAILED).
- Rate limit distribuido; rotación/retención de logs.
