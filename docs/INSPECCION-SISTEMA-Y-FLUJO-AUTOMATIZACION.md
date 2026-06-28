# Inspección profunda del sistema y flujo para crear una automatización

> Documento de inspección técnica/operativa generado a partir del código real del repositorio
> (apps/api, apps/web, apps/worker, apps/whatsapp, packages/database, packages/shared).
> Refleja **lo que el sistema hace hoy**, no lo planeado. Última verificación: estado actual del repo.

---

## 1. Resumen ejecutivo

JW Reminders es un monorepo (pnpm + Turbo-style workspaces) compuesto por 4 aplicaciones y 2 paquetes
compartidos. Su objetivo es **enviar recordatorios automáticos por WhatsApp** a los publicadores que
tienen asignaciones en la reunión de entre semana.

La pieza central es el **modelo de automatización**: cuando una asignación queda confirmada, el sistema
crea un **AutomationPlan** y, a partir de él, varias **ReminderDelivery** (entregas de recordatorio)
programadas en fechas concretas. Un **worker** corre cada 10 minutos, busca entregas vencidas y las
manda por WhatsApp.

**Idea clave:** una "automatización" NO se crea sola al crear una asignación. La asignación primero vive
como borrador (`DRAFT`) o propuesta (`PROPOSED`). El plan de automatización (y por lo tanto los
recordatorios reales) se crea en un **paso explícito** que dispara el administrador: *"Generar
automatizaciones / Generar recordatorios"*.

---

## 2. Arquitectura general

```
jw-reminders/
├── apps/
│   ├── api/        → Express REST API (puerto 4000). Toda la lógica de negocio.
│   ├── web/        → Next.js 14 (App Router) panel admin (puerto 3001).
│   ├── worker/     → Cron node-cron cada 10 min: procesa y envía recordatorios.
│   └── whatsapp/   → Bot WhatsApp (puerto 3010), cliente de envío real.
├── packages/
│   ├── database/   → Prisma schema + cliente + migraciones + seed.
│   └── shared/     → Enums, constantes, validadores, utils de plantillas.
```

| Servicio | Rol en la automatización |
|---|---|
| **api** | Crea/edita asignaciones, genera planes de automatización y entregas, expone el Centro de Automatizaciones. |
| **web** | Interfaz donde el admin recorre todo el flujo (publicadores → programas → semanas → automatizaciones). |
| **worker** | Lee `ReminderDelivery` vencidas y dispara el envío. Fuente de la verdad de "cuándo se manda". |
| **whatsapp** | Ejecuta el envío físico del mensaje al número de destino. |

Comunicación: `web → api` (REST, token JWT en header). `worker → DB` directo vía Prisma y `worker → whatsapp`
para mandar. Todo comparte la misma base PostgreSQL.

---

## 3. Modelo de datos (entidades y relaciones)

El esquema vive en `packages/database/prisma/schema.prisma`. Entidades relevantes para automatizar:

### Jerarquía principal

```
MonthlySchedule (programa del mes: año + mes)
   └── JwMeetingWeek (semana de reunión: fecha, hora, sala)
         ├── AssignmentTemplate (plantilla de parte importada, SIN persona)
         └── JwAssignment (asignación real: parte + persona asignada + acompañante)
               └── AutomationPlan (plan de automatización, versionado)
                     └── ReminderDelivery (entrega concreta de un recordatorio)
                           └── JwMessageLog (registro de cada intento de envío)
```

### Entidades clave

- **JwPublisher** — Publicador. Campos que gobiernan la automatización:
  - `isActive`, `deletedAt` → si está inactivo/borrado no recibe nada.
  - `canReceiveAssignments` → puede ser asignado principal.
  - `canBeCompanion` → puede ser acompañante.
  - `phone` / `whatsappPhone` → destino del mensaje (se prefiere `whatsappPhone`).

- **MonthlySchedule** — Programa mensual. Único por (`year`, `month`). Estados: `DRAFT/ACTIVE/COMPLETED/ARCHIVED/CANCELLED`.

- **JwMeetingWeek** — Semana de reunión. `meetingDateLocal`, `meetingTime`, `status` (`DRAFT/READY/ACTIVE/COMPLETED/...`).

