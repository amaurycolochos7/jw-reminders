# Auditoría de Confiabilidad — Servicio de WhatsApp

> Estado: **AUDITORÍA (sin cambios de código)**. Este documento identifica causas raíz
> con evidencia (archivo, función, línea). No se implementó ninguna corrección.
> Fecha: 2026-07-03. Rama de código auditada: estado actual del repo local.

---

## 0. Resumen ejecutivo (TL;DR)

El sistema **NO garantiza "exactly once"**. En la práctica su semántica real es
**"cero o muchos"**: una entrega puede **perderse** (quedar atorada para siempre)
o **duplicarse** (reenviarse tras un envío físico real). Las dos causas raíz son:

1. **Duplicados** → El estado `SENT` depende del **resultado HTTP** de `sendWhatsappMessage`,
   no de una confirmación real de WhatsApp (ACK). No existe **clave de idempotencia**
   en la capa de envío. Si el mensaje **sí** se entrega pero el resultado se reporta
   como fallo (blip de red worker↔whatsapp, `fetch` sin timeout, o el conocido error
   "Evaluation failed" de `whatsapp-web.js` que ocurre *después* de encolar el mensaje),
   la entrega pasa a `FAILED` → se reintenta → **el destinatario recibe el mensaje otra vez**.

2. **Desconexiones** → El cliente Chromium se lanza con `--single-process` (flag
   oficialmente desaconsejado e inestable), **sin límite de memoria** en Docker.
   Un crash de Chromium o el OOM-killer del VPS derriba la sesión; el bucle de
   reconexión no distingue `LOGOUT`/conflicto de un blip transitorio y puede
   entrar en un ciclo de recrear Chromium → churn de memoria → más crashes.

3. **Atoradas / perdidas** → El worker solo re-escanea estados `PENDING` y `FAILED`.
   Los estados en vuelo `QUEUED` y `SENDING` **no tienen reaper**: si el proceso
   muere entre el claim y el estado final, la fila queda atorada indefinidamente
   y requiere intervención manual en la base de datos.

---

## 1. Arquitectura actual

```
AutomationPlan (API)  ── createAutomationPlanForAssignment()
        │                 apps/api/src/services/automation.service.ts
        │                 crea filas ReminderDelivery (status=PENDING) con skipDuplicates
        ▼
ReminderDelivery (DB, Postgres)  ── máquina de estados
        │                 packages/database/prisma/schema.prisma
        ▼
Worker (cron cada 10 min)  ── processReminders()
        │                 apps/worker/src/jobs/process-reminders.ts
        │                 findMany(PENDING|FAILED) → groupDeliveries → claimGroup → send
        ▼
whatsapp-client.ts (worker)  ── sendWhatsappMessage()  [HTTP POST /send]
        │                 apps/worker/src/services/whatsapp-client.ts
        ▼
WhatsApp Service (Express, puerto 3010)  ── POST /send → sendMessage()
        │                 apps/whatsapp/src/index.ts + services/message-sender.ts
        ▼
whatsapp-web.js  Client.sendMessage()
        │                 apps/whatsapp/src/client/whatsapp.ts
        ▼
Chromium (Puppeteer, headless, --single-process)
        │
        ▼
Persistencia de sesión: LocalAuth → volumen Docker `whatsapp_session`
                        montado en /app/apps/whatsapp/.wwebjs_auth
```

Servicios (docker-compose.yml): `db` (Postgres 16), `api`, `web`, `worker`, `whatsapp`.
El `worker` y el `whatsapp` son procesos **separados**; se comunican por HTTP interno
(`WHATSAPP_API_URL=http://jw-reminders-whatsapp:3010`).

---

## 2. Flujo real (verificado)

### 2.1 Generación de entregas (API)
`createAutomationPlanForAssignment()` (automation.service.ts) crea un `AutomationPlan`
y luego `buildDeliveryRows()` genera filas `ReminderDelivery` con
`createMany({ data, skipDuplicates: true })`. El `@@unique([automationPlanId, publisherId, reminderType])`
en el schema impide **filas** duplicadas. Reglas:
- Asignado: `INITIAL_NOTICE`, `SEVEN_DAYS_BEFORE`, `THREE_DAYS_BEFORE`, `ONE_DAY_BEFORE`.
- Acompañante: `INITIAL_NOTICE`, `THREE_DAYS_BEFORE`, `ONE_DAY_BEFORE`.
- Las ventanas ya vencidas al generar se omiten (salvo `INITIAL_NOTICE`, que es inmediato).

