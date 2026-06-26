# Reporte Final: Operational Flow Guide

## Resumen

Feature implementado: **Operational Flow Guide** — Guia de flujo operativo para el sistema JW-REMINDERS que permite a cualquier administrador nuevo entender y seguir el proceso completo de automatizacion de reuniones sin documentacion externa.

## Fecha de implementacion

2026-06-24

## URL de produccion

https://jw-reminders.duckdns.org

## Archivos creados (4 componentes nuevos)

| Archivo | Descripcion |
|---------|-------------|
| `apps/web/src/components/icons/workflow-icons.tsx` | 8 iconos SVG (PersonIcon, CalendarPlusIcon, ClipboardListIcon, BellAlertIcon, PhoneIcon, InboxIcon, CheckCircleIcon, CircleOutlineIcon) |
| `apps/web/src/components/WorkflowGuide.tsx` | Bloque "Flujo de trabajo" con 6 pasos secuenciales y enlaces directos |
| `apps/web/src/components/MetricsPanel.tsx` | Panel de 6 metricas en tiempo real con grid responsivo |
| `apps/web/src/components/CompletionStatus.tsx` | Checklist de completitud (4 etapas) por tarjeta de semana |

## Archivos modificados (5 archivos)

| Archivo | Cambios |
|---------|---------|
| `apps/web/src/app/dashboard/page.tsx` | Integro WorkflowGuide + MetricsPanel + polling 30s. Elimino stats grid anterior |
| `apps/web/src/app/dashboard/semanas/page.tsx` | Agrego CompletionStatus en tarjetas, boton "Nueva semana" en empty state, fetch WhatsApp status |
| `apps/web/src/app/dashboard/semanas/[id]/page.tsx` | Barra de acciones con 4 botones, bulk generar recordatorios, modal ver recordatorios, modal editar semana |
| `apps/api/src/modules/dashboard/dashboard.routes.ts` | Nuevos campos: activeWeeks, pendingReminders, messagesSentToday con consultas UTC |
| `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` | Campo totalReminders por semana (sum de reminders en assignments) |

## Commits

| Hash | Mensaje |
|------|---------|
| `0e6836cb` | feat: add operational flow guide with workflow steps, metrics panel, and completion status |

## Pruebas realizadas

### Pruebas locales
- TypeScript check API (`tsc --noEmit`): 0 errores
- TypeScript check Web (`tsc --noEmit`): 0 errores
- Next.js build (`next build`): Compilacion exitosa, todas las rutas generadas

### Pruebas en produccion

| Prueba | Resultado |
|--------|-----------|
| Dashboard API devuelve `stats.activeWeeks` | PASS (valor: 2) |
| Dashboard API devuelve `stats.pendingReminders` | PASS (valor: 14) |
| Dashboard API devuelve `stats.messagesSentToday` | PASS (valor: 0) |
| Dashboard API devuelve `systemStatus.whatsapp` | PASS (valor: "disconnected") |
| Meeting-weeks API incluye `totalReminders` | PASS (16, 12 por semana) |
| Pagina `/dashboard` carga (HTTP 200) | PASS |
| Pagina `/dashboard/publicadores` carga (HTTP 200) | PASS |
| Pagina `/dashboard/semanas` carga (HTTP 200) | PASS |
| Pagina `/dashboard/whatsapp` carga (HTTP 200) | PASS |
| Pagina `/dashboard/historial` carga (HTTP 200) | PASS |
| Sin emojis en HTML | PASS |
| Metricas con datos reales (no hardcoded) | PASS (4 publicadores, 2 semanas activas, 14 recordatorios) |

## Errores encontrados y corregidos

### Durante validacion visual (Task 10)

| Error | Correccion |
|-------|------------|
| Tarjetas mobile usaban `rounded-2xl` | Corregido a `rounded-card` (28px) |
| Status NOTIFIED usaba `bg-blue-50 text-blue-700` | Corregido a `bg-fog text-azure` |
| Status fallback usaba `bg-slate-100 text-slate-600` | Corregido a `bg-fog text-graphite` |
| Botones cancelar/completar usaban colores no permitidos | Corregidos a `bg-red-400`/`bg-emerald-500` con opacity hover |
| Varios botones sin `transition-colors` | Agregado `transition-colors` |

### Durante build
- El build de Next.js en Windows falla al crear symlinks (standalone output) — esto es una limitacion de Windows y no afecta el deploy en Linux/Dokploy.

## Verificacion de produccion

- Dokploy compose status: `done`
- Build completado: 2026-06-24T06:28:58.387Z (~75 segundos)
- Todas las rutas responden HTTP 200
- Datos de metricas reflejan el estado real de la base de datos
- No se encontraron errores 404 en ninguna ruta del flujo

## Funcionalidades implementadas

1. **Flujo de trabajo guiado** — 6 pasos secuenciales con iconos SVG y enlaces directos
2. **Metricas en tiempo real** — 6 indicadores con auto-refresh cada 30 segundos
3. **Boton "Nueva semana"** — Visible en header y estado vacio
4. **Barra de acciones en detalle de semana** — 4 botones (Agregar asignacion, Generar recordatorios, Ver recordatorios, Editar semana)
5. **Estado de completitud por semana** — Checklist visual de 4 etapas
6. **Cumplimiento de DESIGN.md** — Sin emojis, SVG icons, Apple-style, mobile-first

## Notas
- El sistema sigue funcionando correctamente despues del redeploy
- WhatsApp muestra "disconnected" porque el dispositivo no esta emparejado actualmente
- Las metricas se refrescan automaticamente cada 30 segundos cuando la pestana esta visible



---

# P0 - Motor de Automatizacion (Automation Model Fix)

## Resumen

Correccion P0 del motor de automatizacion segun el contrato definido en `docs/AUTOMATION-MODEL-FIX.md`. Separa regla (AutomationPlan), entrega (ReminderDelivery) e intento de envio (MessageAttempt/JwMessageLog), introduce el programa mensual (MonthlySchedule) y la auditoria (JwAutomationEvent), corrige el calculo de fechas con zona horaria y reescribe el worker con maquina de estados y reintentos.

## Fecha

2026-06-25

## Estado de la fase

- Implementacion: COMPLETA en codigo.
- Verificacion local (compila / typecheck / build / pruebas): APROBADA.
- Commit y push a `main`: HECHO (`158b521`, `5fbb751`).
- Deploy en produccion: HECHO (Dokploy compose `jw-reminders-stack`, deploy con git pull de `main`, estado `done`).
- Migraciones en produccion: APLICADAS (la API ejecuta `prisma migrate deploy` al iniciar; backfill confirmado con datos reales).
- Pruebas en produccion: APROBADAS (ver seccion de deploy).
- Reporte: actualizado (este documento).

Fase P0 TERMINADA: cumple compila, typecheck, build, pruebas locales, desplegada, pruebas en produccion y reporte actualizado.

## Arquitectura implementada

Jerarquia: `MonthlySchedule -> JwMeetingWeek -> JwAssignment -> AutomationPlan -> ReminderDelivery -> MessageAttempt (JwMessageLog)`, con `JwAutomationEvent` como traza de auditoria.

Entidades nuevas: `MonthlySchedule`, `AutomationPlan`, `ReminderDelivery`, `JwAutomationEvent`. La tabla legado `JwAssignmentReminder` se conserva con columnas de compatibilidad (`automationPlanId`, `recipientRole`, `cancelledAt`, `cancelReason`, `generationKey`).

