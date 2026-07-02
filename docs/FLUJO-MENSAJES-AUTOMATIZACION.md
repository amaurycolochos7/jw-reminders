# Flujo de mensajes al generar automatizaciones de una semana

> Documento de referencia sobre **qué mensajes se envían, a quién, cuándo y qué dice cada uno** cuando se generan las automatizaciones de una semana.
>
> Basado en el código real del sistema:
> - `apps/api/src/services/automation.service.ts` (generación de planes y entregas)
> - `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` (`generateWeekAutomations`)
> - `apps/api/src/services/date-utils.ts` (`calculateReminderScheduledAt`, cálculo de horarios)
> - `apps/worker/src/jobs/process-reminders.ts` (envío real por el worker)
> - `packages/database/prisma/seed.ts` (textos de plantillas por defecto)
> - `packages/shared/src/grouped-message/index.ts` (mensaje agrupado)

---

## 1. Resumen en una frase

Al pulsar **"Generar automatizaciones"** en una semana, el sistema **NO envía mensajes de inmediato** (salvo el *aviso inicial*). Lo que hace es **crear y programar** todos los recordatorios (`ReminderDelivery`) en la base de datos con una fecha/hora exacta. Luego, un **worker que corre cada 10 minutos** revisa cuáles ya vencieron y los envía por WhatsApp.

---

## 2. Cuándo se generan (el disparador)

La generación por semana ocurre al llamar:

```
POST /meeting-weeks/:id/generate-automations
```

Esto ejecuta `generateWeekAutomations(id)`, que recorre **todas las asignaciones de esa semana** y para cada una:

- **Se salta** las asignaciones con estado `CANCELLED`, `COMPLETED` o `PROPOSED`.
- **Se salta** las que ya tienen un plan `ACTIVE` (no duplica).
- Para el resto, crea un **AutomationPlan** y genera sus recordatorios.
- Al generar al menos un plan, la semana pasa a estado **`ACTIVE`**.

> Nota: una asignación **propuesta** (`PROPOSED`) debe aprobarse antes de poder generar sus automatizaciones.

---

## 3. Qué mensajes se crean por cada asignación

Cada asignación tiene **una persona asignada (principal)** y, opcionalmente, un **acompañante**. Para **evitar el envío masivo que dispara los baneos de WhatsApp**, el sistema genera **solo 2 recordatorios** por persona:

| Tipo de recordatorio | Persona asignada (principal) | Acompañante |
|---|:---:|:---:|
| `INITIAL_NOTICE` – Aviso inicial | ✅ | ✅ |
| `ONE_DAY_BEFORE` – 1 día antes | ✅ | ✅ |

- **Principal:** recibe **2** recordatorios (aviso inicial + 1 día antes).
- **Acompañante:** recibe **2** recordatorios (aviso inicial + 1 día antes).

> Se **eliminaron** a propósito los recordatorios de **7 días antes**, **3 días antes** y **mismo día** para reducir la cantidad de mensajes y el riesgo de baneo.
>
> Referencia en código: `ASSIGNED_RULES` y `COMPANION_RULES` en `automation.service.ts`.

---

## 4. Cuándo se envía cada mensaje (programación de horarios)

El cálculo lo hace `calculateReminderScheduledAt`. La hora de envío se toma de la configuración:

- **Zona horaria (`TIMEZONE`):** por defecto `America/Mexico_City`.
- **Hora de envío (`REMINDER_SEND_HOUR`):** por defecto **09:00**.

| Tipo | Momento programado |
|---|---|
| `INITIAL_NOTICE` | **Inmediato** (al generar la automatización), pero **escalonado** por el worker (ver sección 5) |
| `ONE_DAY_BEFORE` | 1 día antes de la reunión, a la hora de envío (09:00) |
| `CHANGE_NOTICE` (cambio) | **Inmediato** (al editar una asignación con automatización activa) |
| `CANCELLATION_NOTICE` (cancelación) | **Inmediato** (al cancelar la asignación) |

### Ejemplo concreto (semana del 6 jul 2026 — reunión el 10 jul 2026 a las 15:00)

Con hora de envío por defecto (09:00), tanto el **principal** como el **acompañante** recibirían:

| Recordatorio | Fecha y hora de envío |
|---|---|
| Aviso inicial | Al generar (escalonado por el worker) |
| 1 día antes | jue 9 jul 2026, 09:00 |

---

## 5. Cómo se envían realmente (el worker) + anti-baneo

- El worker corre según `CRON_SCHEDULE`, por defecto **cada 10 minutos** (`*/10 * * * *`).
- En cada ejecución busca entregas **vencidas**: `PENDING` con `scheduledAt <= ahora`, o `FAILED` cuyo `nextRetryAt <= ahora`.