### 2.2 Procesamiento (Worker) — `processReminders()`
1. `getSendConfig()` lee `TEST_MODE`/`TEST_PHONE` de `AppConfig` + jitter y tope por tick.
2. `findMany` de vencidos:
   ```
   OR: [
     { status: "PENDING", scheduledAt: { lte: now } },
     { status: "FAILED",  nextRetryAt: { lte: now } },
   ]  take: BATCH_SIZE (50)
   ```
   **Solo `PENDING` y `FAILED`.** Nunca vuelve a mirar `QUEUED` ni `SENDING`.
3. `groupDeliveries()` agrupa por `publisherId|meetingWeekId|reminderType`
   (excepción: `INITIAL_NOTICE` se agrupa por persona+mes).
4. Por grupo: `claimGroup()` → para cada fila `updateMany where {id, status:<esperado>} → QUEUED`.
   Solo la fila que transiciona obtiene `count===1` (claim atómico por fila).
5. Refetch de reclamados → `validateFresh()` (estados terminales, dedup del primer aviso).
6. Envío según tipo:
   - `INITIAL_NOTICE` → `performMonthlyInitialSend()` (1 mensaje mensual por persona).
   - Recordatorio normal → `performGroupedSend()` (1 mensaje por persona/semana/bucket).
   - Aviso especial o `customMessage` → `performSingleSend()`.
7. Cada `performXSend`:
   `updateMany → SENDING` → `sendWhatsappMessage()` (HTTP) → `recordDeliveryAudit()`
   (JwMessageLog + upsert NotificationLog) → `finalizeDeliveryStatus()` (SENT/FAILED/DEAD).

### 2.3 Máquina de estados real de `ReminderDelivery`

```
                      claimGroup()            performXSend()          finalizeDeliveryStatus()
 PENDING ───────────────▶ QUEUED ───────────────▶ SENDING ───────────────▶ SENT
    ▲                        │                        │                       │ (result.success=true)
    │ send-now / reschedule  │ (crash aquí:           │ (crash aquí:          │
    │ (API pone PENDING)     │  ATORADA, sin reaper)  │  ATORADA, sin reaper) │
    │                        ▼                        ▼                       │
  FAILED ◀───────────────────────────────────────────────────────────────────┘
    │  (result.success=false; nextRetryAt = now + 10/30 min)   ── reintento → DUPLICADO posible
    │
    └──▶ DEAD (attemptCount ≥ maxAttempts)
Otros terminales: SKIPPED, CANCELLED (validateFresh / API).
```

Punto crítico: **`SENT` se escribe DESPUÉS del resultado HTTP**, y ese resultado
proviene de la resolución de `Client.sendMessage()`, **no de un ACK real de WhatsApp**.
Además, `recordDeliveryAudit()` y `finalizeDeliveryStatus()` **no están en una
transacción**: son escrituras separadas (posible estado parcial).

---

## 3. Causa raíz de las desconexiones

**No es un solo culpable; es una combinación. Ranking por probabilidad:**

### 3.1 (ALTA) `--single-process` en Chromium
`apps/whatsapp/src/client/whatsapp.ts` → `createClient()`, `puppeteer.args`:
```
"--single-process",
"--no-zygote",
```
`--single-process` está **oficialmente desaconsejado** para Puppeteer/whatsapp-web.js:
mete render + browser en un solo proceso, lo que lo hace frágil ante picos de memoria
y provoca cierres del navegador ("Target closed", "Protocol error"). Cuando Chromium
cae, `whatsapp-web.js` emite `disconnected` → el sistema cree que "WhatsApp se
desconectó" cuando en realidad **fue el navegador el que se cayó**. Este es el
sospechoso principal de las caídas aparentemente aleatorias.

### 3.2 (ALTA) Sin límite de memoria + Chromium pesado + VPS pequeño
`docker-compose.yml`: el servicio `whatsapp` **no tiene `mem_limit` ni
`deploy.resources.limits`**. Chromium consume cientos de MB; con `--single-process`
y sin cgroup limit, un pico lleva al **OOM-killer del host** a matar el proceso o
el contenedor. Como `restart: unless-stopped`, el contenedor reinicia → nueva
`initialize()` → ventana de indisponibilidad y, si la sesión quedó a medio escribir,
posible corrupción.