## Archivos creados

| Archivo | Descripcion |
|---------|-------------|
| `apps/api/src/services/date-utils.ts` | Helper unico de fechas: conversion local->UTC por timezone, `calculateReminderScheduledAt`, `addDaysToLocalDate`, `zonedLocalTimeToUtc` |
| `apps/api/src/services/date-utils.test.ts` | 6 pruebas unitarias del helper (node:test) |
| `apps/api/src/services/automation.service.ts` | Logica de dominio: planes, entregas, regeneracion, cancelacion, eventos, programa mensual, snapshots |
| `apps/api/src/modules/monthly-schedules/monthly-schedules.routes.ts` | API de programas mensuales (list/get/create/update; generate-weeks y generate-assignments para fases futuras) |
| `apps/api/src/modules/automation-center/automation-center.routes.ts` | API del Centro de Automatizaciones (agenda por hoy/manana/semana/mes con filtros) |
| `apps/web/src/app/dashboard/programas/page.tsx` | Pagina de programas mensuales |
| `apps/web/src/app/dashboard/automatizaciones/page.tsx` | Pagina del Centro de Automatizaciones |
| `packages/database/prisma/migrations/20260625090000_automation_model_p0/migration.sql` | Migracion con backfill (programas mensuales, planes historicos, entregas, eventos) |
| `docs/AUTOMATION-MODEL-FIX.md` | Documento contrato P0 (fuente de verdad) |
| `docs/P4-JW-SOURCE-RESEARCH.md` | Investigacion cerrada de fuente oficial JW (P4) |

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `packages/database/prisma/schema.prisma` | Nuevos modelos, enums y estados (MeetingWeekStatus, AutomationPlanStatus, ReminderRecipientRole, ReminderStatus extendido, AssignmentStatus) |
| `packages/shared/src/enums/index.ts` | Enums alineados con el nuevo modelo |
| `apps/api/src/modules/assignments/assignments.service.ts` | Generacion/regeneracion/cancelacion/completar con planes y entregas; snapshots |
| `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` | Asociacion a programa mensual; regeneracion al cambiar fecha/hora; borrado seguro (archivar si hay historial) |
| `apps/api/src/modules/dashboard/dashboard.routes.ts` | Dashboard operativo (hoy/manana/semana, fallidos, programa activo) |
| `apps/api/src/modules/reminders/reminders.service.ts` | Lectura desde ReminderDelivery |
| `apps/api/src/modules/publishers/publishers.service.ts` | Conteo de historial considerando reminderDeliveries |
| `apps/api/src/routes/index.ts` | Rutas monthly-schedules y automation-center |
| `apps/worker/src/jobs/process-reminders.ts` | Worker reescrito: claim atomico, validaciones, envio, reintentos (3 intentos 10/30 min), DEAD, eventos |
| `apps/worker/src/services/template-renderer.ts` | Render por tipo de recordatorio y rol |
| `apps/web/src/app/dashboard/page.tsx`, `semanas/[id]/*`, `components/Sidebar.tsx` | UI operativa y navegacion |
| `apps/api/package.json`, `apps/api/tsconfig.json` | Script de pruebas y exclusion de archivos `*.test.ts` del build |

## Commits

| Hash | Mensaje |
|------|---------|
| `158b521` | feat(p0): automation engine model - MonthlySchedule, AutomationPlan, ReminderDelivery, events |

Push a `origin/main`: confirmado (`30b0990..158b521`).

## Pruebas locales realizadas

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| Generacion de Prisma Client | `pnpm db:generate` | PASS |
| Build shared | `pnpm --filter @jw-reminders/shared build` | PASS |
| Build/typecheck API | `pnpm --filter @jw-reminders/api build` (tsc) | PASS (0 errores) |
| Build/typecheck Worker | `pnpm --filter @jw-reminders/worker build` (tsc) | PASS (0 errores) |
| Typecheck Web | `tsc --noEmit` | PASS (0 errores) |
| Build Web | `next build` | Compilacion OK + types validos + 14/14 paginas estaticas generadas (incluye /programas y /automatizaciones) |
| Pruebas unitarias date-utils | `pnpm --filter @jw-reminders/api test` | PASS (6/6) |

Pruebas unitarias del helper de fechas (Caso 1 del documento P0):

- `SEVEN_DAYS_BEFORE` -> `2026-06-26T15:00:00.000Z`
- `THREE_DAYS_BEFORE` -> `2026-06-30T15:00:00.000Z`
- `ONE_DAY_BEFORE` -> `2026-07-02T15:00:00.000Z`
- `SAME_DAY` -> `2026-07-03T15:00:00.000Z`
- `INITIAL_NOTICE`/`CHANGE_NOTICE`/`CANCELLATION_NOTICE` -> inmediato (now)
- `SAME_DAY` rechaza `sendHour >= meetingTime`
- `addDaysToLocalDate` respeta limites de mes (incluye cambio de anio)

Reunion 2026-07-03 19:00 CDMX (UTC-6), envio 09:00 -> 15:00 UTC. Verificado.

## Limitaciones de build conocidas

- En Windows, `next build` falla SOLO en el paso final de copiado del output `standalone` por restriccion de symlinks (EPERM). La compilacion, validacion de tipos y generacion de paginas se completan correctamente. No afecta el build en Linux/Dokploy.

## Deploy y pruebas en produccion (COMPLETADO)

Deploy realizado el 2026-06-25 via Dokploy (proyecto `jw-reminders`, compose `jw-reminders-stack`, source git `github.com/amaurycolochos7/jw-reminders.git` rama `main`). Un primer "Rebuild" no actualizo el codigo porque no hace git pull; se disparo un deploy completo (`compose.deploy`) que descargo el ultimo commit de `main` y reconstruyo las imagenes. Estado final: `done`. La migracion se aplica automaticamente al iniciar el contenedor de API (`prisma migrate deploy`).

Smoke tests en `https://jw-reminders.duckdns.org`:

| Prueba | Resultado |
|--------|-----------|
| `GET /api/health` | 200 |
| `GET /api/monthly-schedules` (sin token) | 401 (antes 404; ruta nueva desplegada) |
| `GET /api/automation-center` (sin token) | 401 (antes 404; ruta nueva desplegada) |
| Login `POST /api/auth/login` | 200 (token emitido) |
| `GET /api/monthly-schedules` (auth) | 200 - 2 programas, ej. "Programa 2026-07" ACTIVE con 2 semanas (backfill OK) |
| `GET /api/automation-center?range=week` (auth) | 200 - 3 grupos, 12 entregas pendientes, tz America/Mexico_City |
| `GET /api/dashboard` (auth) | 200 - activeWeeks=3, pendingReminders=15, programa activo "Programa 2026-06" |
| Paginas `/dashboard`, `/dashboard/programas`, `/dashboard/automatizaciones`, `/dashboard/semanas`, `/dashboard/whatsapp`, `/dashboard/historial` | 200 |

Prueba funcional Caso 1 ejecutada en produccion (semana 2026-07-03 19:00 CDMX, envio 09:00, publicador asignado):

| Tipo | scheduledAt UTC obtenido | Esperado |
|------|--------------------------|----------|
| INITIAL_NOTICE | inmediato (now) | inmediato |
| SEVEN_DAYS_BEFORE | 2026-06-26T15:00:00.000Z | 2026-06-26 09:00 CDMX |
| THREE_DAYS_BEFORE | 2026-06-30T15:00:00.000Z | 2026-06-30 09:00 CDMX |
| ONE_DAY_BEFORE | 2026-07-02T15:00:00.000Z | 2026-07-02 09:00 CDMX |
| SAME_DAY | 2026-07-03T15:00:00.000Z | 2026-07-03 09:00 CDMX |