- **AssignmentTemplate** — Plantilla de parte (cuando se *importa* un programa). Define la estructura
  (número, sección, tipo, título, si necesita acompañante) **pero no tiene persona asignada**.

- **JwAssignment** — Asignación real con persona. Estados: `PROPOSED → DRAFT → SCHEDULED → COMPLETED/CANCELLED`.
  Guarda *snapshots* del nombre/teléfono del asignado y acompañante (`assignedNameSnapshot`, etc.)
  para que el mensaje no cambie si luego editan al publicador.

- **AutomationPlan** — El "plan" que materializa la automatización de UNA asignación. Versionado
  (`@@unique([assignmentId, version])`). Estados: `DRAFT/ACTIVE/SUPERSEDED/CANCELLED/ARCHIVED`. Guarda
  `timezone`, `sendHour`, `meetingDateLocal`, `meetingTimeLocal` y las `rules` (JSON con qué recordatorios incluye).

- **ReminderDelivery** — La unidad que el worker realmente envía. Una por (plan, publicador, tipo de recordatorio):
  `@@unique([automationPlanId, publisherId, reminderType])`. Tiene `scheduledAt`, `status`, reintentos
  (`attemptCount`, `maxAttempts=3`, `nextRetryAt`), y rol del destinatario (`ASSIGNED` / `COMPANION`).

- **JwMessageLog** — Bitácora de cada intento de envío (éxito/fallo, cuerpo, id del proveedor).

- **JwAutomationEvent** — Auditoría completa: cada acción (crear plan, generar, cancelar, enviar, fallar…)
  deja un evento. Es la "caja negra" del sistema.

- **JwMessageTemplate** — Plantillas de texto por tipo de recordatorio (con variables `{{assignedName}}`, etc.).

- **AppConfig** — Configuración clave/valor: `TIMEZONE`, `REMINDER_SEND_HOUR`, `TEST_MODE`, `TEST_PHONE`.

---

## 4. ¿Qué es exactamente "una automatización"?

En este sistema, **una automatización = un `AutomationPlan` activo con sus `ReminderDelivery`**.

Cuando se genera la automatización de una asignación, el motor
(`apps/api/src/services/automation.service.ts`) hace lo siguiente dentro de una transacción:

1. Carga la asignación + su semana + asignado + acompañante.
2. Lee la config (`TIMEZONE`, `REMINDER_SEND_HOUR` desde `AppConfig`).
3. Calcula la siguiente versión del plan.
4. Crea el `AutomationPlan` (estado `DRAFT`).
5. Construye las filas de `ReminderDelivery` según las **reglas por rol** (ver §5).
6. Activa el plan (`status: ACTIVE`) y pone la asignación en `SCHEDULED`.
7. Registra eventos `AUTOMATION_PLAN_CREATED` y `REMINDERS_GENERATED`.

A partir de ahí, las entregas quedan en `PENDING` con su `scheduledAt`, esperando al worker.

---

## 5. Reglas de recordatorios (qué se manda y cuándo)

Definidas en `automation.service.ts` y `date-utils.ts`.

### Tipos de recordatorio (`ReminderType`)

| Tipo | Cuándo se programa | ¿A quién? |
|---|---|---|
| `INITIAL_NOTICE` | Inmediato (al generar) | Asignado y acompañante |
| `SEVEN_DAYS_BEFORE` | 7 días antes de la reunión | **Solo asignado** |
| `THREE_DAYS_BEFORE` | 3 días antes | Asignado y acompañante |
| `ONE_DAY_BEFORE` | 1 día antes | Asignado y acompañante |
| `SAME_DAY` | El mismo día | Asignado y acompañante |
| `CHANGE_NOTICE` | Inmediato, al regenerar por cambios | Asignado y acompañante |
| `CANCELLATION_NOTICE` | Inmediato, al cancelar | Asignado y acompañante |

```
ASSIGNED_RULES  = [INITIAL_NOTICE, SEVEN_DAYS_BEFORE, THREE_DAYS_BEFORE, ONE_DAY_BEFORE, SAME_DAY]
COMPANION_RULES = [INITIAL_NOTICE,                    THREE_DAYS_BEFORE, ONE_DAY_BEFORE, SAME_DAY]
```

### Cálculo de la hora (`calculateReminderScheduledAt`)