### 3.3 (MEDIA) Bucle de reconexión que no distingue el motivo
`setupListeners()` → `c.on("disconnected", reason => { if (!manualStop) scheduleReconnect(...) })`.
El `reason` se registra pero **no se usa para decidir**. Si WhatsApp emite
`disconnected` con motivo `LOGOUT` o por **conflicto de sesión** (dispositivo
vinculado revocado / abierto en otro lado), el código lo trata igual que un blip
transitorio: `destroy()` + `createClient()` + `initialize()` en bucle (backoff
tope 60 s). Resultado: **regenera QR repetidamente** y **recrea Chromium sin
parar** → más churn de memoria → alimenta 3.1/3.2. Esto explica el "hay que
volver a escanear el QR constantemente".

### 3.4 (MEDIA) Corrupción de sesión por cierre no limpio
`cleanChromiumLocks()` borra archivos `Singleton*` al arrancar/reconectar porque
"quedan tras un apagado no limpio". Esto confirma que **hay apagados no limpios
frecuentes** (kill sin SIGTERM graceful). Si el kill ocurre mientras LocalAuth
escribe el estado de sesión en el volumen, la sesión puede corromperse → al
reiniciar pide QR de nuevo.

### 3.5 Persistencia de sesión — ¿se pierde al reiniciar?
- **Configuración correcta en prod**: volumen nombrado `whatsapp_session` →
  `/app/apps/whatsapp/.wwebjs_auth`, y `WHATSAPP_SESSION_PATH` apunta al mismo path.
  En un reinicio **normal**, la sesión **persiste**.
- **Riesgos reales de pérdida**: (a) corrupción por 3.4; (b) invalidación del lado
  de WhatsApp (revocación de dispositivo vinculado); (c) si un redeploy en Dokploy
  recrea/renombra el volumen, la sesión se pierde (verificar en el panel que el
  volumen es persistente y no efímero).

**Cómo distinguir el motivo real (no asumir):** cada transición queda en
`JwWhatsappSessionLog(status, message, createdAt)` (ver `logStatus()`). El `message`
de un evento `DISCONNECTED` contiene el `reason` de whatsapp-web.js. Consultar:
```sql
SELECT "createdAt", status, message
FROM "JwWhatsappSessionLog"
ORDER BY "createdAt" DESC LIMIT 100;
```
Si el `message` dice `LOGOUT`/`CONFLICT` → 3.3 (sesión/conflicto). Si son ciclos
`STARTING→DISCONNECTED` con "Initialize timeout"/"Init failed" → 3.1/3.2 (Chromium/OOM).
Correlacionar con reinicios del contenedor (`docker ps`/eventos de Dokploy) y con
memoria del host.

---

## 4. Causa raíz de los mensajes duplicados

### 4.1 (RAÍZ PRINCIPAL) Semántica "at-least-once" sin idempotencia en el envío
Flujo (process-reminders.ts → whatsapp-client.ts → message-sender.ts):
- El estado pasa a `SENT` **solo si** `sendWhatsappMessage()` devuelve `success:true`.
- `sendWhatsappMessage()` (`apps/worker/src/services/whatsapp-client.ts`) hace
  `fetch(WHATSAPP_API_URL + "/send")` **sin timeout** y devuelve `success:false`
  ante cualquier error HTTP/red.
- El servicio WhatsApp (`message-sender.ts` → `sendMessage()`) llama
  `client.sendMessage(chatId, message)`.

**El fallo:** existe una ventana donde WhatsApp **entrega físicamente** el mensaje
pero el worker recibe un **falso negativo**:
- El `fetch` se corta / hace timeout **después** de que el servicio ya llamó a
  `client.sendMessage` (o mientras responde).
- `whatsapp-web.js` lanza "Evaluation failed"/"Protocol error" **después** de
  encolar el mensaje en la web (bug conocido de la librería).

En ese caso `finalizeDeliveryStatus()` escribe `FAILED` + `nextRetryAt` → el
siguiente tick reintenta la **misma** entrega → **duplicado real**. No hay clave
de idempotencia enviada a WhatsApp ni verificación de "¿ya envié esto físicamente?".