Resultado: coincidencia exacta. El acompanante no aplica (asignacion sin acompanante) y el asignado recibio los 5 tipos correctos.

Pruebas adicionales en produccion:

- Completar asignacion (Caso 5): asignacion -> COMPLETED y las 5 entregas pendientes -> CANCELLED, sin generar CANCELLATION_NOTICE. Correcto.
- Eliminar semana con historial (Caso 6): la semana paso a ARCHIVED en vez de borrarse; historial conservado. Correcto.
- Los datos de verificacion quedaron cancelados/archivados, por lo que el worker no enviara mensajes de prueba.

Nota: las entregas heredadas (backfill de `JwAssignmentReminder`) conservan su `scheduledAt` original (medianoche UTC del modelo anterior, que en CDMX se ve como 18:00). Es el comportamiento seguro definido en P0: el backfill no recalcula entregas existentes; solo las nuevas generaciones usan la hora corregida (09:00 local), como se verifico arriba.

## Riesgos

- La migracion usa `ALTER TYPE ... ADD VALUE` para `ReminderStatus` (QUEUED/SENDING/DEAD). En PostgreSQL 16 es valido dentro de transaccion siempre que los valores no se usen en la misma migracion; el backfill solo reutiliza valores existentes, por lo que es seguro. Verificar igualmente al aplicar `migrate deploy`.
- El backfill asocia entregas historicas a un `AutomationPlan` por asignacion; revisar conteos tras migrar.
- El modo prueba del worker (`TEST_MODE`/`TEST_PHONE`) se lee de entorno; alinear con la configuracion de UI antes de envios reales.


---

# P0.5 - Product Polish

## Resumen

Fase corta de consolidacion (sin features nuevas) para mejorar comprension, coherencia y experiencia antes de P1. Se atendieron las prioridades 1 de la auditoria final y una pasada de pulido visual.

## Fecha

2026-06-25

## Estado de la fase

- Implementacion: COMPLETA.
- Verificacion local (build/typecheck/tests): APROBADA.
- Commit y push a `main`: HECHO (`a6f3a9d`).
- Deploy en produccion: HECHO (Dokploy `compose.deploy`, estado `done`).
- Pruebas en produccion: APROBADAS.
- Reporte: actualizado.

## Cambios realizados

1. WorkflowGuide al flujo real de 7 pasos: 1) Registrar publicadores, 2) Crear programa mensual, 3) Generar semanas, 4) Crear o revisar asignaciones, 5) Generar automatizaciones, 6) Verificar WhatsApp, 7) Supervisar Centro de Automatizaciones. Cada paso enlaza a la pantalla correcta con icono propio y subtitulo "camino recomendado de principio a fin".
2. Flujo unificado con microcopy:
   - `/programas` marcado como punto de partida recomendado, con banda que muestra el flujo completo Programa -> Generar semanas -> Revisar asignaciones -> Generar automatizaciones -> Centro de Automatizaciones.
   - `/semanas` con aviso de que la creacion manual es una opcion avanzada y enlace a Programas.
3. Lenguaje correcto Archivar vs Eliminar:
   - Boton dinamico por tarjeta: "Archivar" cuando la semana tiene historial, "Eliminar" solo si esta vacia.
   - Modal de confirmacion con copy correcto ("se archivara y se conservara el historial" / "se eliminara la semana vacia"). Ya no dice "se eliminaran" cuando en realidad archiva.