- Los avisos "X días antes" y "mismo día" se programan a la hora `REMINDER_SEND_HOUR` (por defecto **9:00**)
  en la zona horaria configurada (por defecto `America/Mexico_City`).
- `INITIAL_NOTICE`, `CHANGE_NOTICE`, `CANCELLATION_NOTICE` se programan para **ahora** (envío inmediato).
- Regla de seguridad: para `SAME_DAY`, la hora de envío debe ser **anterior** a la hora de la reunión;
  si no, esa entrega se **omite** (no aborta las demás).

---

## 6. EL FLUJO COMPLETO: qué tiene que hacer una persona para crear una automatización

El panel sugiere un flujo de 7 pasos (componente `WorkflowGuide.tsx`, visible en el Dashboard). Hay
**dos caminos** para llegar a tener asignaciones: el **manual** y el de **programa/importación**.
Ambos terminan igual: generando automatizaciones.

### Mapa de navegación (Sidebar)

```
Dashboard · Publicadores · Programas · Importar · Semanas · Automatizaciones · Historial · Plantillas · WhatsApp · Configuración
```

### Paso a paso recomendado (de principio a fin)

#### Paso 0 — Configurar (una sola vez)
- Ir a **Configuración** (`/dashboard/configuracion`).
- Definir `TIMEZONE` (ej. `America/Mexico_City`), `REMINDER_SEND_HOUR` (ej. `9`).
- Para pruebas: activar `TEST_MODE=true` y poner `TEST_PHONE` (todos los mensajes irán a ese número).
- Ir a **WhatsApp** (`/dashboard/whatsapp`) y **escanear el QR** para dejar la sesión `READY`.
  Sin sesión conectada, el worker no puede enviar.

#### Paso 1 — Registrar publicadores
- Ir a **Publicadores** (`/dashboard/publicadores`).
- Dar de alta a cada persona con: nombre, teléfono (idealmente `whatsappPhone`), género.
- Marcar `canReceiveAssignments` y `canBeCompanion` según corresponda.
- **Requisito mínimo:** al menos 2 publicadores activos para poder generar asignaciones.

#### Paso 2 — Crear el programa del mes
- Ir a **Programas** (`/dashboard/programas`).
- Crear un `MonthlySchedule` indicando **año** y **mes** (se nombra solo, p.ej. "Julio 2026").
- Endpoint: `POST /api/monthly-schedules`.

#### Paso 3 — Conseguir las semanas del mes (dos opciones)

**Opción A — Generar semanas vacías:**
- Dentro del programa, usar *"Generar semanas"*: elegir día de reunión (0–6, por defecto viernes=5)
  y hora (por defecto `19:00`).
- Endpoint: `POST /api/monthly-schedules/:id/generate-weeks`. Crea una `JwMeetingWeek` por cada
  día coincidente del mes, en estado `READY`.

**Opción B — Importar un programa (con estructura de partes):**
- Ir a **Importar** (`/dashboard/importar`).
- Elegir proveedor (`manual` o `import` por JSON), **previsualizar**, validar y **confirmar**.
- La importación **nunca es directa**: primero `POST /api/imports/preview`, luego `POST /api/imports/confirm`.
- Al confirmar se crean: el programa + las semanas + las **AssignmentTemplate** (estructura de partes,
  *sin* personas asignadas).

#### Paso 4 — Conseguir asignaciones con personas (tres opciones)

**Opción A — Manual, una por una:**
- Ir a **Semanas** (`/dashboard/semanas`), entrar a una semana y crear cada asignación con el
  formulario (`AssignmentForm.tsx`): número, sección, tipo, título, persona asignada, acompañante, sala.
- Endpoint: `POST /api/assignments`. Nace en estado `DRAFT`.

**Opción B — Generación automática simple (reparto equilibrado):**
- En el programa, *"Generar asignaciones"*: rellena 4 partes estándar por semana repartiendo a los
  publicadores de forma balanceada (menos cargados primero).
- Endpoint: `POST /api/monthly-schedules/:id/generate-assignments`. Crea asignaciones `DRAFT`.

**Opción C — Propuesta inteligente (recomendada para importados):**
- En el programa, *"Generar propuesta"* (`/dashboard/programas/[id]/propuesta`).
- Usa el motor determinista `assignment-proposal.ts`: equilibra carga del mes + historial previo +
  evita parejas repetidas, respeta elegibilidad y no repite persona en la misma semana.