Evidencia (process-reminders.ts, `finalizeDeliveryStatus`):
```ts
if (result.success) { ...status: "SENT"... }
else {
  const nextRetryAt = terminalFailure ? null : new Date(Date.now() + retryDelayMs(...));
  ...status: failedStatus, nextRetryAt...   // ← reintento del mismo mensaje
}
```

### 4.2 (AMPLIFICA #4.1) La deduplicación con NotificationLog NO cubre recordatorios
`validateFresh()` solo bloquea el reenvío cuando:
```ts
if (notif.type === "FIRST_ASSIGNMENT") {
  const already = await prisma.notificationLog.findUnique({...});
  if (already && already.status === "SENT") { markSkipped(...); return false; }
}
```
- Los recordatorios (`7/3/1 días`, `SAME_DAY`) tienen `notif.type === "REMINDER"`
  → **nunca** pasan por este guard → un falso negativo de un recordatorio **siempre
  reenvía**.
- Incluso para `FIRST_ASSIGNMENT`, el guard solo ayuda si el **primer** intento
  registró `SENT`. En el escenario 4.1 el primer intento registra `FAILED`
  (aunque el mensaje se entregó), así que el guard **no evita** ese duplicado.

### 4.3 (AMPLIFICA #4.1) El envío agrupado multiplica el duplicado
`performGroupedSend()` y `performMonthlyInitialSend()` envían **un** mensaje físico
por **N** entregas y comparten el mismo `result`. Si ese único envío es un falso
negativo, **las N entregas** pasan a `FAILED` y **todo el grupo se reenvía** → la
persona recibe de nuevo el resumen completo (mensual o de la semana).

### 4.4 Estado nunca cambió a SENT / error de commit
`recordDeliveryAudit()` (escribe JwMessageLog con `status: SENT` + upsert
NotificationLog) y `finalizeDeliveryStatus()` (escribe ReminderDelivery→SENT)
**no comparten transacción**. Si el proceso muere entre ambas:
- Puede existir un `JwMessageLog(status=SENT)` mientras `ReminderDelivery` sigue en
  `SENDING` (atorada). En un análisis posterior parece "enviado pero pendiente".
- No hay duplicado por sí solo, pero contribuye a la incertidumbre de estado.

### 4.5 Conclusión de duplicados
La causa exacta más probable de los duplicados observados es **4.1 + 4.2/4.3**:
un envío físico exitoso reportado como fallo (red o whatsapp-web.js), que reintenta
sin ninguna barrera de idempotencia porque el dedup no aplica a recordatorios.

---

## 5. Riesgos encontrados (catálogo)

| # | Riesgo | Severidad | Archivo / función | Efecto |
|---|--------|-----------|-------------------|--------|
| R1 | `SENT` atado al resultado HTTP, no a ACK; sin idempotencia | **Crítico** | process-reminders.ts `finalizeDeliveryStatus`, whatsapp-client.ts | Duplicados |
| R2 | Dedup NotificationLog no cubre recordatorios | **Crítico** | process-reminders.ts `validateFresh` | Duplicados |
| R3 | Sin reaper de `QUEUED`/`SENDING`; findMany solo `PENDING`/`FAILED` | **Crítico** | process-reminders.ts `processReminders` | Atoradas/perdidas |
| R4 | `--single-process` en Chromium | **Alto** | whatsapp.ts `createClient` | Desconexiones/crashes |
| R5 | Sin `mem_limit` en el servicio whatsapp | **Alto** | docker-compose.yml | OOM → caída de sesión |
| R6 | Reconexión ignora el `reason` (logout/conflicto tratados como blip) | **Alto** | whatsapp.ts `on("disconnected")`, `scheduleReconnect` | Loop de reconexión / QR repetido |
| R7 | `fetch` sin timeout en el worker | **Alto** | whatsapp-client.ts | Falsos negativos → R1 |
| R8 | Audit + estado final sin transacción | **Medio** | process-reminders.ts | Estado inconsistente |
| R9 | node-cron no evita solape (ticks concurrentes si run > 10 min) | **Medio** | worker/src/index.ts | Carga doble (claim atómico lo protege de duplicar) |
| R10 | Logs de envío físico solo en stdout, no persistidos | **Medio** | message-sender.ts `console.log` | Imposible probar duplicado físico desde DB |
| R11 | Cierres no limpios corrompen sesión (evidencia: cleanChromiumLocks) | **Medio** | whatsapp.ts | Re-escaneo de QR |
| R12 | `restartSession`/`generateQR` no reprograman auto-reconexión tras fallo | **Bajo** | whatsapp.ts | Puede quedar DISCONNECTED sin reintento |