4. Tarjetas de semana enriquecidas: programa mensual, badge de estado (Borrador/Lista/Activa/Completada/Archivada/Cancelada), barra de completitud en %, y conteos de automatizaciones Pendientes / Enviadas / con error. Las semanas ARCHIVED/CANCELLED se muestran atenuadas.
5. Backend `listMeetingWeeks` ahora devuelve `pendingReminders`, `sentReminders`, `failedReminders` y `totalReminders` por semana (ademas de `status` y `monthlySchedule`).
6. Pulido visual y de UX:
   - Detalle de semana: badge de estado + programa en el encabezado; `alert()` reemplazados por el patron de notificacion (toast); modales con `max-h`/scroll en pantallas pequenas.
   - `/programas` "Ver agenda" ahora filtra por ese programa (`monthlyScheduleId`), y `/automatizaciones` lee ese filtro desde la URL.

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/components/WorkflowGuide.tsx` | Flujo real de 7 pasos + subtitulo |
| `apps/web/src/components/icons/workflow-icons.tsx` | Iconos LayersIcon y SquaresIcon |
| `apps/web/src/app/dashboard/semanas/page.tsx` | Tarjetas enriquecidas, copy Archivar/Eliminar, microcopy de flujo |
| `apps/web/src/app/dashboard/programas/page.tsx` | Microcopy de inicio recomendado, link de agenda por programa |
| `apps/web/src/app/dashboard/automatizaciones/page.tsx` | Lee `monthlyScheduleId` desde URL |
| `apps/web/src/app/dashboard/semanas/[id]/page.tsx` | Badge estado+programa, toasts, scroll en modales |
| `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` | Conteos pending/sent/failed por semana |

## Commits

| Hash | Mensaje |
|------|---------|
| `a6f3a9d` | feat(p0.5): product polish - 7-step workflow guide, unified flow microcopy, archive wording, enriched week cards |

## Pruebas

Locales:

| Prueba | Resultado |
|--------|-----------|
| Build/typecheck API (`tsc`) | PASS (0 errores) |
| Pruebas unitarias API | PASS (6/6) |
| Typecheck Web (`tsc --noEmit`) | PASS (0 errores) |
| Build Web (`next build`) | Compilacion OK + 14/14 paginas (falla solo el symlink standalone en Windows, no afecta Linux/Dokploy) |

Produccion (tras deploy):

| Prueba | Resultado |
|--------|-----------|
| `GET /api/meeting-weeks` (auth) | Devuelve `monthlySchedule`, `status`, `pendingReminders`, `sentReminders`, `failedReminders`, `totalReminders` por semana |
| Datos reales | Semanas con estados ACTIVE/ARCHIVED, nombre de programa y conteos correctos |
| Paginas `/dashboard`, `/programas`, `/semanas`, `/automatizaciones`, `/whatsapp`, `/historial` | HTTP 200 |

## Nota sobre responsive

La revision responsive se realizo por inspeccion de codigo (breakpoints Tailwind mobile-first, drawer movil con overlay y scroll-lock, tablas con `overflow-x-auto` + variante de tarjetas en movil, modales con `max-h`/scroll). No se pudo verificar el render en vivo en dispositivos por indisponibilidad del navegador headless en esta sesion. Pendiente: verificacion visual en 1920/1366/iPad/iPhone cuando haya navegador.

## Estado P0.5

P0.5 cumple: compila, typecheck, build, pruebas locales, desplegado y pruebas en produccion aprobadas, reporte actualizado. Listo para revision/aprobacion antes de iniciar P1.



---

# RC1 - Estabilizacion (Release Candidate 1)

Etapa de estabilizacion (sin features nuevas): solo bugs, UX, responsive, visual, optimizaciones y correcciones funcionales.

## Fecha

2026-06-25

## Correcciones aplicadas

### Lote 1 (`000fdf2`)

1. Bug de correctitud: avisos especiales obsoletos. Completar/cancelar/regenerar una asignacion ahora cancela TODAS las entregas pendientes (incluidos `CHANGE_NOTICE` y `CANCELLATION_NOTICE`), no solo los recordatorios normales. Antes, un `CHANGE_NOTICE` pendiente sobrevivia a "completar" y el worker lo habria enviado.
   - Verificado en produccion: tras editar (crea CHANGE_NOTICE) y completar, las 7 entregas quedaron CANCELLED, incluida `CHANGE_NOTICE:CANCELLED=1`, 0 entregas no-terminales.
2. Metrica de dashboard "Asignaciones pendientes" ahora cuenta solo `DRAFT` (sin automatizar) en vez de `DRAFT+SCHEDULED`. Verificado: devuelve 0 cuando todas estan SCHEDULED/COMPLETED.
3. Historial: filtro por publicador funcional (antes era estado muerto sin control en UI). Se agrego dropdown de publicadores; el endpoint `message-logs` ya soportaba `publisherId`.
4. Optimizacion: helpers de zona horaria (`localToday`, `localDateLabel`, `localTimeLabel`) centralizados en `date-utils.ts`; eliminada la duplicacion entre `dashboard.routes.ts` y `automation-center.routes.ts` (evita drift en el calculo de "hoy").
5. Limpieza: eliminado componente sin uso `CompletionStatus.tsx`.

### Lote 2 (`1f834b5`)

6. Cumplimiento DESIGN.md: `AssignmentReminders` usaba `bg-slate-100 text-slate-600` para SKIPPED; corregido a `bg-fog text-graphite`.
7. UX: al editar una asignacion ya automatizada (`SCHEDULED`), el formulario advierte que se cancelaran los pendientes, se regeneraran y se enviara un aviso de cambio, conservando lo ya enviado (alineado con DESIGN/AUTOMATION-MODEL-FIX).
8. Cumplimiento DESIGN.md: `publicadores` usaba grises fuera de paleta (`gray-100/400/500`); corregido a `fog/graphite/silver-mist`; boton destructivo a `red-400`.

## Pruebas

- Local: API build (tsc) 0 errores; pruebas unitarias 6/6; Worker build 0; Web typecheck 0 + `next build` 14/14 paginas (solo falla el symlink standalone en Windows, no afecta Linux/Dokploy).
- Produccion (tras `compose.deploy`):
  - Fix de avisos obsoletos verificado end-to-end (ver arriba).
  - `asignacionesPendientes` correcto (DRAFT).
  - Automatizaciones con helpers centralizados OK.
  - 9 paginas del dashboard responden HTTP 200.

## Commits y deploys

| Hash | Deploy |
|------|--------|
| `000fdf2` | done |
| `1f834b5` | done |

## Decision funcional pendiente (requiere al usuario)

TEST_MODE / TEST_PHONE: la pantalla de Configuracion guarda `TEST_MODE` y `TEST_PHONE` en `AppConfig`, pero el Worker lee estos valores desde variables de entorno del contenedor, no desde `AppConfig`. Por lo tanto, hoy el interruptor de "Modo prueba" de la UI no controla el envio real.

Riesgo y decision: unificar la fuente de verdad implica que el Worker lea `TEST_MODE`/`TEST_PHONE` desde `AppConfig` (con fallback a entorno). Eso es correcto para coherencia, pero cambia el mecanismo de seguridad de envios: un administrador podria desactivar el modo prueba desde la UI y enviar mensajes reales. Por ser una decision funcional y de seguridad de envios, NO se modifico unilateralmente. Opciones:

- A) La UI controla el modo prueba real (Worker lee AppConfig con fallback a entorno).
- B) El modo prueba queda bloqueado por entorno del servidor y la UI solo lo muestra como informativo (no editable).

Pendiente de decision del usuario antes de tocar la ruta de envio.

## Pendiente de validacion (entorno del usuario)

- WhatsApp con dispositivo real (READY, envio real, reconexion, persistencia de sesion): requiere escanear el QR desde `/dashboard/whatsapp`.
- Responsive en vivo (movil/tablet/escritorio): validado por inspeccion de codigo; falta verificacion visual con navegador.



### Lote 3 (`89e5738`)

9. TEST_MODE / TEST_PHONE - Opcion A implementada. El Worker ahora lee `TEST_MODE` y `TEST_PHONE` desde `AppConfig` (BD) en cada ciclo, con fallback a variables de entorno si faltan o son invalidas. La UI de Configuracion es la fuente de verdad y los cambios se aplican en el siguiente ciclo del worker (hasta 10 min) sin redeploy. Salvaguarda: si `TEST_MODE` esta activo y no hay `TEST_PHONE`, la entrega se marca `SKIPPED` (no se envia a un numero real por error).
   - Verificado: round-trip de `/api/config` (PUT entonces GET) persiste y devuelve `TEST_MODE`/`TEST_PHONE` en la misma `AppConfig` que el worker lee. TEST_MODE permanece `true`.
   - Pendiente: verificacion de envio real depende del dispositivo WhatsApp.
10. Responsive: la tabla de Programas era el unico listado siempre-tabla; se agrego layout de tarjetas en movil (`lg:hidden`) y la tabla quedo solo en escritorio (`hidden lg:block`), consistente con Publicadores/Historial/Semanas. Se extrajo `renderProgramActions` para evitar duplicacion.

## Auditoria responsive por codigo (resultado)

Revisado sin navegador:

- Layout: `overflow-x-hidden` en el contenedor flex y en `html`/`body` (globals.css); `main` con `min-w-0`; padding superior movil `pt-[72px]` para el header fijo. No hay riesgo de scroll horizontal de pagina.
- Grids: todos mobile-first (`grid-cols-1` y escalan en `sm`/`md`/`lg`/`xl`). Columnas fijas usan `min-w-0` + `truncate` en las celdas de texto.
- Tablas: Publicadores, Historial, Semanas (detalle) y ahora Programas tienen variante de tarjetas en movil; las tablas de escritorio van dentro de `overflow-x-auto`.
- Formularios: apilan en una columna en movil; inputs heredan `w-full` desde la capa base; checkboxes con `w-4 h-4` explicito.
- Modales: todos con `max-h-[85-90vh]` + `overflow-y-auto` y `p-4` en el overlay.
- Sidebar: drawer en movil con overlay, scroll-lock y cierre por Escape; fija en escritorio.

No se detectaron roturas de layout adicionales por codigo. Queda pendiente la verificacion visual en dispositivos.

## Commits y deploys (continuacion)

| Hash | Deploy |
|------|--------|
| `89e5738` | done |



### Lote 4 (`28890df`)

11. Robustez del motor: generacion de recordatorios resiliente. Antes, una regla invalida (por ejemplo `SAME_DAY` cuando la hora de envio es mayor o igual a la hora de reunion) lanzaba excepcion y abortaba TODA la generacion de la asignacion. Ahora cada entrega se calcula de forma independiente: si una regla falla, se omite y se registra, y el resto se generan normalmente.
    - Verificado en produccion: reunion 09:00 con hora de envio 09:00 genera 4 entregas (INITIAL/7d/3d/1d) y omite solo `SAME_DAY` (antes habria fallado con 400).

## Revision de login

Revisado `login/page.tsx`: funciona correctamente (usa ruta relativa `/api/auth/login` proxeada por Next; login validado en produccion). Observacion menor no bloqueante: usa colores hex en linea en lugar de tokens de DESIGN; valores identicos a la paleta, sin impacto visual. Se deja como limpieza opcional futura.

## Deuda tecnica restante (recomendada, no critica)

- Centralizar los mapas de etiquetas/estados del frontend (`typeLabels`, `statusLabels`, `statusClasses`, estados de semana) en un modulo compartido. Hoy estan duplicados en dashboard, automatizaciones, semanas/[id] y AssignmentReminders. No causa bugs activos (la unica inconsistencia, color slate en SKIPPED, ya se corrigio), pero centralizar evitaria drift. Se pospone para no introducir cambios de texto visibles durante el QA manual.

## Commits y deploys (continuacion)

| Hash | Deploy |
|------|--------|
| `28890df` | done |

## Estado RC1

Pasada de estabilizacion por auditoria de codigo COMPLETA: 11 correcciones (bugs de correctitud, metricas, filtros, paleta DESIGN, responsive, fuente de verdad de configuracion y robustez del motor), todas probadas localmente, desplegadas y validadas en produccion. El reporte, los commits y los deploys quedan al dia.

Pendiente de cierre de RC1 (depende del entorno del usuario, no de codigo):

- WhatsApp con dispositivo real: escanear QR para validar READY, envio real, reconexion y persistencia.
- Validacion responsive visual en dispositivos (auditoria por codigo ya realizada y corregida).
- QA manual del usuario: cada reporte se atendera con el ciclo corregir-probar-deploy-validar-reportar.



---

# P1 - Centro Global de Automatizaciones

Pantalla operativa completa para administrar, supervisar y entender todas las automatizaciones del sistema.

## Fecha

2026-06-25

## Estado de la fase

- Implementacion: COMPLETA.
- Verificacion local (typecheck/build/tests): APROBADA.
- Commit y push a `main`: HECHO (`ad9c587`).
- Deploy en produccion: HECHO (Dokploy `compose.deploy`, estado `done`).
- Pruebas en produccion: APROBADAS.
- Reporte: actualizado.

## Backend (apps/api/src/modules/automation-center/automation-center.routes.ts)

- `GET /api/automation-center` extendido: filtros `range` (today|tomorrow|week|month|overdue|custom), `month=YYYY-MM` (mes calendario), `status`, `role`, `reminderType`, `publisherId`, `monthlyScheduleId`, `meetingWeekId`, `dateFrom`/`dateTo`. Vista `overdue` (vencidas/no enviadas) = `scheduledAt < now` y estado abierto. Cada entrega incluye `localDate`, `localTime`, `overdue`, `attemptCount`, `maxAttempts`, `nextRetryAt`, `errorMessage`, `sentAt`. Resumen agrega `overdue`. Agrupado por dia local con etiquetas HOY/MANANA.
- `GET /api/automation-center/overview`: resumen operativo (hoy con asignados/acompanantes, manana, vencidas, fallidas, enviadas hoy, programas con pendientes, proximos publicadores 7 dias).
- `GET /api/automation-center/deliveries/:id`: detalle con plan e historial de intentos (`messageLogs`).
- `POST /api/automation-center/deliveries/:id/retry`: reintenta entregas `FAILED`/`DEAD` (reset a `PENDING`, `attemptCount=0`, `scheduledAt=now`); evento `REMINDER_RETRY_REQUESTED`. Guarda 400 para estados no fallidos.
- `POST /api/automation-center/deliveries/:id/cancel`: cancela entregas `PENDING`/`QUEUED`/`FAILED`; evento `REMINDER_CANCELLED`. Guarda 400 para estados no cancelables.

## Frontend (apps/web/src/app/dashboard/automatizaciones/page.tsx)

- Resumen operativo con tarjetas clicables (Hoy, Manana, Vencidas, Fallidas, Enviadas hoy) y paneles de Programas con pendientes y Proximos publicadores.
- Conjunto completo de filtros: Vista (incluye Vencidas, Mes calendario y Rango personalizado), Estado, Tipo, Rol, Publicador, Programa, Semana; boton Limpiar filtros.
- Resumen de conteos (pendientes/enviadas/fallidas/canceladas/vencidas).
- Vista agrupada por dia con hora local, destinatario, rol, tipo, asignacion, programa, estado y marca de Vencida.
- Acciones por entrega: Detalle, Reintentar (fallidas), Cancelar (pendientes), con toasts (sin alert/confirm).
- Modal de detalle: estado, destinatario, rol, programado, intentos, plan; historial de intentos; navegacion a la semana, a la asignacion y al programa; botones de reintentar/cancelar.
- Responsive: filas `flex-col` en movil y `lg:flex-row` en escritorio; filtros en grilla; modal con `max-h`/scroll.

## Commits y deploys

| Hash | Deploy |
|------|--------|
| `ad9c587` | done |

## Pruebas

Local: web typecheck 0, API build 0, pruebas unitarias 6/6, `next build` 14/14 paginas (solo symlink standalone en Windows, no afecta Linux/Dokploy).

Produccion (despues del deploy):

| Prueba | Resultado |
|--------|-----------|
| Pagina `/dashboard/automatizaciones` | HTTP 200 |
| `GET /overview` | Completo (hoy=7, vencidas=1, fallidas=1, 4 programas, 5 publicadores) |
| Filtros today/tomorrow/week/month/overdue | OK, agrupados |
| Filtro `month=2026-07` y `custom` 2026-07-01..31 | Coinciden (14 entregas) |
| Filtros status/role/reminderType | OK (failed=1, companion=6, SAME_DAY=9) |
| `GET /deliveries/:id` | Devuelve estado, intentos, plan ACTIVO y `meetingWeekId` |
| `POST retry` sobre PENDING | 400 (guarda correcta) |
| `POST cancel` sobre PENDING | ok, estado CANCELLED |
| `POST retry` sobre FAILED | ok, estado PENDING (reencolada) |
| Navegacion semana/asignacion/programa | Enlaces presentes en el modal de detalle |
| Errores 401/404/500 | Ninguno (401 solo sin token; 400 solo en guardas esperadas) |
| Emojis | Ninguno |

## Criterio de aceptacion P1

Cumplido: el Centro carga sin errores; filtros y agrupamientos funcionan; se ve el detalle de una automatizacion con historial de intentos; se puede reintentar un fallo y cancelar una entrega pendiente; se navega a semana/asignacion/programa; responsive por codigo (movil y escritorio); sin 401/404/500; sin emojis; produccion probada tras el deploy; reporte actualizado.

Nota: la verificacion visual en dispositivos reales y el envio real por WhatsApp siguen dependiendo del dispositivo (QR) y de la confirmacion visual del usuario, como en RC1.



---

# P2 - Programa mensual inteligente

## Resumen

El modulo de Programas mensuales pasa a ser el centro de planificacion del mes. Se agrega una pantalla de detalle completa por programa con metricas reales, generacion/revision de semanas sin duplicados, completitud por semana y del programa, acciones masivas seguras con modal de confirmacion (sin alert/confirm nativos) y la relacion clara programa -> semanas -> asignaciones -> automatizaciones -> Centro de Automatizaciones.

## Fecha

2026-06-25

## Estado de la fase

Completada. Codigo verificado localmente y en produccion. Commits `25fe5de` (codigo) y `4a84334` (reporte) en `main`. Desplegado en Dokploy via API (`POST /api/compose.deploy`); la migracion `20260626000000_p2_monthly_completed` (enum `COMPLETED` + columna `completedAt`) se aplico automaticamente al arrancar el contenedor de API (`prisma migrate deploy`).

## Estados del programa

`DRAFT`, `ACTIVE`, `COMPLETED` (nuevo), `ARCHIVED`, `CANCELLED`. Se agrego `MonthlyScheduleStatus.COMPLETED` y `MonthlySchedule.completedAt` al esquema; `PUT /:id` con `status=COMPLETED` fija `completedAt` y emite `MONTHLY_PROGRAM_COMPLETED`.

## Archivos creados

- `packages/database/prisma/migrations/20260626000000_p2_monthly_completed/migration.sql`: `ALTER TYPE ... ADD VALUE 'COMPLETED'` + `ADD COLUMN "completedAt"`.
- `apps/api/src/modules/monthly-schedules/monthly-schedules.service.ts`: metricas y acciones masivas.
- `apps/web/src/app/dashboard/programas/[id]/page.tsx`: pantalla de detalle del programa.
- `apps/web/src/components/ConfirmModal.tsx`: modal de confirmacion reutilizable (tonos default/danger/warning, cierre con Esc/overlay).

## Archivos modificados

- `packages/database/prisma/schema.prisma`: enum `COMPLETED` + `completedAt`.
- `apps/api/src/modules/monthly-schedules/monthly-schedules.routes.ts`: `GET /` y `GET /:id` usan el servicio; `updateSchema` admite `COMPLETED`; nuevos `POST /:id/generate-automations`, `/:id/regenerate-pending`, `/:id/cancel-pending`.
- `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` y `meeting-weeks.routes.ts`: `generateWeekAutomations` + `POST /:id/generate-automations` (nivel semana).
- `apps/web/src/app/dashboard/programas/page.tsx`: enlace "Ver detalle" + estado `COMPLETED`.
- `apps/web/src/components/index.ts`: exporta `ConfirmModal`.

## API

- `GET /api/monthly-schedules`: lista enriquecida (weekCount, assignmentCount, deliveryCount, pending, sent, failed, cancelled, completion).
- `GET /api/monthly-schedules/:id`: detalle con `metrics` (totalWeeks, activeWeeks, totalAssignments, totalAutomations, automationPlanCount, pending, sent, failed, cancelled, skipped, completion) y `weeks[]` con conteos por semana y completitud.
- `POST /api/monthly-schedules/:id/generate-automations`: genera planes para todas las asignaciones sin plan activo en semanas activas; idempotente (omite las que ya tienen). Evento `MONTHLY_AUTOMATIONS_GENERATED`.
- `POST /api/monthly-schedules/:id/regenerate-pending`: supersede planes activos y regenera. Evento `MONTHLY_AUTOMATIONS_REGENERATED`.
- `POST /api/monthly-schedules/:id/cancel-pending`: cancela entregas `PENDING`/`QUEUED`/`FAILED` del programa (sin borrar historial). Evento `MONTHLY_AUTOMATIONS_CANCELLED`.
- `POST /api/meeting-weeks/:id/generate-automations`: genera automatizaciones de una sola semana.
- Buckets de entrega: pending=`PENDING`/`QUEUED`/`SENDING`, sent=`SENT`, failed=`FAILED`/`DEAD`, cancelled=`CANCELLED`, skipped=`SKIPPED`.
- Completitud por semana = 4 pasos (existe, tiene asignaciones, tiene automatizaciones, sin pendientes); completitud del programa = promedio de semanas activas.

## Frontend (detalle del programa)

- Cabecera con nombre, mes, estado visual y barra de completitud.
- 8 tarjetas de metricas: Semanas, Asignaciones, Automatizaciones, Pendientes, Enviadas, Fallidas, Canceladas, Completitud.
- Acciones del programa con `ConfirmModal`: Generar automatizaciones, Regenerar pendientes, Cancelar pendientes, Marcar completado, Archivar programa, y enlace "Ver agenda en Centro de Automatizaciones" (`?range=month&monthlyScheduleId=`).
- Generacion de semanas (dia/hora) con confirmacion; no duplica semanas existentes.
- Lista de semanas: tarjetas en movil y tabla en escritorio (rango, reunion, estado, asignaciones, pendientes, enviadas, fallidas, completitud). Acciones por semana: Ver semana, Editar (fecha/hora con regeneracion automatica), Generar automatizaciones, Archivar/Eliminar.
- Responsive (movil/tablet/escritorio) sin scroll horizontal roto; toasts para feedback.

## Pruebas locales (todas OK)

- `prisma generate` y migracion aplicada en DB local (enum `COMPLETED` + `completedAt` verificados).
- `tsc --noEmit` limpio en `apps/api` y `apps/web`; pruebas unitarias API 6/6; `next build`: "Compiled successfully" + tipos validos + 14/14 paginas (solo falla el copiado standalone por symlink en Windows, no afecta Docker/Linux).
- Smoke test de extremo a extremo contra imagen recien construida (red Docker, DB real): crear programa, generar semanas (5), generar de nuevo (0 = sin duplicar), generar asignaciones (20), detalle con metricas, generar automatizaciones (160 en 20 planes), regenerar de nuevo (0, omitidas 20), agenda filtrada por programa (35 avisos iniciales inmediatos), generar por semana (idempotente), regenerar pendientes (160 / 20 supersede), cancelar pendientes (160), marcar `COMPLETED` (fija `completedAt`), archivar, lista enriquecida. Datos de prueba eliminados al final.

## Deploy en produccion (Dokploy API)

El redeploy NO se disparo solo con el push a `main`. Causa raiz verificada via API de Dokploy (`http://187.77.11.79:3000`, token `x-api-key` valido):