- Crea asignaciones en estado `PROPOSED` (revisables, editables).
- Endpoints: `POST .../generate-proposal`, `.../regenerate-proposal`, `.../discard-proposal`.
- **Hay que aprobar la propuesta** para convertirla en asignaciones `DRAFT` reales:
  `POST /api/monthly-schedules/:id/approve-proposal`.
- ⚠️ Importante: aprobar **NO** crea automatizaciones. Solo pasa `PROPOSED → DRAFT`.

#### Paso 5 — GENERAR LAS AUTOMATIZACIONES (el paso que "crea" la automatización)

Este es el momento en que realmente nacen el plan y los recordatorios. Tres formas:

**Por asignación individual:**
- En la vista de la semana, botón *"Generar recordatorios"* sobre una asignación.
- Endpoint: `POST /api/assignments/:id/generate-reminders`.
- Reglas que aplica `generateReminders`:
  - Si la asignación está `PROPOSED` → **rechaza** ("Aprueba la propuesta antes de generar").
  - Si ya existe un plan `ACTIVE` → no duplica (devuelve el existente).
  - Si todo bien → crea plan + entregas, pone la asignación en `SCHEDULED` y la semana en `ACTIVE`.

**Por programa completo (masivo):**
- En el programa, *"Generar automatizaciones"*: recorre todas las semanas activas y genera plan para
  cada asignación que no esté `CANCELLED/COMPLETED/PROPOSED` y que no tenga ya un plan activo.
- Endpoint: `POST /api/monthly-schedules/:id/generate-automations`.

**Regenerar pendientes del programa:**
- *"Regenerar"*: supersede los planes activos y crea nuevos (útil tras cambios).
- Endpoint: `POST /api/monthly-schedules/:id/regenerate-pending`.

#### Paso 6 — Verificar WhatsApp
- Confirmar en **WhatsApp** que la sesión sigue `READY`. (El `INITIAL_NOTICE` se manda casi de inmediato
  en el siguiente tick del worker, así que conviene tener la sesión lista antes de generar.)

#### Paso 7 — Supervisar el Centro de Automatizaciones
- Ir a **Automatizaciones** (`/dashboard/automatizaciones`).
- Aquí se ve: qué sale **hoy**, **mañana**, **pendientes**, **vencidos (overdue)**, **fallidos**, **enviados hoy**.
- Acciones por entrega: ver detalle e historial de intentos, **reintentar** (`/deliveries/:id/retry`),
  **cancelar** (`/deliveries/:id/cancel`).
- Endpoint base: `GET /api/automation-center/overview` y `GET /api/automation-center` (agrupado por día).

### Diagrama del flujo (texto)

```
[Config + WhatsApp QR]
        │
        ▼
[1 Publicadores] ──> [2 Programa mensual]
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
        [3A Generar semanas]   [3B Importar programa]
                │                   │ (crea AssignmentTemplate)
                └─────────┬─────────┘
                          ▼
        ┌──────── [4 Asignaciones con personas] ────────┐
        ▼                  ▼                             ▼
 [4A Manual DRAFT]  [4B Auto-generar DRAFT]   [4C Propuesta PROPOSED]
                                                      │ aprobar
                                                      ▼ (DRAFT)
                          ┌───────────────────────────┘
                          ▼
        [5 GENERAR AUTOMATIZACIONES]  ← aquí nace AutomationPlan + ReminderDelivery
                          │  (asignación → SCHEDULED, semana → ACTIVE)
                          ▼
        [Worker cada 10 min] envía las entregas vencidas por WhatsApp
                          │
                          ▼
        [7 Centro de Automatizaciones] supervisa / reintenta / cancela
```

---

## 7. El worker: cómo se envían realmente los recordatorios

Archivo: `apps/worker/src/jobs/process-reminders.ts`. Corre con cron `*/10 * * * *` (cada 10 min).

En cada tick:
1. Lee config de envío (`TEST_MODE`, `TEST_PHONE`) desde `AppConfig` (con fallback a env vars).
2. Busca hasta `WORKER_BATCH_SIZE` (50) entregas **debidas**:
   - `PENDING` con `scheduledAt <= ahora`, o
   - `FAILED` con `nextRetryAt <= ahora`.