---

## 6. Evidencias (ubicaciones exactas)

- **Estado SENT tras HTTP, no ACK** — `apps/worker/src/jobs/process-reminders.ts`,
  `performSingleSend` / `performGroupedSend` / `performMonthlyInitialSend` →
  `sendWhatsappMessage(...)` → `finalizeDeliveryStatus(fresh, result)`.
- **fetch sin timeout** — `apps/worker/src/services/whatsapp-client.ts`,
  `sendWhatsappMessage()` (no hay `AbortController`/`signal`).
- **Dedup solo primer aviso** — `process-reminders.ts`, `validateFresh()`,
  bloque `if (notif.type === "FIRST_ASSIGNMENT")`.
- **findMany solo PENDING/FAILED (sin reaper)** — `process-reminders.ts`,
  `processReminders()`, cláusula `where.OR`.
- **claim atómico por fila** — `process-reminders.ts`, `claimGroup()`
  (`updateMany where {id, status} → QUEUED`, comprueba `count===1`).
- **Chromium single-process** — `apps/whatsapp/src/client/whatsapp.ts`,
  `createClient()`, array `puppeteer.args`.
- **Reconexión ignora reason** — `whatsapp.ts`, `setupListeners()` →
  `c.on("disconnected", ...)` y `scheduleReconnect()`.
- **Persistencia de sesión** — `docker-compose.yml` servicio `whatsapp`:
  `volumes: whatsapp_session:/app/apps/whatsapp/.wwebjs_auth` +
  `WHATSAPP_SESSION_PATH`. Dockerfile: `VOLUME ["/app/apps/whatsapp/.wwebjs_auth"]`.
- **Sin mem_limit** — `docker-compose.yml` (ningún `mem_limit`/`deploy.resources`).
- **Logs persistidos disponibles** — schema `JwWhatsappSessionLog`,
  `JwMessageLog`, `JwAutomationEvent`.
- **send-now API** — `apps/api/src/modules/automation-center/automation-center.routes.ts`
  `POST /deliveries/:id/send-now` (solo permite desde `PENDING`/`FAILED` vía
  `canSendNow`; **no** toca `QUEUED`/`SENDING`, por lo que no introduce doble envío
  por sí mismo).

---

## 7. Archivos involucrados

**Servicio WhatsApp**
- `apps/whatsapp/src/client/whatsapp.ts` — ciclo de vida del cliente, reconexión.
- `apps/whatsapp/src/services/message-sender.ts` — resolución de WID + `sendMessage`.
- `apps/whatsapp/src/index.ts` — API Express `/send`, `/status`, `/restart`, `/generate-qr`.
- `apps/whatsapp/Dockerfile` — Chromium, volumen de sesión.

**Worker**
- `apps/worker/src/jobs/process-reminders.ts` — orquestación, claim, envío, estados.
- `apps/worker/src/services/whatsapp-client.ts` — cliente HTTP hacia el servicio.
- `apps/worker/src/services/grouping.ts` — agrupación por persona/semana/bucket.
- `apps/worker/src/index.ts` — cron cada 10 min.

**API / dominio**
- `apps/api/src/services/automation.service.ts` — generación de AutomationPlan/deliveries.
- `apps/api/src/modules/automation-center/automation-center.routes.ts` — send-now/reschedule.
- `packages/shared/src/notifications/index.ts` — clasificación/dedup keys.

**Datos / infra**
- `packages/database/prisma/schema.prisma` — modelos y unique/índices.
- `docker-compose.yml` — servicios, volúmenes, (ausencia de) límites.

---

## 8. Diagrama del ciclo de vida del cliente WhatsApp