- Proyecto `jw-reminders` (id `U5Ic_HIvn7KMmrwixyE2J`), entorno `production`, servicio compose `jw-reminders-stack` (id `z6xyxXGM1QTnRlFs_2Lmc`), `composePath=./docker-compose.yml`.
- `sourceType=git` con `customGitUrl=https://github.com/amaurycolochos7/jw-reminders.git`, `customGitBranch=main`, `githubId` vacio (no usa la integracion GitHub App, sino git custom + webhook por `refreshToken`). `autoDeploy=true`, `triggerType=push`.
- El historial de deployments mostraba como ultimo el de P1 (`2026-06-25T23:56:55Z`); no existia ningun deployment para los commits P2 (`25fe5de`, `4a84334`): el webhook de GitHub no disparo el deploy esta vez.
- La API de Dokploy sigue siendo valida (lista 10 proyectos, lectura completa de configuracion). Se redesplego con `POST /api/compose.deploy` `{composeId}` -> `{success:true,"Deployment queued"}`, igual que en fases anteriores. Build finalizado con `composeStatus=done`.
- El contenedor de API ejecuta `prisma migrate deploy` al arrancar; la migracion `20260626000000_p2_monthly_completed` se aplico sola en la DB de produccion (enum `COMPLETED` + `completedAt`).