### Estrategia anti-baneo (inspirada en el sistema cedgym)

Para no enviar todos los mensajes de golpe (lo que puede provocar el baneo del número de WhatsApp), el worker aplica **dos mecanismos**:

1. **Jitter aleatorio entre mensajes.** En lugar de una pausa fija, espera un tiempo **aleatorio** entre cada envío. Por defecto entre **6 y 15 segundos** (`randomSendDelayMs`). Un patrón variable parece más humano que un intervalo exacto.
2. **Tope de envíos por tick.** Cada ejecución del worker envía **como máximo N mensajes** (por defecto **8**, `WORKER_MAX_SENDS_PER_RUN`). Si al generar una semana completa se programan muchos avisos iniciales a la vez, **no se mandan todos juntos**: se envían hasta el tope y el resto queda `PENDING` para los siguientes ticks (cada 10 min).

**Ejemplo:** una semana genera 20 avisos iniciales al mismo tiempo. Con tope de 8 por tick, se envían ~8 en el primer tick, ~8 en el segundo (10 min después) y ~4 en el tercero. El burst de 20 mensajes se reparte en ~30 minutos, con 6–15 s entre cada uno.

### Parámetros configurables (variables de entorno del worker)

| Variable | Por defecto | Función |
|---|---|---|
| `WHATSAPP_SEND_DELAY_MIN_MS` | 6000 | Pausa mínima entre mensajes (ms) |
| `WHATSAPP_SEND_DELAY_MAX_MS` | 15000 | Pausa máxima entre mensajes (ms) |
| `WORKER_MAX_SENDS_PER_RUN` | 8 | Máximo de mensajes por ejecución del worker |
| `WORKER_BATCH_SIZE` | 50 | Máximo de entregas leídas por consulta |
| `CRON_SCHEDULE` | `*/10 * * * *` | Frecuencia del worker |

> Estos valores se leen en cada ejecución, así que se pueden ajustar sin cambiar el código (solo variables de entorno). Un mensaje agrupado (una persona con varias partes) cuenta como **1** envío para el tope.

### Reintentos
- Si el envío falla, se reintenta: los primeros 2 intentos a los **10 minutos**, luego cada **30 minutos**.
- Tras agotar `maxAttempts`, la entrega queda como **`DEAD`** (no se reintenta más).

### Validaciones antes de enviar (se omite/cancela si…)
- El plan de automatización fue reemplazado, cancelado o archivado.
- La semana está cancelada o archivada.
- La asignación fue cancelada o completada.
- El publicador está inactivo, eliminado o no puede recibir asignaciones.
- **Deduplicación:** el *aviso inicial* (`FIRST_ASSIGNMENT`) se envía **una sola vez** por (asignación, persona). Los recordatorios sí se permiten repetir por tipo.

### Modo prueba (`TEST_MODE`)
Con `TEST_MODE=true`, **todos** los mensajes se envían al número `TEST_PHONE` en lugar de a los números reales de los publicadores. Útil para probar sin molestar a nadie.

---

## 6. Mensaje agrupado (cuando una persona tiene varias partes)

Si una misma persona tiene **2 o más asignaciones en la misma semana** y coinciden en el mismo tipo de recordatorio (mismo "bucket"), el worker envía **UN SOLO mensaje combinado** en lugar de varios sueltos.

- Se agrupan por `publisherId | semana | tipo de recordatorio`.
- Las partes se listan **ordenadas por el orden del programa**.
- **Excepciones** (se envían individuales, con su plantilla propia): avisos de **cambio** y **cancelación**, y cualquier entrega con un mensaje personalizado (`customMessage`).

### Formato del mensaje agrupado

Con **varias** partes:
```
Hola [Nombre].
Estas son sus asignaciones para la reunión del [fecha]:
• [Parte 1].
• [Parte 2].
Hora de reunión: [hora].
```

Con **una sola** parte (equivalente individual, sin viñetas):
```
Hola [Nombre].
Le recordamos su asignación para la reunión del [fecha]:
[Título de la asignación].
Hora de reunión: [hora].
```

> Este texto agrupado es más simple que las plantillas de la sección 7. Las plantillas ricas se usan para envíos individuales (1 sola parte, avisos especiales o mensajes personalizados).

---

## 7. Qué dice cada mensaje (plantillas por defecto)

Estos son los textos base (editables desde el panel en **Plantillas**). Las variables `{{...}}` se rellenan con los datos reales de la asignación.

> **Nota:** actualmente el sistema **solo envía** el *Aviso inicial* (7.1 / 7.2) y el recordatorio de *1 día antes* (7.5). Las plantillas de **7 días** (7.3), **3 días** (7.4) y **mismo día** (7.6) siguen existiendo pero **ya no se generan ni se envían** (se conservan aquí solo como referencia).