```
                        ┌───────────────────────────────────────────────┐
                        │              initWhatsApp() (arranque)          │
                        │  manualStop=false → cleanChromiumLocks()        │
                        │  → logStatus(STARTING)                          │
                        │  → initializeWithTimeout(90s)                   │
                        └───────────────────────┬─────────────────────────┘
                                                │
                 ┌──────────────┬───────────────┼───────────────┬───────────────┐
                 ▼              ▼               ▼               ▼               ▼
             on("qr")    on("authenticated") on("ready")  on("auth_failure")  timeout/throw
             QR_REQUIRED  AUTHENTICATED       READY         FAILED             DISCONNECTED
                 │                              │                                 │
       (escanear QR)         connectedNumber=info.wid  ── (envíos permitidos      │
                                                          solo si status==READY)  │
                                                                                  ▼
                                                                        scheduleReconnect()
                                                                        (si !manualStop)
                                                                        backoff 5→60s:
                                                                        destroy()+createClient()
                                                                        +initializeWithTimeout()
                                                                                  │
                        on("disconnected", reason) ──────────────────────────────┘
                        (reason NO se evalúa: LOGOUT/CONFLICT tratados igual)

  Rutas manuales:
   restartSession()  → destroy + createClient + initialize      (manualStop=false)
   disconnectSession() → logout/destroy → manualStop=TRUE        (corta reconexión)
   generateQR()      → logout/destroy + createClient + initialize
```

**Observaciones del ciclo de vida:**
- `destroy()` en la reconexión está envuelto en `try/catch {}` — si falla, puede
  dejar un **Chromium zombi**; sumado a `--single-process`, aumenta el consumo.
- Tras un `logout` real de WhatsApp, whatsapp-web.js **no** permite re-`initialize`
  sobre la misma instancia; por eso siempre se recrea el cliente (correcto), pero
  el loop no se detiene aunque el motivo sea irrecuperable sin QR.

---

## 9. Recomendaciones (para la fase de Hardening; NO implementadas)

> Ordenadas por impacto/esfuerzo. Cada una ataca una causa raíz concreta.
> **Pendiente de tu aprobación antes de tocar código.**

### 9.1 Idempotencia real de envío (ataca R1, R2, R3) — prioridad máxima
- Introducir un **estado y una barrera de idempotencia** por entrega:
  - Reclamar a `SENDING` con `lastAttemptAt` **antes** de llamar a WhatsApp (ya se hace).
  - Enviar al servicio WhatsApp un **`idempotencyKey`** (p. ej. `reminderDeliveryId`
    o hash `deliveryId:attemptCount`). El servicio mantiene un registro
    (tabla o cache) de claves ya enviadas físicamente y, si llega de nuevo,
    **no reenvía**: devuelve el `messageId` previo.
  - Alternativa/《complemento》: patrón **outbox + confirmación por ACK**
    (`message_ack` de whatsapp-web.js) en lugar de confiar en la resolución de
    `sendMessage`.
- Ampliar el guard de `NotificationLog` para **cubrir recordatorios** (no solo
  el primer aviso): antes de enviar, si ya existe `status=SENT` para esa
  `notificationKey`, marcar `SKIPPED`.

### 9.2 Reaper de estados en vuelo (ataca R3) — alta prioridad
- Job periódico que rescate filas `SENDING`/`QUEUED` con `lastAttemptAt`/`updatedAt`
  más antiguo que un umbral (p. ej. 15 min). Antes de reintentar, **verificar
  idempotencia** (9.1) para no duplicar lo que sí se envió.
- Incluir `SENDING`/`QUEUED` vencidos en la reconciliación, no en el `findMany`
  normal de envío.

### 9.3 Timeout + reintento acotado en el HTTP worker↔whatsapp (ataca R7)
- `AbortController` con timeout explícito en `sendWhatsappMessage()`.
- Distinguir "error de transporte" (no sé si se envió → NO marcar FAILED ciego;
  dejar en `SENDING` para reconciliación) de "rechazo explícito" (número inválido).

### 9.4 Estabilizar Chromium (ataca R4, R5, R11)
- **Quitar `--single-process`** (y evaluar `--no-zygote`). Es el cambio de mayor
  impacto para las caídas.
- Añadir `mem_limit`/`deploy.resources.limits` al servicio `whatsapp` y un
  `healthcheck` real (que `/status` refleje READY).
- Garantizar apagado graceful (SIGTERM → `destroy()`) para no corromper sesión.

### 9.5 Reconexión consciente del motivo (ataca R6, R12)
- Evaluar `reason` en `on("disconnected")`: `LOGOUT`/conflicto → **no** entrar en
  loop infinito; poner estado accionable (`QR_REQUIRED`/`FAILED`) y notificar.
- Backoff con tope de intentos antes de exigir intervención; métricas de reconexión.