## Pruebas en produccion (todas OK, tras redeploy)

| Prueba | Resultado |
|--------|-----------|
| `GET /api/monthly-schedules` | Incluye `completion`, `pending`, `sent`, `failed`, `cancelled` (codigo nuevo vivo) |
| `GET /api/monthly-schedules/:id` | Incluye `metrics` + `weeks[]` con conteos por semana (migracion viva) |
| Crear programa (Diciembre 2099 de prueba) | ACTIVE |
| Generar semanas | created=4 |
| Generar semanas de nuevo | created=0 (sin duplicar) |
| Generar asignaciones | Guarda correcta: 400 "se necesitan al menos 2 publicadores activos" (no hay 2 activos en prod) |
| `POST /:id/generate-automations` | Desplegado, created=0 (sin asignaciones) |
| `POST /:id/regenerate-pending` | Desplegado, 0/0 |
| `POST /:id/cancel-pending` | Desplegado, cancelled=0 |
| `POST /api/meeting-weeks/:id/generate-automations` | Desplegado, created=0 |
| Agenda filtrada `?range=month&monthlyScheduleId=` | OK (groups=0 sin entregas) |
| `PUT /:id status=COMPLETED` | status=COMPLETED, `completedAt` fijado (confirma enum+columna en prod) |
| `PUT /:id status=ARCHIVED` | status=ARCHIVED |
| Limpieza | Semanas de prueba (vacias) eliminadas; queda solo el cascaron archivado "Diciembre 2099" (la API no expone borrado de programa) |