3. Para cada una hace *claim* atómico (`PENDING/FAILED → QUEUED`) para evitar doble envío.
4. Valida un montón de condiciones de cancelación/omisión:
   - Plan `SUPERSEDED/CANCELLED` → cancela la entrega (salvo avisos especiales).
   - Plan `ARCHIVED` → omite.
   - Semana `CANCELLED/ARCHIVED` → cancela.
   - Asignación `CANCELLED` → cancela (salvo `CANCELLATION_NOTICE`).
   - Asignación `COMPLETED` → cancela (salvo avisos especiales).
   - Publicador inactivo/borrado/sin recibir → omite.
   - Sin teléfono válido → omite (o si `TEST_MODE` sin `TEST_PHONE`).
5. Determina el teléfono: en `TEST_MODE` usa `TEST_PHONE`; si no, `whatsappPhone || phone`.
6. Renderiza el mensaje con la plantilla (`template-renderer.ts`) y lo envía vía WhatsApp.
7. Registra `JwMessageLog`, actualiza estado (`SENT` o `FAILED`), programa reintento si toca.
   - Reintentos: 1º/2º a +10 min, 3º a +30 min. Tras `maxAttempts` (3) → `DEAD`.
8. Espera `WHATSAPP_SEND_DELAY_MS` entre envíos.

Cada transición deja un evento en `JwAutomationEvent` (QUEUED, SENDING, SENT, FAILED, RETRY_SCHEDULED, DEAD…).

---

## 8. Ciclo de vida tras crear la automatización

Lo gobierna `automation.service.ts` + `assignments.service.ts`:

- **Editar una asignación** (`updateAssignment`): si cambian campos relevantes (persona, tipo, fecha, etc.)
  **y ya tiene automatización**, se llama a `regenerateAssignmentAutomation`:
  supersede el plan activo, cancela entregas pendientes y crea un plan nuevo con `CHANGE_NOTICE`
  (avisa del cambio) + los recordatorios normales restantes (sin `INITIAL_NOTICE`).

- **Cancelar una asignación** (`cancelAssignment`): cancela entregas pendientes, marca el plan `CANCELLED`,
  y crea una entrega `CANCELLATION_NOTICE` para avisar a los implicados.

- **Completar una asignación** (`completeAssignment`): archiva la automatización (cancela pendientes,
  plan → `ARCHIVED`). Ya no se envía nada.

- **Versionado:** cada plan nuevo incrementa `version`; los anteriores quedan `SUPERSEDED`. Así hay
  trazabilidad histórica y el worker ignora entregas de planes obsoletos.

---

## 9. Mapa de endpoints (API REST)

Todas protegidas con `authMiddleware` salvo `/auth`. Prefijo `/api`.

| Recurso | Endpoint | Acción |
|---|---|---|
| Auth | `POST /auth/login` | Login (devuelve token) |
| Config | `GET /config` · `PUT /config` | Leer/guardar AppConfig (timezone, send hour, test) |
| Publicadores | `GET/POST/PUT/DELETE /publishers...` | CRUD de publicadores |
| Programas | `POST /monthly-schedules` | Crear programa mensual |
| Programas | `POST /monthly-schedules/:id/generate-weeks` | Generar semanas |
| Programas | `POST /monthly-schedules/:id/generate-assignments` | Auto-asignar (reparto simple) |
| Programas | `POST /monthly-schedules/:id/generate-proposal` | Propuesta inteligente (PROPOSED) |
| Programas | `POST /monthly-schedules/:id/approve-proposal` | Aprobar propuesta (→ DRAFT) |
| Programas | `POST /monthly-schedules/:id/generate-automations` | **Generar automatizaciones masivo** |
| Programas | `POST /monthly-schedules/:id/regenerate-pending` | Regenerar planes |
| Programas | `POST /monthly-schedules/:id/cancel-pending` | Cancelar entregas pendientes |
| Importar | `GET /imports/providers` · `POST /imports/preview` · `POST /imports/confirm` | Importar programa |
| Semanas | `GET/POST/PUT /meeting-weeks...` | Gestión de semanas |
| Asignaciones | `POST /assignments` · `PUT /assignments/:id` | Crear/editar asignación |
| Asignaciones | `POST /assignments/:id/generate-reminders` | **Generar automatización individual** |
| Asignaciones | `PATCH /assignments/:id/cancel` · `/complete` | Cancelar/completar |
| Centro Autom. | `GET /automation-center/overview` | Resumen operativo (hoy/mañana/fallidos) |
| Centro Autom. | `GET /automation-center` | Lista agrupada por día (con filtros) |
| Centro Autom. | `POST /automation-center/deliveries/:id/retry` · `/cancel` | Reintentar/cancelar entrega |
| WhatsApp | `GET/POST /whatsapp...` | Estado de sesión, QR |
| Plantillas | `GET/PUT /message-templates...` | Editar textos de mensajes |
| Historial | `GET /message-logs...` | Bitácora de envíos |