### 9.6 Transaccionalidad y trazabilidad (ataca R8, R10)
- Envolver `recordDeliveryAudit` + `finalizeDeliveryStatus` en una transacción
  (o escribir primero el estado terminal y luego el audit idempotente).
- Persistir el resultado físico del envío (incluido `providerMessageId`) **también
  en fallos aparentes**, para poder reconstruir duplicados desde la DB.

### 9.7 Serializar el cron (ataca R9)
- Guard de "run en curso" (lock/flag) para que un tick no arranque si el anterior
  sigue corriendo.

---

## 10. Reconstrucción forense (respuesta a la pregunta 10)

**¿Se puede reconstruir exactamente qué pasó cuando un mensaje se envió dos veces?**
**Parcialmente.** Fuentes persistidas hoy:
- `JwAutomationEvent` — línea de tiempo con timestamps:
  `REMINDER_QUEUED → REMINDER_SENDING → REMINDER_SENT/REMINDER_FAILED/REMINDER_RETRY_SCHEDULED`.
- `JwMessageLog` — un registro por intento (`status`, `providerMessageId`, `sentAt`).
- `JwWhatsappSessionLog` — transiciones de sesión (con el `reason` en `message`).

**Limitación clave:** en el escenario de duplicado (4.1), el primer intento se
registra como `FAILED` con `providerMessageId = null` **aunque el mensaje se haya
entregado**. Por tanto, **desde la base de datos NO se puede probar** que hubo un
envío físico en ese intento fallido; solo el `console.log("[WhatsApp] Enviado a ...")`
del contenedor lo demostraría, y ese log **no se persiste** (stdout, se pierde en
redeploy salvo retención de Dokploy). Conclusión: la reconstrucción es **incompleta
justo para el modo de fallo que causa los duplicados** → refuerza la recomendación
9.6 (persistir resultado físico) y 9.1 (idempotencia con messageId reutilizable).

**Consulta de arranque para un caso concreto** (por entrega):
```sql
SELECT e."createdAt", e."eventType", e.metadata
FROM "JwAutomationEvent" e
WHERE e."entityType"='ReminderDelivery' AND e."entityId"=$1
ORDER BY e."createdAt";

SELECT * FROM "JwMessageLog" WHERE "reminderDeliveryId"=$1 ORDER BY "createdAt";
```

---

## 11. Plan de corrección priorizado (para aprobar)

| Fase | Objetivo | Cambios (resumen) | Riesgo residual que elimina |
|------|----------|-------------------|-----------------------------|
| **H1** | Cortar duplicados | 9.1 (idempotencyKey + dedup de recordatorios) + 9.3 (no marcar FAILED en error de transporte) | R1, R2, R7 |
| **H2** | Cortar "atoradas" | 9.2 (reaper de SENDING/QUEUED con verificación idempotente) | R3 |
| **H3** | Estabilizar sesión | 9.4 (quitar single-process, mem_limit, graceful shutdown) | R4, R5, R11 |
| **H4** | Reconexión robusta | 9.5 (evaluar reason, backoff con tope, alertas) | R6, R12 |
| **H5** | Trazabilidad total | 9.6 (transacción + persistir resultado físico) + 9.7 (serializar cron) | R8, R9, R10 |

**Criterio de "servicio empresarial" (metas verificables tras H1–H5):**
- Ningún envío duplicado ante falso negativo (probado inyectando fallo post-envío).
- Ninguna entrega atorada > umbral (reaper la reconcilia).
- Sesión estable semanas sin re-escaneo salvo revocación real de WhatsApp.
- Cada duplicado/pérdida reconstruible 100% desde la DB.

---

## Apéndice — Verificación en producción (opcional, requiere tu OK)

Para confirmar el motivo real de desconexión con datos vivos (no asumir), se puede,
con tu autorización, correlacionar en el VPS:
1. `JwWhatsappSessionLog` (motivos `DISCONNECTED`).
2. Eventos de reinicio del contenedor `jw-reminders-whatsapp` en Dokploy.
3. Uso de memoria del host / registros del OOM-killer (`dmesg`).
4. `docker logs jw-reminders-whatsapp` para ver los `[WhatsApp] Enviado a ...`
   y correlacionar con los `FAILED` de la DB (probar el falso negativo de 4.1).

> Nota de seguridad: las credenciales SSH/Dokploy que compartiste son sensibles y
> temporales. Recomiendo **rotarlas** después de esta fase. No las incluyo en este
> documento.