### 7.1. Aviso inicial — Principal (`INITIAL_NOTICE_ASSIGNED`)
```
Saludos, {{assignedName}}.

Se le ha asignado la siguiente participación:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Duración: {{duration}}
Contexto: {{context}}
Referencia: {{reference}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Acompañante: {{companionName}}

Por favor confirme que recibió este aviso.
Cualquier duda o inconveniente, comuníquese con anticipación.
```

### 7.2. Aviso inicial — Acompañante (`INITIAL_NOTICE_COMPANION`)
```
Saludos, {{companionName}}.

Ha sido asignado(a) como acompañante de {{assignedName}}:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Contexto: {{context}}

Por favor coordínense para la presentación.
```

### 7.3. Recordatorio 7 días (`SEVEN_DAYS_BEFORE`)
```
Saludos, {{assignedName}}.

Le recordamos que en una semana tiene la siguiente participación:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}}
Sala: {{room}}
Referencia: {{reference}}

Le animamos a prepararse con tiempo.
```

### 7.4. Recordatorio 3 días (`THREE_DAYS_BEFORE`)
```
Saludos, {{assignedName}}.

Su participación es en 3 días:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}
Acompañante: {{companionName}}

Si tiene algún inconveniente, avísenos con la mayor brevedad posible.
```

### 7.5. Recordatorio 1 día (`ONE_DAY_BEFORE`)
```
Saludos, {{assignedName}}.

Mañana tiene su participación en la reunión:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}

Le deseamos éxito. Recuerde llegar puntual.
```

### 7.6. Recordatorio mismo día (`SAME_DAY`)
```
Saludos, {{assignedName}}.

Hoy es su participación en la reunión:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}

Éxito en su presentación.
```

### 7.7. Cambio de asignación (`CHANGE_NOTICE`)
> Se envía **inmediato** al editar una asignación que ya tenía automatización activa.
```
Saludos, {{assignedName}}.

Ha habido un cambio en su asignación:

Nueva asignación: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}
Referencia: {{reference}}
Acompañante: {{companionName}}

{{notes}}

Disculpe las molestias.
```

### 7.8. Cancelación (`CANCELLATION_NOTICE`)
> Se envía **inmediato** al cancelar una asignación que tenía automatización.
```
Saludos, {{assignedName}}.

Su asignación del {{meetingDate}} ha sido cancelada:
Asignación {{assignmentNumber}}: {{assignmentTitle}}

{{notes}}

Agradecemos su buena disposición.
```

---

## 8. Variables disponibles en las plantillas

| Variable | Contenido |
|---|---|
| `{{assignedName}}` | Nombre del participante principal |
| `{{companionName}}` | Nombre del acompañante |
| `{{assignmentTitle}}` | Título de la asignación |
| `{{assignmentNumber}}` | Número de la asignación |
| `{{assignmentType}}` | Tipo (Lectura de la Biblia, Discurso, etc.) |
| `{{meetingDate}}` | Fecha de la reunión (en español) |
| `{{meetingTime}}` | Hora de la reunión |
| `{{room}}` | Sala (Sala principal / Sala auxiliar) |
| `{{context}}` | Contexto de la parte |
| `{{reference}}` | Referencia bíblica / publicación |
| `{{duration}}` | Duración (p. ej. "3 min") |
| `{{congregationName}}` | Nombre de la congregación |
| `{{notes}}` | Notas |

Si no existe la plantilla para un tipo, el sistema usa un texto de respaldo:
`Recordatorio: [título] - [fecha]`.

---

## 9. Qué NO dispara envíos

- Crear la semana o importar el programa de WOL: no genera nada.
- Crear una asignación: solo la deja en estado `DRAFT`; no crea recordatorios hasta generar la automatización.
- Una asignación en estado `PROPOSED`: debe aprobarse primero.

---

## 10. Ciclo de vida de un recordatorio (estados)

```
PENDING ──(vence y el worker lo toma)──► QUEUED ──► SENDING ──► SENT
   │                                                     │
   │                                                     └──► FAILED ──(reintentos)──► SENT / DEAD
   │
   └──► CANCELLED / SKIPPED   (si la asignación/semana/plan cambian, o el publicador no puede recibir)
```

- **PENDING:** creado y esperando su fecha.
- **QUEUED / SENDING:** el worker lo está procesando.
- **SENT:** enviado con éxito.
- **FAILED:** falló, se reintentará.
- **DEAD:** agotó los reintentos.
- **SKIPPED:** omitido (p. ej. duplicado o publicador inactivo).
- **CANCELLED:** cancelado por un cambio posterior.