---

## 10. Configuración relevante (AppConfig + env)

| Clave | Por defecto | Efecto |
|---|---|---|
| `TIMEZONE` | `America/Mexico_City` | Zona horaria para calcular `scheduledAt`. |
| `REMINDER_SEND_HOUR` | `9` | Hora local a la que salen los avisos "X días antes" y "mismo día". |
| `TEST_MODE` | `false` | Si `true`, **todos** los mensajes van a `TEST_PHONE`. |
| `TEST_PHONE` | — | Número destino en modo prueba. |
| `WORKER_BATCH_SIZE` (env) | `50` | Entregas procesadas por tick. |
| `CRON_SCHEDULE` (env) | `*/10 * * * *` | Frecuencia del worker. |
| `WHATSAPP_SEND_DELAY_MS` | (shared) | Pausa entre envíos. |

---

## 11. Observaciones y puntos de atención (estado actual)

1. **La automatización es un paso explícito.** El usuario debe entender que crear/aprobar asignaciones
   NO envía nada hasta que pulsa *"Generar automatizaciones / recordatorios"*. Es el punto que más
   se presta a confusión operativa.

2. **El `INITIAL_NOTICE` es casi inmediato.** Sale en el siguiente tick del worker (≤10 min). Conviene
   tener la sesión de WhatsApp `READY` y el `TEST_MODE` bien configurado **antes** de generar, para no
   mandar avisos reales por error durante pruebas.

3. **Aprobar propuesta ≠ generar automatización.** Son dos pasos distintos. Tras aprobar (PROPOSED→DRAFT)
   todavía hay que generar automatizaciones.

4. **Modelos de recordatorio duplicados en el esquema.** Conviven `ReminderDelivery` (el modelo nuevo que
   usa el worker) y `JwAssignmentReminder` (modelo anterior). El worker y el flujo actual operan sobre
   `ReminderDelivery`. `JwAssignmentReminder` parece legado/transición — revisar si sigue siendo necesario
   (ver `docs/AUTOMATION-MODEL-FIX.md` y `docs/TECHNICAL-DEBT.md`).

5. **Idempotencia bien resuelta.** El *claim* atómico (`updateMany` PENDING→QUEUED), el `@@unique`
   por (plan, publicador, tipo) y el `skipDuplicates` evitan envíos duplicados. Bien.

6. **Auditoría sólida.** `JwAutomationEvent` registra prácticamente cada transición; es la mejor
   herramienta para depurar "por qué (no) se envió X".

7. **Dependencia de la sesión de WhatsApp.** Si la sesión cae (`DISCONNECTED`), las entregas fallarán y
   entrarán en reintento/`DEAD`. No hay (en el código revisado) un bloqueo previo que detenga la
   generación si WhatsApp no está listo; la verificación es manual (Paso 6).

8. **Requisito de 2+ publicadores** para `generate-assignments`; la propuesta avisa con *warnings* si no
   hay suficientes personas distintas o acompañantes.

---

## 12. Resumen en una frase

> Para crear una automatización: **registra publicadores → crea el programa del mes → genera/importa las
> semanas → consigue asignaciones con personas (manual, auto o propuesta+aprobación) → pulsa "Generar
> automatizaciones"**. Ese último paso crea el `AutomationPlan` y las `ReminderDelivery`, que el worker
> envía por WhatsApp cada 10 minutos; todo se supervisa en el **Centro de Automatizaciones**.