Config de prod: `TEST_MODE=true`, `TEST_PHONE=5219611234567` (los envios solo van al telefono de prueba).

## Criterio de aceptacion P2

Cumplido: detalle completo del programa; generacion de semanas sin duplicados; metricas reales; acciones masivas seguras con modal de confirmacion; agenda por programa en el Centro de Automatizaciones; estados incluyendo `COMPLETED`; responsive. Probado localmente y en produccion; desplegado en Dokploy via API; migracion aplicada en prod; reporte actualizado.


## Pendientes menores de P2 (cierre)

1. **Programa de prueba `Diciembre 2099`**: quedo vacio (sus 4 semanas de prueba fueron eliminadas) y en estado `ARCHIVED`. No existe endpoint de borrado de programa en la API, por lo que se deja archivado e inofensivo (mes lejano, sin semanas, sin asignaciones, sin entregas; no aparece en operaciones activas).
2. **Procedimiento de deploy via API documentado** en `docs/DEPLOY-DOKPLOY.md` (seccion "Cuando el webhook NO dispara el deploy").

**Propuesta (no implementada) — endpoint de borrado seguro de programas vacios**: `DELETE /api/monthly-schedules/:id` que solo borre de forma permanente cuando el programa no tenga semanas con asignaciones ni entregas (mismo criterio que `meeting-weeks` usa para borrar semanas vacias). Si el programa tiene historial, responder 409 / archivar en lugar de borrar. Pendiente de aprobacion del admin antes de implementar.


---

# P3 - Generador automatico de asignaciones

## Resumen

Generador automatico que distribuye publicadores de forma equilibrada en Lectura de la Biblia y Seamos mejores maestros, considerando el historial previo. No envia mensajes: primero crea una PROPUESTA revisable (estado `PROPOSED`) que el admin revisa, edita, aprueba o descarta. Solo al aprobar se crean asignaciones reales (`DRAFT`); las automatizaciones se generan despues, cuando el admin lo pide.

## Fecha

2026-06-25

## Estado de la fase

Completada. Verificada localmente y en produccion. Commit `2ef9bc4` en `main`. Desplegada en Dokploy via API (`POST /api/compose.deploy`). La migracion `20260626020000_p3_assignment_proposed` (valor `PROPOSED` en `AssignmentStatus`) se aplico automaticamente al arrancar (`prisma migrate deploy`).

## Flujo

Programa mensual -> Generar semanas -> Generar propuesta -> Revisar / editar -> Aprobar -> (volver al programa) Generar automatizaciones.

## Algoritmo de scoring (`apps/api/src/services/assignment-proposal.ts`)

Funcion pura y determinista `buildAssignmentProposal(weeks, publishers, history, slots?, options?)` -> `{ assignments, warnings }`:

- Elegibilidad: asignado = `isActive && !deletedAt && canReceiveAssignments`; acompanante = lo anterior **mas** `canBeCompanion` (ser acompanante tambien es recibir asignacion).
- Balance: puntaje = `historial + usoEnElMes * 1000` (el balance dentro del mes domina; el historial desempata) -> elige siempre al de menor carga.
- Parejas frecuentes: penalizacion por pareja (`historial de pareja + pareja en el mes * 1000`) para evitarlas cuando hay alternativa.
- No repite la misma persona dos veces en la semana, salvo `allowSamePersonTwicePerWeek`.
- Lectura de la Biblia y TALK sin acompanante; Seamos mejores maestros con acompanante.
- Cuando no hay suficientes personas/acompanantes, emite `warnings` y reutiliza solo lo imprescindible.
- 8 pruebas unitarias cubren: exclusion de inactivos/no-elegibles/borrados, no usar acompanante no apto, lectura individual, no repetir en la semana, distribucion equilibrada, prioridad por historial, respeto de slots existentes y evitar pareja frecuente.

## Backend

- `AssignmentStatus` + `PROPOSED` (migracion `20260626020000_p3_assignment_proposed`).
- `monthly-schedules.service.ts`: `generateProposal`, `discardProposal`, `regenerateProposal`, `approveProposal` (PROPOSED -> DRAFT), `getProposal`. El historial para el scoring se toma solo de `DRAFT/SCHEDULED/COMPLETED` (no de propuestas ni canceladas).
- Endpoints: `GET /api/monthly-schedules/:id/proposal`, `POST /:id/generate-proposal`, `/:id/regenerate-proposal`, `/:id/discard-proposal`, `/:id/approve-proposal` (cuerpo opcional `{ allowSamePersonTwicePerWeek }`).
- Edicion manual: reutiliza `PUT /api/assignments/:id` (cambia asignado/acompanante y recalcula snapshots; la fila sigue en `PROPOSED`).
- Gating: la generacion de automatizaciones **omite** asignaciones `PROPOSED` (programa y semana) y la generacion por asignacion las **rechaza**; nada se vuelve definitivo ni envia mensajes hasta aprobar.

## Frontend (`apps/web/src/app/dashboard/programas/[id]/propuesta/page.tsx`)

- Vista de propuesta por semana con asignado y acompanante editables (selects). Bandera "permitir repetir persona en la misma semana".
- Acciones con `ConfirmModal` (sin alert/confirm nativos): Generar, Regenerar, Aprobar, Descartar. Muestra avisos de la generacion y toasts.
- Enlace de entrada desde el detalle del programa ("Abrir propuesta").

## Pruebas locales (todas OK)

- `tsc --noEmit` limpio (api+web); 14 pruebas unitarias (6 date-utils + 8 propuesta) en verde.
- Smoke de extremo a extremo contra imagen recien construida (red Docker, DB real): crear -> semanas (5) -> generar propuesta (20) -> `GET proposal` -> generar automatizaciones sobre PROPOSED = 0 (omitidas) -> generar por asignacion = rechazada -> edicion manual conserva PROPOSED -> regenerar (20) -> aprobar (20) -> proposedCount=0 -> detalle 20 DRAFT -> generar automatizaciones tras aprobar = 160 -> generar propuesta de nuevo = 0 (sin duplicar) -> descartar. Datos de prueba eliminados.

## Pruebas en produccion (tras deploy via API, OK)

| Prueba | Resultado |
|--------|-----------|
| Migracion `PROPOSED` viva | Si (endpoints de propuesta responden) |
| Crear programa (Noviembre 2099) + generar semanas | created=4 |
| `POST /generate-proposal` | created=16, warnings=12 (prod tiene 1 publicador activo: reutiliza y avisa) |
| `GET /proposal` | hasProposal=true, proposedCount=16, weeks=4 |
| `POST /generate-automations` sobre PROPOSED | created=0 (omitidas; sin mensajes) |
| `POST /approve-proposal` | approved=16; proposedCount -> 0 (asignaciones reales) |
| Limpieza | Semanas eliminadas/archivadas; programa archivado |

Config de prod: `TEST_MODE=true`. No se generaron automatizaciones para las propuestas, por lo que no se enviaron mensajes.

## Criterio de aceptacion P3

Cumplido: se genera una propuesta mensual; distribuye de forma razonable (balance + historial + parejas, validado por pruebas unitarias); el admin revisa y edita antes de aprobar; al aprobar se crean asignaciones reales; no se generan automatizaciones hasta que el admin lo pide; sin duplicados graves (dedup por slot); no se usan publicadores inactivos ni no elegibles; produccion probada; reporte actualizado.

Nota de limpieza: quedaron dos programas de prueba archivados e inofensivos en produccion (`Diciembre 2099` vacio y `Noviembre 2099` con asignaciones en borrador en semanas archivadas, sin entregas ni mensajes), por no existir endpoint de borrado de programas.


---

# P4 - Integracion inteligente de programas (arquitectura de Providers)

## Resumen

Arquitectura de integracion desacoplada para obtener el contenido de "Seamos mejores maestros" y "Lectura de la Biblia" cuando sea viable. El sistema no depende de una API concreta: consume solo una interfaz `MeetingProgramProvider`. Se implementan ManualProvider e ImportProvider (seguros, sin scraping ni redistribucion de contenido protegido) y se documenta JWProvider como mejora futura. El motor de importacion sigue el flujo Provider -> Parser -> Validator -> Normalizer -> persistencia, creando programa, semanas y plantillas de asignaciones (sin asignar personas).

## Fecha

2026-06-25

## Estado de la fase

Completada. Verificada localmente y en produccion. Commit `3a13616` en `main`. Desplegada en Dokploy via API (`POST /api/compose.deploy`). Migracion `20260626040000_p4_assignment_template` aplicada automaticamente al desplegar.

## Fase 1 - Investigacion (docs/P4-JW-SOURCE-RESEARCH.md)

Conclusion basada en evidencia: no existe API oficial publica documentada para el programa Vida y Ministerio. jw.org publica cada cuaderno en PDF/EPUB/JWPUB/RTF para uso personal; existe una libreria comunitaria (`jw-epub-parser`) y wrappers no oficiales (`allejok96/jwlib`, `MrCyjaneK/jwapi`) que usan endpoints internos no documentados y de riesgo ToS. Decision: implementar Manual + Import ahora; documentar JWProvider (EPUB que el admin aporte, sujeto a revision legal) para el futuro. Sin scraping ni dependencia de HTML/APIs inestables.

## Fase 2/4 - Arquitectura de Providers (apps/api/src/services/providers/)

- `types.ts`: interfaz `MeetingProgramProvider` (id, name, available, fetchRaw) + formas canonicas `Raw/Parsed/Normalized` + presets `STANDARD_PARTS` (4) y `EXTENDED_PARTS` (6) + `NO_COMPANION_TYPES` (Lectura, Discurso).
- `manual.provider.ts` (ManualProvider): genera la estructura estandar del mes (semanas + partes) para confirmar.
- `import.provider.ts` (ImportProvider): ingiere un JSON estructurado que aporta el admin (objeto o texto).
- `jw.provider.ts` (JWProvider): stub documentado, `available:false`, lanza error explicativo (futuro).
- `registry.ts`: alta de un nuevo Provider en una linea; el resto del sistema no cambia.

## Fase 3 - Motor de importacion (apps/api/src/services/import.service.ts)

- `parseProgram` (lenient), `validateProgram` (errores/avisos), `normalizeProgram` (calcula lunes de la semana, numera secuencial, infiere seccion y acompanante) - funciones puras con pruebas unitarias.
- `previewImport`: ejecuta Provider->Parser->Validator->Normalizer SIN persistir; marca que semanas ya existen.
- `confirmImport`: persiste en transaccion -> upsert `MonthlySchedule`, crea `JwMeetingWeek` (READY) sin duplicar, crea filas `AssignmentTemplate`; no asigna personas. Evento `PROGRAM_IMPORTED`.
- Endpoints `apps/api/src/modules/imports/`: `GET /api/imports/providers`, `POST /api/imports/preview`, `POST /api/imports/confirm`.

## Fase 5 - Modelo de plantillas

Nuevo modelo `AssignmentTemplate` (por semana): order, assignmentNumber, section, assignmentType, title, durationMinutes, needsCompanion, room, source. Unico por `meetingWeekId+assignmentNumber`. Migracion `20260626040000_p4_assignment_template`. El generador de propuestas (P3) usa las plantillas de la semana como slots cuando existen (si no, cae a los slots por defecto).

## Fase 6 - UI (apps/web/src/app/dashboard/importar/page.tsx)

Pantalla "Importar programa": seleccionar Provider, formulario (manual: ano/mes/dia/hora/preset; import: JSON), Previsualizar, ver validacion (errores/avisos) y preview por semana con sus plantillas (marcando las que ya existen), y Confirmar. La importacion nunca es directa: el boton Confirmar solo se habilita tras una previsualizacion valida con semanas nuevas. Item de menu "Importar" en la barra lateral.

## Pruebas locales (todas OK)

- `tsc --noEmit` limpio (api+web); 20 pruebas unitarias (incluye parser/validator/normalizer y los providers).
- Smoke de extremo a extremo contra imagen recien construida (red Docker, DB real): listar providers (jw no disponible); ManualProvider preview (5 semanas, 6 partes extended) + confirm (30 plantillas) + reconfirm (0 duplicadas); la propuesta usa las plantillas importadas (30 = 5x6); ImportProvider rechaza payload invalido (3 errores) y confirma uno valido (2 plantillas); JWProvider rechazado. Datos de prueba eliminados.

## Pruebas en produccion (tras deploy via API, OK)

| Prueba | Resultado |
|--------|-----------|
| `GET /api/imports/providers` | manual:true, import:true, jw:false |
| Manual preview (extended) | valido, 4 semanas, 6 partes/semana |
| Manual confirm | Febrero 2096: 4 semanas, 24 plantillas |
| Manual re-confirm | 0 creadas, 4 omitidas (sin duplicar) |
| Import preview/confirm | Marzo 2096: 1 semana, 2 plantillas |
| Import preview payload invalido | valido=false, 3 errores |
| JWProvider | rechazado (no disponible) |
| Limpieza | programas de prueba 2096 archivados |

Migracion `AssignmentTemplate` confirmada viva en produccion (se crearon plantillas). Sin envio de mensajes (la importacion no genera automatizaciones).

## Criterio de aceptacion P4

Cumplido: existe una arquitectura de Providers (interfaz unica + registry); el sistema importa mediante un Provider (Manual e Import); las semanas se generan correctamente y sin duplicar; las plantillas de asignaciones se crean automaticamente; la arquitectura permite agregar nuevos Providers en el futuro (JWProvider documentado) sin tocar el motor ni la UI; probado localmente y en produccion; desplegado en Dokploy via API; reporte actualizado.

Nota de limpieza: quedaron dos programas de prueba archivados e inofensivos en produccion (`Febrero 2096`, `Marzo 2096`) por no existir endpoint de borrado de programas (mejora futura ya documentada).