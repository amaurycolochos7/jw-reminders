# Automation Model Fix - P0

## Objetivo

Este documento define la correccion P0 del motor de automatizacion de JW-REMINDERS.

No incluye el generador automatico de asignaciones de Fase 2. Si incluye introducir desde ahora los conceptos base que evitan una migracion grande despues: programa mensual, plan de automatizacion, entrega programada y centro operativo de automatizaciones. El alcance es estabilizar el motor actual para que las semanas, asignaciones, recordatorios, cambios y cancelaciones se comporten de forma confiable y auditable.

## Arquitectura de alto nivel

```text
Panel Web
        |
        v
Backend API
        |
        |---------------> PostgreSQL
        |
        |---------------> Worker
        |                     |
        |                     v
        |              ReminderDelivery
        |
        |---------------> WhatsApp Service
                               |
                               v
                           WhatsApp
```

### Responsabilidades por componente

| Componente | Responsabilidad |
|---|---|
| Panel Web | Interfaz administrativa. Permite registrar publicadores, crear programas mensuales, crear semanas, crear asignaciones, generar automatizaciones, revisar entregas, consultar historial y ver estado operativo. No decide reglas de negocio criticas por si solo. |
| Backend API | Fuente principal de reglas de dominio. Crea y actualiza entidades, valida cambios, calcula fechas locales, crea `AutomationPlan`, genera `ReminderDelivery`, cancela pendientes, conserva historial y registra eventos. |
| PostgreSQL | Persistencia transaccional. Guarda programas mensuales, semanas, asignaciones, planes, entregas, intentos de mensaje, plantillas, configuracion y eventos de auditoria. |
| Worker | Proceso periodico. Busca entregas vencidas, valida que sigan siendo enviables, llama al servicio de WhatsApp, registra intentos y actualiza estados. No crea reglas nuevas de negocio salvo eventos de ejecucion. |
| ReminderDelivery | Unidad operativa que el worker procesa. Representa un mensaje concreto programado para un destinatario especifico. |
| WhatsApp Service | Adaptador tecnico hacia WhatsApp. Recibe telefono y mensaje, intenta enviar, devuelve exito/error e identificador de proveedor si existe. |
| WhatsApp | Canal externo final. No es fuente de verdad del sistema. |

Regla arquitectonica: el Panel Web no debe calcular directamente calendarios ni decidir cancelaciones complejas. Debe solicitar acciones al Backend API. El Backend API crea el estado persistente; el Worker solo ejecuta entregas ya programadas.

## Ciclo de vida de una automatizacion

```text
Crear MonthlySchedule
        |
        v
Crear Semana
        |
        v
Crear Asignaciones
        |
        v
Crear AutomationPlan
        |
        v
Generar ReminderDelivery
        |
        v
Worker
        |
        v
WhatsApp Service
        |
        v
WhatsApp
        |
        v
MessageAttempt
        |
        v
Dashboard / Historial / Centro de Automatizaciones
```

Descripcion del ciclo:

1. El administrador crea o selecciona un programa mensual.
2. El administrador crea una semana dentro de ese programa.
3. El administrador crea asignaciones para la semana.
4. Al generar/aprobar recordatorios, el Backend API crea un `AutomationPlan`.
5. El Backend API expande el plan en varias `ReminderDelivery`, una por destinatario/tipo/fecha.
6. El Worker busca entregas `PENDING` vencidas.
7. El Worker valida semana, asignacion, destinatario y plan.
8. El Worker envia el mensaje mediante WhatsApp Service.
9. El Worker registra un `MessageAttempt`.
10. El Worker actualiza la `ReminderDelivery` como `SENT`, `FAILED`, `SKIPPED` o `CANCELLED`.
11. El Dashboard, Historial y Centro de Automatizaciones consultan el estado resultante.

## Responsabilidades de entidades

| Entidad | Que representa | Quien la crea | Quien la modifica | Quien la consume | Cuando deja de utilizarse |
|---|---|---|---|---|---|
| `MonthlySchedule` | Programa operativo de un mes, por ejemplo `Julio 2026`. Agrupa semanas. | Backend API al crear una semana o por accion manual del administrador. | Backend API al archivar o ajustar metadatos. | Panel Web, Dashboard, Centro de Automatizaciones, reportes. | Cuando se archiva el mes y ya no se edita operativamente. Sigue disponible para historial. |
| `JwMeetingWeek` | Semana de reunion con fecha, hora, congregacion y estado. | Backend API desde Panel Web. | Backend API al editar fecha/hora, cancelar o archivar. | Asignaciones, planes, entregas, dashboard. | Cuando queda `ARCHIVED` o `CANCELLED`. No debe borrarse si tiene historial. |
| `JwAssignment` | Participacion concreta asignada a un publicador y opcionalmente acompanante. | Backend API desde Panel Web. | Backend API al editar datos, cambiar asignados, cancelar o completar. | AutomationPlan, Worker, plantillas, historial. | Cuando queda `COMPLETED`, `CANCELLED` o la semana se archiva. Sigue disponible para historial. |
| `AutomationPlan` | Regla activa o historica de automatizacion para una asignacion. Define que entregas deben existir. | Backend API al generar/aprobar recordatorios. | Backend API al regenerar, cancelar, completar o reemplazar por cambios. | Backend API, Worker, Centro de Automatizaciones, auditoria. | Cuando pasa a `SUPERSEDED`, `CANCELLED` o `ARCHIVED`. No se borra si produjo entregas o mensajes. |
| `ReminderDelivery` | Mensaje concreto programado para un destinatario, tipo y fecha/hora. | Backend API al expandir un `AutomationPlan`. | Worker al enviar/fallar/omitir; Backend API al cancelar pendientes. | Worker, Dashboard, Centro de Automatizaciones, Historial. | Cuando llega a estado terminal: `SENT`, `FAILED`, `SKIPPED` o `CANCELLED`. Sigue disponible para consulta. |
| `MessageAttempt` / `JwMessageLog` | Intento real de envio por WhatsApp. Es historial inmutable. | Worker despues de intentar enviar. | No debe modificarse en flujo normal. Solo correccion administrativa futura y auditada. | Historial, Dashboard, auditoria, soporte. | Nunca deja de usarse como evidencia historica. No se borra por operaciones normales. |
| `JwAutomationEvent` | Evento de auditoria del dominio o del motor. | Backend API y Worker. | No se modifica en flujo normal. | Auditoria, soporte, debugging, reportes futuros. | Nunca deja de usarse como traza. Puede archivarse por retencion futura. |
| `JwPublisher` | Persona que puede recibir asignaciones o mensajes. | Backend API desde Panel Web. | Backend API al editar, activar/desactivar o soft-delete. | Asignaciones, entregas, plantillas, dashboard. | Cuando se soft-deletea. Sigue disponible para historial. |
| `JwMessageTemplate` | Plantilla de mensaje por tipo de recordatorio. | Seed inicial o Backend API. | Backend API desde configuracion de plantillas. | Worker/renderizador de mensajes. | Cuando se desactiva o se reemplaza por otra plantilla. |

## Eventos del sistema

Los eventos permiten auditar que ocurrio, cuando ocurrio y que entidad fue afectada. Deben registrarse en `JwAutomationEvent` cuando representen decisiones de dominio o ejecucion relevante.

| Evento | Productor | Entidad principal | Proposito |
|---|---|---|---|
| `MONTHLY_PROGRAM_CREATED` | Backend API | `MonthlySchedule` | Se creo un programa mensual. |
| `MONTHLY_PROGRAM_ARCHIVED` | Backend API | `MonthlySchedule` | Se archivo un programa mensual. |
| `WEEK_CREATED` | Backend API | `JwMeetingWeek` | Se creo una semana dentro de un programa. |
| `WEEK_UPDATED` | Backend API | `JwMeetingWeek` | Cambio fecha, hora, congregacion o notas. |
| `WEEK_CANCELLED` | Backend API | `JwMeetingWeek` | La semana fue cancelada. |
| `WEEK_ARCHIVED` | Backend API | `JwMeetingWeek` | La semana quedo cerrada para operacion. |
| `ASSIGNMENT_CREATED` | Backend API | `JwAssignment` | Se creo una asignacion. |
| `ASSIGNMENT_UPDATED` | Backend API | `JwAssignment` | Cambio dato relevante de la asignacion. |
| `ASSIGNMENT_CANCELLED` | Backend API | `JwAssignment` | La asignacion fue cancelada. |
| `ASSIGNMENT_COMPLETED` | Backend API | `JwAssignment` | La asignacion fue marcada como completada. |
| `AUTOMATION_PLAN_CREATED` | Backend API | `AutomationPlan` | Se creo un plan de automatizacion. |
| `AUTOMATION_PLAN_SUPERSEDED` | Backend API | `AutomationPlan` | Un plan fue reemplazado por cambios. |
| `AUTOMATION_PLAN_CANCELLED` | Backend API | `AutomationPlan` | Un plan fue cancelado. |
| `REMINDERS_GENERATED` | Backend API | `AutomationPlan` | Se generaron entregas desde un plan. |
| `REMINDERS_REGENERATED` | Backend API | `AutomationPlan` | Se cancelaron pendientes anteriores y se crearon nuevas entregas. |
| `REMINDER_DELIVERY_CREATED` | Backend API | `ReminderDelivery` | Se creo una entrega programada. |
| `REMINDER_CANCELLED` | Backend API | `ReminderDelivery` | Una entrega pendiente fue cancelada. |
| `REMINDER_QUEUED` | Worker | `ReminderDelivery` | El Worker tomo la entrega para procesarla. |
| `REMINDER_SENDING` | Worker | `ReminderDelivery` | El Worker inicio intento de envio. |
| `REMINDER_SENT` | Worker | `ReminderDelivery` | WhatsApp confirmo envio exitoso. |
| `REMINDER_FAILED` | Worker | `ReminderDelivery` | Fallo el intento de envio. |
| `REMINDER_RETRY_SCHEDULED` | Worker | `ReminderDelivery` | Se programo un nuevo intento. |
| `REMINDER_DEAD` | Worker | `ReminderDelivery` | Se agotaron los intentos y la entrega quedo muerta. |
| `REMINDER_SKIPPED` | Worker | `ReminderDelivery` | La entrega fue omitida por regla funcional. |
| `CHANGE_NOTICE_CREATED` | Backend API | `ReminderDelivery` | Se creo aviso de cambio inmediato. |
| `CANCELLATION_NOTICE_CREATED` | Backend API | `ReminderDelivery` | Se creo aviso de cancelacion inmediato. |
| `MESSAGE_ATTEMPT_CREATED` | Worker | `MessageAttempt` | Se registro un intento de envio. |
| `ASSIGNMENT_UPDATE_CONFLICT` | Backend API | `JwAssignment` | Se rechazo una edicion por version obsoleta. |
| `PUBLISHER_DEACTIVATED` | Backend API | `JwPublisher` | Publicador desactivado o soft-deleted. |

Cada evento debe guardar, como minimo:

- `eventType`;
- `entityType`;
- `entityId`;
- `metadata`;
- `createdAt`;
- actor si existe (`adminUserId`, `system`, `worker`);
- correlacion opcional (`automationPlanId`, `assignmentId`, `deliveryId`).

## Diagnostico actual

El sistema actual funciona como prototipo operativo, pero mezcla conceptos de negocio y conceptos tecnicos:

- `JwMeetingWeek` representa una semana de reunion, pero no tiene estado operativo (`ACTIVE`, `CANCELLED`, `ARCHIVED`).
- `JwAssignment` representa la participacion asignada a un publicador, pero no llena snapshots de nombre/telefono.
- `JwAssignmentReminder` funciona al mismo tiempo como automatizacion, entrega programada y estado de envio.
- No existe una entidad que represente la regla de automatizacion. El sistema no puede decir "esta asignacion tiene activo el plan de aviso inicial, 7d, 3d, 1d y mismo dia"; solo puede ver entregas sueltas.
- No existe el concepto de programa mensual, aunque el negocio se organiza naturalmente por mes: "Programa Julio 2026" con varias semanas dentro.
- `JwMessageLog` conserva intentos de mensaje, pero al eliminar una semana se borran logs relacionados.
- Las plantillas para `INITIAL_NOTICE`, `CHANGE_NOTICE` y `CANCELLATION_NOTICE` existen, pero no se generan como recordatorios reales.
- La generacion actual crea solo `SEVEN_DAYS_BEFORE`, `THREE_DAYS_BEFORE`, `ONE_DAY_BEFORE` y `SAME_DAY`.
- El acompanante recibe `SEVEN_DAYS_BEFORE`, aunque la regla funcional esperada dice que no debe recibirlo.
- La fecha `scheduledAt` se calcula restando dias a `meetingDate`, lo que programa a medianoche UTC y causa desfase en CDMX.
- La configuracion `TIMEZONE` y `REMINDER_SEND_HOUR` existe en UI/BD, pero no gobierna el calculo real.
- Al editar asignado, acompanante, fecha u hora, no se cancelan correctamente los recordatorios pendientes viejos.
- Al cancelar una asignacion, se cancelan pendientes, pero no se genera aviso de cancelacion.
- Al cambiar una asignacion, no se genera aviso de cambio.
- El worker procesa recordatorios vencidos, pero no distingue entre recordatorio normal, cambio, cancelacion o aviso inicial desde reglas de negocio claras.

## Modelo corregido P0

Para P0 se debe separar claramente regla, entrega e intento de envio:

```text
MonthlySchedule
  Programa operativo de un mes, por ejemplo "Julio 2026".
  Agrupa semanas, aunque todavia no genere asignaciones automaticamente.

JwMeetingWeek
  Semana operativa de reunion.
  Pertenece a un MonthlySchedule.

JwAssignment
  Participacion concreta dentro de una semana.

AutomationPlan
  Regla de automatizacion asociada a una asignacion.
  Define que tipos de recordatorio deben existir y para que roles.

ReminderDelivery
  Entrega programada a un destinatario especifico.
  Es la unidad que el worker procesa.

MessageAttempt
  Historial inmutable de intentos de envio.

JwAutomationEvent
  Auditoria tecnica/funcional de cambios relevantes.
```

Jerarquia recomendada:

```text
MonthlySchedule
  -> JwMeetingWeek
    -> JwAssignment
      -> AutomationPlan
        -> ReminderDelivery
          -> MessageAttempt
```

El cambio importante: la automatizacion ya no se infiere de entregas sueltas. `AutomationPlan` representa la regla activa; `ReminderDelivery` representa cada mensaje concreto que se enviara a un destinatario; `MessageAttempt` representa cada intento real de envio.

Para compatibilidad, `JwAssignmentReminder` puede migrarse de dos formas:

1. Renombrar conceptualmente y en base de datos a `ReminderDelivery`.
2. Mantener temporalmente la tabla fisica y mapearla como `ReminderDelivery` en el dominio hasta completar la migracion.

La direccion de arquitectura debe ser la misma en ambos casos: `JwAssignmentReminder` no debe seguir siendo "la automatizacion".

## Programa mensual desde P0

Aunque Fase 2 no se implementa todavia, el concepto de programa mensual debe existir desde P0.

El negocio no opera como semanas aisladas. Opera como programas mensuales:

```text
Programa Julio 2026
  -> Semana 29 junio - 5 julio
  -> Semana 6 julio - 12 julio
  -> Semana 13 julio - 19 julio
  -> Semana 20 julio - 26 julio
  -> Semana 27 julio - 2 agosto
```

Agregar `MonthlySchedule` desde ahora evita que despues haya que mover semanas ya creadas, recordatorios ya enviados y reportes historicos a una jerarquia nueva.

Alcance P0 de `MonthlySchedule`:

- crear la entidad;
- asociar cada semana a un programa mensual;
- permitir crear o resolver automaticamente el programa mensual al crear una semana;
- usarlo para agrupacion, filtros y dashboard;
- no generar asignaciones automaticamente todavia.

## State Machine

Esta seccion define los estados oficiales permitidos. Ninguna implementacion debe crear estados adicionales sin actualizar este documento.

### MonthlySchedule

| Estado | Significado |
|---|---|
| `DRAFT` | Programa mensual creado, aun no listo para operacion. Puede tener semanas preliminares. |
| `ACTIVE` | Programa mensual operativo. Sus semanas pueden tener asignaciones y automatizaciones activas. |
| `ARCHIVED` | Programa mensual cerrado para consulta historica. No debe generar nuevas automatizaciones. |
| `CANCELLED` | Programa mensual cancelado. Sus semanas/asignaciones activas deben cancelarse o quedar sin envios normales. |

Transiciones validas:

| Desde | Hacia | Accion |
|---|---|---|
| `DRAFT` | `ACTIVE` | Activar programa mensual. |
| `DRAFT` | `CANCELLED` | Cancelar programa antes de operarlo. |
| `ACTIVE` | `ARCHIVED` | Cerrar mes despues de completar operacion. |
| `ACTIVE` | `CANCELLED` | Cancelar mes por decision administrativa. |
| `CANCELLED` | `ARCHIVED` | Archivar programa cancelado. |

No se permite:

- `ARCHIVED` -> `ACTIVE` sin una accion administrativa explicita futura.
- Hard delete si existen semanas, asignaciones, planes, entregas o intentos.

### JwMeetingWeek

| Estado | Significado |
|---|---|
| `DRAFT` | Semana creada pero incompleta. Puede no tener asignaciones. |
| `READY` | Semana capturada y revisada, lista para generar automatizaciones. |
| `ACTIVE` | Semana operativa con automatizaciones activas o lista para envio. |
| `COMPLETED` | Reunion terminada y asignaciones cerradas. |
| `ARCHIVED` | Semana cerrada para edicion operativa y disponible solo para historial. |
| `CANCELLED` | Semana cancelada. No deben enviarse recordatorios normales pendientes. |

Transiciones validas:

| Desde | Hacia | Accion |
|---|---|---|
| `DRAFT` | `READY` | Completar datos minimos de semana y asignaciones. |
| `READY` | `ACTIVE` | Generar/aprobar automatizaciones. |
| `ACTIVE` | `COMPLETED` | Marcar semana como completada despues de la reunion. |
| `COMPLETED` | `ARCHIVED` | Archivar semana historica. |
| `DRAFT` | `CANCELLED` | Cancelar semana preliminar. |
| `READY` | `CANCELLED` | Cancelar antes de activar automatizaciones. |
| `ACTIVE` | `CANCELLED` | Cancelar semana activa y cancelar entregas pendientes normales. |
| `CANCELLED` | `ARCHIVED` | Archivar semana cancelada. |

Acciones que cambian estado:

- Crear semana: `DRAFT`.
- Completar captura/revision: `READY`.
- Generar automatizaciones: `ACTIVE`.
- Cancelar semana: `CANCELLED`.
- Completar reunion: `COMPLETED`.
- Archivar: `ARCHIVED`.

### JwAssignment

| Estado | Significado |
|---|---|
| `DRAFT` | Asignacion capturada pero aun no incluida en automatizaciones. |
| `SCHEDULED` | Asignacion con `AutomationPlan` activo o entregas programadas. |
| `COMPLETED` | Asignacion realizada o cerrada como cumplida. |
| `CANCELLED` | Asignacion cancelada. No deben enviarse recordatorios normales pendientes. |

Transiciones validas:

| Desde | Hacia | Accion |
|---|---|---|
| `DRAFT` | `SCHEDULED` | Generar/aprobar automatizaciones. |
| `DRAFT` | `CANCELLED` | Cancelar antes de programar. |
| `SCHEDULED` | `COMPLETED` | Completar asignacion. |
| `SCHEDULED` | `CANCELLED` | Cancelar asignacion y pendientes normales. |
| `CANCELLED` | `DRAFT` | Solo mediante restauracion administrativa futura y auditada. |

Regla:

- Cambios relevantes en una asignacion `SCHEDULED` no deben editar silenciosamente el plan activo. Deben crear nuevo `AutomationPlan` y marcar el anterior como `SUPERSEDED`.

### AutomationPlan

| Estado | Significado |
|---|---|
| `DRAFT` | Plan construido pero aun no expandido en entregas. |
| `ACTIVE` | Plan vigente. Sus entregas representan la programacion actual. |
| `SUPERSEDED` | Plan reemplazado por un cambio de asignacion, fecha, hora, destinatario o regla. |
| `CANCELLED` | Plan cancelado por cancelacion de asignacion, semana o programa. |
| `ARCHIVED` | Plan historico cerrado para consulta. |

Transiciones validas:

| Desde | Hacia | Accion |
|---|---|---|
| `DRAFT` | `ACTIVE` | Generar entregas del plan. |
| `DRAFT` | `CANCELLED` | Cancelar antes de generar entregas. |
| `ACTIVE` | `SUPERSEDED` | Regenerar por cambios. |
| `ACTIVE` | `CANCELLED` | Cancelar asignacion, semana o programa. |
| `ACTIVE` | `ARCHIVED` | Cerrar historicamente sin cambios pendientes. |
| `SUPERSEDED` | `ARCHIVED` | Archivar plan reemplazado. |
| `CANCELLED` | `ARCHIVED` | Archivar plan cancelado. |

Regla:

- Solo debe existir un `AutomationPlan ACTIVE` por asignacion.

### ReminderDelivery

| Estado | Significado |
|---|---|
| `PENDING` | Entrega programada para una fecha futura o vencida, aun no tomada por el worker. |
| `QUEUED` | Entrega seleccionada por el worker para procesamiento en este ciclo. |
| `SENDING` | El worker esta intentando enviar por WhatsApp. |
| `SENT` | WhatsApp Service confirmo envio exitoso. Estado terminal. |
| `FAILED` | El intento fallo, pero aun puede reintentarse si quedan intentos disponibles. |
| `SKIPPED` | La entrega fue omitida por regla funcional antes de enviar. Estado terminal. |
| `CANCELLED` | La entrega fue cancelada antes de enviarse. Estado terminal. |
| `DEAD` | La entrega fallo definitivamente despues de agotar reintentos. Estado terminal. |

Transiciones validas:

| Desde | Hacia | Accion |
|---|---|---|
| `PENDING` | `QUEUED` | Worker toma la entrega vencida. |
| `QUEUED` | `SENDING` | Worker empieza envio. |
| `SENDING` | `SENT` | Envio exitoso. |
| `SENDING` | `FAILED` | Envio fallido con reintentos disponibles. |
| `FAILED` | `PENDING` | Se agenda reintento con `nextRetryAt`. |
| `FAILED` | `DEAD` | Se agotaron intentos. |
| `PENDING` | `CANCELLED` | Cambio/cancelacion antes del envio. |
| `QUEUED` | `CANCELLED` | Validacion detecta cancelacion antes de enviar. |
| `QUEUED` | `SKIPPED` | Validacion indica omitir. |
| `PENDING` | `SKIPPED` | Regla funcional omite antes del worker. |

Reglas:

- `SENT`, `SKIPPED`, `CANCELLED` y `DEAD` son estados terminales.
- `FAILED` no es terminal mientras existan reintentos disponibles.
- El worker debe hacer transiciones atomicas para evitar doble envio.

## Reglas de envio

### Regla de plan

Cada asignacion activa debe tener un `AutomationPlan` cuando se generen/aprueben recordatorios.

`AutomationPlan` define:

- asignacion relacionada;
- version/generacion del plan;
- zona horaria usada;
- hora de envio usada;
- fecha y hora de reunion usadas;
- reglas activas por rol;
- estado del plan.

Ejemplo conceptual:

```text
AutomationPlan
  assignmentId = A1
  timezone = America/Mexico_City
  sendHour = 9
  status = ACTIVE
  rules:
    assigned: INITIAL_NOTICE, 7d, 3d, 1d, SAME_DAY
    companion: INITIAL_NOTICE, 3d, 1d, SAME_DAY
```

Si cambia la asignacion o la semana, el plan anterior pasa a `SUPERSEDED` y se crea un nuevo plan. Las entregas `PENDING` del plan anterior se cancelan; las entregas ya enviadas se conservan.

### Regla por entrega

Cada entrega se genera por plan, asignacion, destinatario y tipo:

```text
automationPlanId + assignmentId + publisherId + reminderType
```

La restriccion unica actual `assignmentId + publisherId + reminderDay` evita duplicados exactos en el modelo actual, pero el objetivo P0 debe moverse a una unicidad por plan:

```text
automationPlanId + publisherId + reminderType
```

Esto permite conservar entregas historicas de planes anteriores sin confundirlas con las entregas vigentes.

### Asignado principal

El asignado recibe:

| Tipo | Momento |
|---|---|
| `INITIAL_NOTICE` | Inmediato al generar/aprobar recordatorios. |
| `SEVEN_DAYS_BEFORE` | 7 dias antes, a `REMINDER_SEND_HOUR` en `TIMEZONE`. |
| `THREE_DAYS_BEFORE` | 3 dias antes, a `REMINDER_SEND_HOUR` en `TIMEZONE`. |
| `ONE_DAY_BEFORE` | 1 dia antes, a `REMINDER_SEND_HOUR` en `TIMEZONE`. |
| `SAME_DAY` | Mismo dia, a `REMINDER_SEND_HOUR` en `TIMEZONE`, salvo regla especial. |

### Acompanante

El acompanante recibe:

| Tipo | Momento |
|---|---|
| `INITIAL_NOTICE` | Inmediato al generar/aprobar recordatorios. |
| `THREE_DAYS_BEFORE` | 3 dias antes, a `REMINDER_SEND_HOUR` en `TIMEZONE`. |
| `ONE_DAY_BEFORE` | 1 dia antes, a `REMINDER_SEND_HOUR` en `TIMEZONE`. |
| `SAME_DAY` | Mismo dia, a `REMINDER_SEND_HOUR` en `TIMEZONE`, salvo regla especial. |

El acompanante no recibe `SEVEN_DAYS_BEFORE`.

### Aviso inicial

`INITIAL_NOTICE` debe crearse al generar recordatorios.

Regla de `scheduledAt`:

- Si se generan recordatorios y el aviso inicial debe salir ahora, usar `scheduledAt = now`.
- Si el sistema requiere aprobacion manual posterior, usar la fecha/hora de aprobacion.
- En P0, la opcion recomendada es "en cola inmediata": crear `INITIAL_NOTICE` con `scheduledAt <= now` para que el worker lo envie en el siguiente ciclo.

### Cambio de asignacion

Debe generarse `CHANGE_NOTICE` cuando ya existian recordatorios generados y cambia informacion relevante:

- asignado principal;
- acompanante;
- fecha de reunion;
- hora de reunion;
- titulo;
- tipo;
- sala;
- referencia/contexto importante.

Regla recomendada P0:

- Cancelar recordatorios pendientes normales anteriores.
- Conservar recordatorios ya enviados.
- Crear nuevos recordatorios normales para los destinatarios actuales.
- Crear `CHANGE_NOTICE` inmediato para destinatarios que deban conocer el cambio.
- No borrar `JwMessageLog`.

### Cancelacion de asignacion

Al cancelar una asignacion:

- Cambiar `JwAssignment.status` a `CANCELLED`.
- Cancelar todos los recordatorios `PENDING` normales.
- Generar `CANCELLATION_NOTICE` inmediato si ya se habia enviado algun aviso o si existian recordatorios generados.
- Conservar `SENT`, `FAILED`, `SKIPPED` y todos los `JwMessageLog`.

### Completar asignacion

Al completar una asignacion:

- Cambiar `JwAssignment.status` a `COMPLETED`.
- Cancelar recordatorios `PENDING` futuros.
- No generar `CANCELLATION_NOTICE`.
- Conservar historial.

## Fechas, zona horaria y UTC

### Principio

La reunion se define por fecha local y hora local. El envio se programa por fecha local y hora local. La base de datos almacena el instante final en UTC.

Ejemplo funcional:

```text
TIMEZONE = America/Mexico_City
REMINDER_SEND_HOUR = 9
meetingDate = 2026-07-03
meetingTime = 19:00
```

Resultado esperado:

| Tipo | Fecha local | Hora local | scheduledAt UTC esperado |
|---|---:|---:|---:|
| `SEVEN_DAYS_BEFORE` | 2026-06-26 | 09:00 CDMX | 2026-06-26T15:00:00.000Z |
| `THREE_DAYS_BEFORE` | 2026-06-30 | 09:00 CDMX | 2026-06-30T15:00:00.000Z |
| `ONE_DAY_BEFORE` | 2026-07-02 | 09:00 CDMX | 2026-07-02T15:00:00.000Z |
| `SAME_DAY` | 2026-07-03 | 09:00 CDMX | 2026-07-03T15:00:00.000Z |

Nota: En 2026, Ciudad de Mexico usa UTC-6, por eso 09:00 CDMX corresponde a 15:00 UTC.

### Regla SAME_DAY

Regla base P0:

- `SAME_DAY` se envia el mismo dia de la reunion a `REMINDER_SEND_HOUR`.

Regla de seguridad:

- Si `REMINDER_SEND_HOUR` es igual o posterior a `meetingTime`, programar `SAME_DAY` con margen antes de la reunion o rechazar la configuracion.
- Recomendacion P0: validar que `REMINDER_SEND_HOUR` sea menor que la hora de reunion para `SAME_DAY`.

### Helper unico

Crear un helper unico de dominio, por ejemplo:

```text
calculateReminderSchedule(input)
```

Entradas:

- `meetingDate`: fecha local de reunion.
- `meetingTime`: hora local de reunion.
- `timezone`: IANA timezone, por defecto `America/Mexico_City`.
- `sendHour`: entero 0-23.
- `reminderType`: tipo de recordatorio.
- `now`: inyectable para pruebas.

Salida:

- `scheduledAt`: `Date` en UTC.
- `scheduledLocalDate`: string diagnostico opcional.
- `scheduledLocalTime`: string diagnostico opcional.

Reglas:

- No construir fechas con `YYYY-MM-DDT00:00:00.000Z` para representar fechas locales.
- No restar dias directamente sobre un `Date` UTC si el concepto original es fecha local.
- Convertir "fecha local + hora local + timezone" a instante UTC al final.

## Migraciones necesarias

### `MonthlySchedule`

Crear entidad nueva:

```text
id String @id @default(cuid())
year Int
month Int
name String
status MonthlyScheduleStatus @default(DRAFT)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
archivedAt DateTime?
cancelledAt DateTime?
```

Agregar enum:

```text
MonthlyScheduleStatus:
- DRAFT
- ACTIVE
- ARCHIVED
- CANCELLED
```

Restriccion:

```text
@@unique([year, month])
```

Al crear una semana, el sistema debe asociarla a un `MonthlySchedule`. Si no existe el programa del mes correspondiente, puede crearlo automaticamente con nombre como `Julio 2026`.

### `JwMeetingWeek`

Agregar:

```text
monthlyScheduleId String?
status MeetingWeekStatus @default(DRAFT)
archivedAt DateTime?
cancelledAt DateTime?
completedAt DateTime?
```

Agregar enum:

```text
MeetingWeekStatus:
- DRAFT
- READY
- ACTIVE
- COMPLETED
- CANCELLED
- ARCHIVED
```

Opcional recomendado para robustez futura:

```text
weekStartDateLocal String?
meetingDateLocal String?
```

Estos campos permitirian conservar la fecha calendario local sin depender de un `DateTime` UTC. En P0 se puede aplazar si el helper logra interpretar correctamente los valores existentes, pero debe considerarse para evitar errores futuros.

### `JwAssignment`

Usar los campos existentes de snapshot:

```text
assignedNameSnapshot
assignedPhoneSnapshot
companionNameSnapshot
companionPhoneSnapshot
```

No requieren migracion porque ya existen, pero deben llenarse al crear y editar.

Actualizar enum de estado objetivo:

```text
AssignmentStatus:
- DRAFT
- SCHEDULED
- COMPLETED
- CANCELLED
```

Campos recomendados:

```text
completedAt DateTime?
cancelledAt DateTime?
version Int @default(1)
```

### `AutomationPlan`

Crear entidad nueva:

```text
id String @id @default(cuid())
assignmentId String
status AutomationPlanStatus @default(DRAFT)
version Int @default(1)
timezone String
sendHour Int
meetingDateLocal String
meetingTimeLocal String
rules Json
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
cancelledAt DateTime?
supersededAt DateTime?
```

Agregar enum:

```text
AutomationPlanStatus:
- DRAFT
- ACTIVE
- CANCELLED
- SUPERSEDED
- ARCHIVED
```

Indices:

```text
@@index([assignmentId, status])
@@unique([assignmentId, version])
```

Regla:

- Solo debe existir un plan `ACTIVE` por asignacion.
- Al regenerar por cambios, el plan activo anterior pasa a `SUPERSEDED` y se crea una version nueva.

### `ReminderDelivery`

Crear entidad nueva o renombrar/migrar `JwAssignmentReminder`.

Campos objetivo:

```text
id String @id @default(cuid())
automationPlanId String
assignmentId String
publisherId String
recipientRole ReminderRecipientRole
reminderType ReminderType
scheduledAt DateTime
sentAt DateTime?
status ReminderStatus @default(PENDING)
attemptCount Int @default(0)
maxAttempts Int @default(3)
nextRetryAt DateTime?
lastAttemptAt DateTime?
deadAt DateTime?
errorMessage String?
cancelledAt DateTime?
cancelReason String?
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

Agregar enum:

```text
ReminderRecipientRole:
- ASSIGNED
- COMPANION
```

Actualizar enum de estado objetivo:

```text
ReminderStatus:
- PENDING
- QUEUED
- SENDING
- SENT
- FAILED
- SKIPPED
- CANCELLED
- DEAD
```

Restriccion objetivo:

```text
@@unique([automationPlanId, publisherId, reminderType])
```

Indices:

```text
@@index([status, scheduledAt])
@@index([assignmentId, status])
@@index([publisherId, status])
@@index([automationPlanId, status])
```

### `JwAssignmentReminder` legado

Si no se renombra la tabla en el primer paso, mantenerla solo como compatibilidad temporal y agregar:

```text
automationPlanId String?
recipientRole ReminderRecipientRole?
cancelledAt DateTime?
cancelReason String?
generationKey String?
```

`generationKey` permitiria agrupar recordatorios creados en una misma regeneracion y diagnosticar cambios. Si se introduce `AutomationPlan`, `generationKey` puede quedar reemplazado por `automationPlanId`.

Mientras exista esta tabla, agregar indices:

```text
@@index([status, scheduledAt])
@@index([assignmentId, status])
@@index([publisherId, status])
@@index([automationPlanId, status])
```

### `JwMessageLog`

No borrar registros.

Opcional recomendado:

```text
reminderId String?
automationPlanId String?
```

Esto conectaria cada intento de envio con el recordatorio exacto que lo produjo.

Nombre de dominio recomendado: `MessageAttempt`. La tabla puede seguir llamandose `JwMessageLog` en P0 si se desea reducir riesgo, pero el concepto debe ser "intento de mensaje", no solo "historial".

### `JwAutomationEvent`

Agregar tabla de auditoria ligera:

```text
id
entityType
entityId
eventType
metadata Json?
createdAt
```

Eventos minimos:

- `REMINDERS_GENERATED`
- `REMINDERS_REGENERATED`
- `PENDING_REMINDERS_CANCELLED`
- `ASSIGNMENT_CHANGED`
- `ASSIGNMENT_CANCELLED`
- `ASSIGNMENT_COMPLETED`
- `WEEK_ARCHIVED`
- `WEEK_CANCELLED`

## Endpoints afectados

### `GET /api/monthly-schedules`

Nuevo endpoint P0 recomendado.

Funcion:

- listar programas mensuales;
- permitir filtros por year/month/status;
- devolver conteos operativos basicos:
  - semanas;
  - asignaciones;
  - planes activos;
  - entregas pendientes;
  - entregas enviadas;
  - entregas fallidas.

### `POST /api/monthly-schedules`

Nuevo endpoint P0 recomendado, aunque la UI no necesite una pantalla completa todavia.

Funcion:

- crear programa mensual manualmente si se desea;
- evitar duplicados por `year + month`.

### `POST /api/meeting-weeks`

Cambios:

- Resolver o crear `MonthlySchedule` segun `meetingDate` o `weekStartDate`.
- Guardar `monthlyScheduleId`.
- Mantener la semana como unidad operativa dentro de ese programa.

### `PUT /api/meeting-weeks/:id`

Cambios:

- Si cambia `meetingDate` y por eso cambia el mes operativo, actualizar `monthlyScheduleId` o pedir confirmacion segun UX.
- Si cambia `meetingDate` o `meetingTime`, reemplazar `AutomationPlan` activo de cada asignacion activa.
- Cancelar entregas `PENDING` anteriores.
- Crear nuevas entregas con fechas correctas.
- Crear `CHANGE_NOTICE` si ya habia mensajes enviados o recordatorios activos.

### `POST /api/assignments`

Cambios:

- Llenar snapshots al crear.
- No necesariamente generar recordatorios automaticamente si el flujo sigue requiriendo aprobacion manual.

Decision P0:

- Mantener generacion manual desde "Generar recordatorios".
- Si en el futuro se desea auto-generar al crear, debe ser una decision explicita de UX.

### `PUT /api/assignments/:id`

Cambios:

- Detectar cambios relevantes.
- Llenar snapshots nuevos.
- Si ya habia `AutomationPlan` activo o entregas generadas:
  - marcar el plan activo anterior como `SUPERSEDED`;
  - cancelar pendientes anteriores;
  - crear nuevo `AutomationPlan`;
  - generar nuevas `ReminderDelivery`;
  - generar `CHANGE_NOTICE` si aplica;
  - conservar enviados.

### `POST /api/assignments/:id/generate-reminders`

Cambios:

- Crear o reutilizar el `AutomationPlan` activo de la asignacion.
- Crear `INITIAL_NOTICE`.
- Aplicar reglas distintas para asignado y acompanante.
- Calcular `scheduledAt` con helper unico.
- Usar `TIMEZONE` y `REMINDER_SEND_HOUR`.
- Evitar duplicados.
- No reactivar recordatorios cancelados.

### `PATCH /api/assignments/:id/cancel`

Cambios:

- Marcar `AutomationPlan` activo como `CANCELLED`.
- Cancelar pendientes.
- Crear `CANCELLATION_NOTICE` inmediato si aplica.
- Conservar historial.
- Registrar evento de auditoria.

### `PATCH /api/assignments/:id/complete`

Cambios:

- Cancelar pendientes futuros.
- Archivar o cerrar el `AutomationPlan` activo.
- No generar cancelacion.
- Conservar historial.
- Registrar evento de auditoria.

### `DELETE /api/meeting-weeks/:id`

Cambios:

- No borrar si existe historial.
- Si no hay historial, puede permitirse hard delete solo para borradores sin asignaciones, sin recordatorios y sin logs.
- Para semanas con historial o recordatorios, reemplazar por:
  - cancelar semana;
  - archivar semana;
  - cancelar pendientes relacionados.

## Flujo del Worker

El Worker ejecuta entregas programadas. No decide nuevas reglas de negocio y no genera planes. Su responsabilidad es procesar `ReminderDelivery` que ya existen.

Frecuencia:

```text
Cada 10 minutos, o segun CRON_SCHEDULE.
```

Consulta base:

```text
ReminderDelivery
where status = PENDING
and scheduledAt <= now
order by scheduledAt asc
limit N
```

Flujo obligatorio por cada entrega:

1. Buscar `ReminderDelivery PENDING` vencida.
2. Cargar `AutomationPlan`, `JwAssignment`, `JwMeetingWeek`, `MonthlySchedule` y `JwPublisher`.
3. Verificar que la entrega siga en estado `PENDING`.
4. Verificar estado de `MonthlySchedule`.
5. Verificar estado de la semana.
6. Verificar estado de la asignacion.
7. Verificar estado del `AutomationPlan`.
8. Verificar que el destinatario exista y tenga telefono valido.
9. Verificar si el tipo de entrega puede enviarse aunque la asignacion o semana esten canceladas.
10. Renderizar plantilla segun `reminderType` y rol del destinatario.
11. Enviar WhatsApp mediante WhatsApp Service.
12. Crear `MessageAttempt` / `JwMessageLog` con resultado del intento.
13. Si el envio fue exitoso, marcar `ReminderDelivery` como `SENT` y llenar `sentAt`.
14. Si el envio fallo, marcar `ReminderDelivery` como `FAILED` y guardar `errorMessage`.
15. Si se omite por regla funcional, marcar `ReminderDelivery` como `SKIPPED`.
16. Crear `JwAutomationEvent` (`REMINDER_SENT`, `REMINDER_FAILED` o `REMINDER_SKIPPED`).
17. Si la entrega exitosa fue `INITIAL_NOTICE`, conservar la asignacion como `SCHEDULED` y registrar metadata de notificacion inicial (`initialNoticeSentAt` o evento equivalente).

Reglas de validacion:

| Validacion | Resultado si falla |
|---|---|
| No existe entrega | No hacer nada. |
| Entrega ya no esta `PENDING` | Omitir sin enviar. |
| No existe plan | Marcar `FAILED` o `SKIPPED` segun politica P0 y registrar evento. |
| Plan `SUPERSEDED` | Marcar entrega `CANCELLED` o `SKIPPED`; no enviar. |
| Plan `CANCELLED` | Marcar entrega `CANCELLED`; no enviar. |
| Semana `CANCELLED` o `ARCHIVED` | No enviar recordatorios normales. Solo enviar avisos especiales creados explicitamente si la regla lo permite. |
| Asignacion `CANCELLED` | No enviar recordatorios normales. Solo enviar `CANCELLATION_NOTICE` si existe. |
| Asignacion `COMPLETED` | Cancelar/omitir pendientes normales. |
| Publicador sin telefono valido | Marcar `FAILED` con error claro. |
| WhatsApp Service no disponible | Marcar `FAILED` o dejar para retry, segun politica P0. |

Regla de historial:

- Siempre crear `MessageAttempt` cuando se haya intentado enviar por WhatsApp.
- No crear `MessageAttempt` si se omitio antes de llamar a WhatsApp; en ese caso registrar solo `JwAutomationEvent`.
- Nunca borrar `MessageAttempt`.
- Nunca borrar `ReminderDelivery` por ejecucion del worker.

Eventos que produce el Worker:

- `REMINDER_SENT`.
- `REMINDER_FAILED`.
- `REMINDER_SKIPPED`.
- `MESSAGE_ATTEMPT_CREATED`.

## Reintentos

Los reintentos aplican a `ReminderDelivery` cuando el Worker intento enviar por WhatsApp y recibio error tecnico o falta temporal de disponibilidad.

Campos requeridos en `ReminderDelivery`:

```text
attemptCount Int @default(0)
maxAttempts Int @default(3)
nextRetryAt DateTime?
lastAttemptAt DateTime?
deadAt DateTime?
```

Politica oficial P0:

| Intento | Momento |
|---|---|
| 1 | Cuando `scheduledAt <= now`. |
| 2 | 10 minutos despues del primer fallo. |
| 3 | 30 minutos despues del segundo fallo. |

Reglas:

- Maximo 3 intentos totales por entrega.
- Cada intento real crea un `MessageAttempt`.
- Despues del intento 1 fallido, la entrega queda `FAILED`, incrementa `attemptCount` y se agenda `nextRetryAt = now + 10 minutos`.
- Cuando llega `nextRetryAt`, el Worker puede mover `FAILED` a `PENDING` o tomarla directamente como reintento, segun implementacion, pero debe registrar evento.
- Despues del intento 2 fallido, se agenda `nextRetryAt = now + 30 minutos`.
- Despues del intento 3 fallido, la entrega pasa a `DEAD`.
- `DEAD` significa fallo definitivo y requiere intervencion manual futura si se desea reenviar.

Eventos por intento:

| Situacion | Eventos |
|---|---|
| Intento iniciado | `REMINDER_SENDING` |
| Intento exitoso | `MESSAGE_ATTEMPT_CREATED`, `REMINDER_SENT` |
| Intento fallido con reintentos disponibles | `MESSAGE_ATTEMPT_CREATED`, `REMINDER_FAILED`, `REMINDER_RETRY_SCHEDULED` |
| Intento fallido sin reintentos disponibles | `MESSAGE_ATTEMPT_CREATED`, `REMINDER_FAILED`, `REMINDER_DEAD` |
| Omitido antes de llamar WhatsApp | `REMINDER_SKIPPED` |
| Cancelado antes de enviar | `REMINDER_CANCELLED` |

Errores que permiten reintento:

- WhatsApp Service no disponible.
- Timeout.
- Error temporal del proveedor.
- Sesion WhatsApp desconectada.
- Error de red.

Errores que pueden ir directo a `DEAD` o `SKIPPED`:

- Publicador sin telefono valido.
- Destinatario inexistente.
- Plantilla inexistente si no hay fallback permitido.
- Plan cancelado o reemplazado.

## Concurrencia

El sistema debe asumir que pueden ocurrir cambios mientras el Worker procesa entregas. Toda operacion critica debe ser transaccional y volver a leer estado actual antes de modificarlo.

### Dos administradores editan la misma asignacion

Politica:

- Usar control de version optimista con `updatedAt` o campo `version`.
- La UI envia la version leida.
- El Backend API solo guarda si la version coincide.
- Si no coincide, rechaza con conflicto y pide recargar.

Resultado esperado:

- No se pisan cambios silenciosamente.
- Solo una edicion reemplaza el `AutomationPlan` activo.
- La segunda edicion debe recalcular sobre el estado actualizado.

Eventos:

- `ASSIGNMENT_UPDATED` si guarda.
- `ASSIGNMENT_UPDATE_CONFLICT` si se rechaza por version.

### Worker intenta enviar mientras la asignacion cambia

Politica:

- Antes de enviar, el Worker debe mover atomica/transaccionalmente la entrega de `PENDING` a `QUEUED` o `SENDING`.
- La edicion de asignacion debe cancelar solo entregas que sigan `PENDING`, `QUEUED` o `FAILED` con reintento pendiente.
- Si una entrega ya esta `SENDING`, no se debe borrar ni modificar.
- Despues del envio, el Worker debe volver a validar si el plan sigue activo antes de marcar exito operativo.

Resultado esperado:

- No hay doble envio.
- Si el mensaje ya salio, se conserva como `MessageAttempt`.
- Si el plan fue reemplazado durante el envio, se registra evento y el nuevo plan crea nuevas entregas; no se borra el intento anterior.

### Una semana se cancela durante un envio

Politica:

- La cancelacion marca la semana `CANCELLED`.
- Cancela entregas pendientes normales.
- No interrumpe un envio que ya esta `SENDING`.
- Si el envio termina exitoso despues de la cancelacion, queda historico como intento real.
- La cancelacion puede crear `CANCELLATION_NOTICE` posterior si aplica.

Resultado esperado:

- No se pierde historial.
- No se siguen enviando recordatorios normales pendientes.
- El Centro de Automatizaciones debe mostrar el estado resultante.

### Un publicador se desactiva antes del envio

Politica:

- Antes de enviar, el Worker verifica que el publicador exista y pueda recibir mensajes.
- Si esta desactivado o soft-deleted, la entrega normal pasa a `SKIPPED` o `CANCELLED` segun razon.
- No se envia WhatsApp.
- Se registra evento con razon.

Excepcion:

- Si se trata de un aviso especial ya aprobado por administracion, puede permitirse envio solo si la politica del producto lo define explicitamente. P0 por defecto no envia a publicadores desactivados.

## Politica de borrado

Regla general: el sistema es auditable. Borrar fisicamente debe ser excepcional.

### Nunca se eliminan en flujo normal

- `MessageAttempt` / `JwMessageLog`.
- `JwAutomationEvent`.
- `ReminderDelivery` que haya llegado a `SENT`, `FAILED`, `DEAD`, `SKIPPED` o `CANCELLED`.
- `AutomationPlan` que haya generado entregas.
- `JwAssignment` con entregas o mensajes.
- `JwMeetingWeek` con asignaciones, entregas o mensajes.
- `MonthlySchedule` con semanas.

### Usan soft delete

- `JwPublisher` con historial.
- Entidades administrativas futuras que puedan aparecer en historial.

Soft delete debe usar:

```text
deletedAt
isActive = false
```

### Pueden archivarse

- `MonthlySchedule`.
- `JwMeetingWeek`.
- `AutomationPlan`.
- `JwAssignment` completada/cancelada puede quedar cerrada por estado, no necesita archivo separado en P0.

### Pueden eliminarse fisicamente

Solo borradores sin historial:

- `MonthlySchedule DRAFT` sin semanas.
- `JwMeetingWeek DRAFT` sin asignaciones, planes, entregas ni logs.
- `JwAssignment DRAFT` sin planes, entregas ni logs.
- `AutomationPlan DRAFT` sin entregas.
- `ReminderDelivery PENDING` creada por error solo si no tiene intentos ni eventos relevantes. Recomendacion: preferir `CANCELLED`.

## Recuperacion

### Worker detenido

Comportamiento:

- Las entregas quedan en `PENDING` o `FAILED` con `nextRetryAt`.
- Al reiniciar, el Worker procesa todo lo vencido con `scheduledAt <= now` o `nextRetryAt <= now`.
- Debe ordenar por fecha ascendente y limitar por lote.

Riesgo:

- Si estuvo detenido mucho tiempo, puede haber muchas entregas vencidas.

Mitigacion:

- Procesamiento por lotes.
- Mostrar atraso en Dashboard operativo.

### Reinicio del servidor

Comportamiento:

- El estado persistente esta en PostgreSQL.
- El Backend API no debe depender de memoria para planes o entregas.
- El Worker reanuda desde base de datos.

Mitigacion:

- Transiciones atomicas.
- Estados `QUEUED` o `SENDING` antiguos deben recuperarse.

Politica para `QUEUED`/`SENDING` antiguos:

- Si tienen mas de 30 minutos sin actualizacion, mover a `FAILED` con razon `stale_processing_state` y aplicar politica de reintento.

### WhatsApp desconectado

Comportamiento:

- El Worker intenta enviar y recibe fallo del WhatsApp Service.
- La entrega pasa a `FAILED` con reintento si quedan intentos.
- El Dashboard debe mostrar estado de WhatsApp y entregas fallidas/pendientes.

No debe:

- Borrar entregas.
- Marcar como `SENT`.
- Perder cuerpo del mensaje renderizado en el intento.

### Base de datos restaurada

Comportamiento:

- El sistema toma la base restaurada como fuente de verdad.
- Puede haber entregas `PENDING` antiguas o ya enviadas fuera del snapshot.

Mitigacion:

- No reenviar automaticamente entregas muy antiguas sin ventana de seguridad.
- Agregar politica: si `scheduledAt` tiene mas de 48 horas de atraso, marcar como `SKIPPED` o requerir aprobacion manual, salvo que el administrador fuerce reenvio.
- Mantener backups y logs externos si existen.

### Error durante un envio

Casos:

- Error antes de llamar WhatsApp: no crear `MessageAttempt`; marcar `FAILED` o `SKIPPED` segun causa.
- Error despues de llamar WhatsApp pero antes de recibir respuesta: crear `MessageAttempt` con estado `FAILED` o `UNKNOWN` si se agrega ese estado futuro; en P0 usar `FAILED` con error claro.
- Error despues de enviar pero antes de actualizar DB: riesgo de duplicado.

Mitigacion:

- Usar `providerMessageId` cuando exista.
- Hacer transiciones idempotentes.
- Evitar reenviar entregas `SENDING` recientes.
- Registrar suficiente metadata para investigacion manual.

## Cambios en UI

### Dashboard operativo

El dashboard no debe limitarse a mostrar numeros. Debe responder preguntas operativas:

- Que se enviara hoy.
- Que se enviara manana.
- Que se enviara esta semana.
- Que mes/programa esta activo.
- Que semanas ya tienen automatizaciones generadas.
- Que semanas tienen pendientes.
- Que mensajes fallaron.
- Que publicadores recibiran mensaje hoy.
- Que acompanantes recibiran mensaje manana.
- Que semana esta lista y cual requiere accion.

Ejemplo de respuesta esperada:

```text
Hoy se enviaran:
15 mensajes
9 asignados
6 acompanantes

Manana:
7 recordatorios

Semana del 29 junio:
Automatizaciones generadas
WhatsApp listo
15 mensajes pendientes
0 errores
```

El objetivo es que el administrador no interprete metricas crudas. El sistema debe mostrar estado operativo y proximas acciones.

### Centro de Automatizaciones

Modulo futuro P1. En este documento se define su arquitectura, pero no se implementa durante P0.

Ruta propuesta:

```text
/dashboard/automatizaciones
```

Nombre visible:

```text
Automatizaciones
```

Debe mostrar una agenda operativa de `ReminderDelivery`, agrupada por fecha local y programa mensual.

Arquitectura del modulo:

```text
Panel Web /dashboard/automatizaciones
        |
        v
GET /api/automation-center
        |
        v
Consulta ReminderDelivery
        |
        |-- AutomationPlan
        |-- JwAssignment
        |-- JwMeetingWeek
        |-- MonthlySchedule
        |-- JwPublisher
        |-- MessageAttempt
```

Responsabilidades:

| Capa | Responsabilidad |
|---|---|
| UI | Mostrar agenda, filtros, estados y acciones de navegacion. No recalcula fechas. |
| API | Resolver filtros, convertir fechas a zona local, agrupar resultados, devolver estado operativo. |
| Base de datos | Persistir entregas, planes, intentos y eventos. |
| Worker | Actualizar estados que la pantalla muestra. |

Endpoint futuro:

```text
GET /api/automation-center
```

Parametros:

- `range=today|tomorrow|week|month|custom`.
- `status=pending|sent|failed|cancelled|skipped`.
- `role=assigned|companion`.
- `publisherId`.
- `monthlyScheduleId`.
- `meetingWeekId`.
- `dateFrom`.
- `dateTo`.

Respuesta conceptual:

```text
{
  groups: [
    {
      label: "HOY",
      localDate: "2026-07-03",
      deliveries: [...]
    }
  ],
  summary: {
    pending: 15,
    sent: 9,
    failed: 0,
    cancelled: 2
  }
}
```

Ejemplo:

```text
AUTOMATIZACIONES

Julio 2026

HOY
09:00
Juan Perez
Lectura de la Biblia
Asignado
Programado

HOY
09:00
Ana Gomez
Empiece conversaciones
Acompanante
Programado

MANANA
09:00
Carlos Ruiz
Revisita
Asignado
Programado
```

Filtros minimos:

- Hoy.
- Manana.
- Esta semana.
- Este mes.
- Enviadas.
- Pendientes.
- Fallidas.
- Canceladas.
- Publicador.
- Asignado.
- Acompanante.
- Programa mensual.
- Semana.

Acciones permitidas en P1:

- Ver detalle de asignacion.
- Ver historial del destinatario.
- Reintentar fallidos, si existe politica de reintento aprobada.
- Cancelar entrega pendiente, si el usuario tiene permiso y queda evento auditado.

Acciones no incluidas:

- Generar asignaciones automaticamente.
- Cambiar reglas globales de automatizacion desde esta pantalla.
- Borrar historial.

Esta pantalla no implementa generacion automatica de asignaciones. Solo vuelve visible lo que el motor ya programo o envio.

### Semana detalle

Cambios:

- Mostrar si los recordatorios fueron generados con conteo por tipo:
  - aviso inicial;
  - 7 dias;
  - 3 dias;
  - 1 dia;
  - mismo dia;
  - cambio;
  - cancelacion.
- Mostrar fecha/hora local de envio, no solo fecha.
- Mostrar estado de semana: activa, cancelada, archivada.
- Mostrar programa mensual al que pertenece la semana.
- Mostrar plan activo de automatizacion y version.
- Al editar fecha/hora de reunion, advertir que se regeneraran pendientes.

### Formulario de asignacion

Cambios:

- Al editar asignado/acompanante/datos relevantes, advertir que se cancelaran pendientes anteriores y se crearan nuevos.
- Mostrar que mensajes ya enviados se conservaran como historial.

### Cancelacion

Cambios:

- Indicar que se cancelaran pendientes.
- Indicar que se enviara aviso de cancelacion si corresponde.

### Configuracion

Cambios:

- Validar `TIMEZONE`.
- Validar `REMINDER_SEND_HOUR` como entero 0-23.
- Aclarar que la hora aplica a los recordatorios programados.
- El worker debe leer configuracion real desde BD o usar una politica unica claramente documentada.

Decision P0 recomendada:

- La API de generacion debe leer `AppConfig`.
- El worker solo procesa `scheduledAt` ya calculado.
- `TEST_MODE` y `TEST_PHONE` deben alinearse: o se leen de entorno, o se leen de BD, pero la UI no debe prometer cambios que el worker no usa.

## Riesgo de datos existentes

### Semanas existentes sin programa mensual

Riesgo:

- Las semanas ya creadas no tendran `monthlyScheduleId`.

Estrategia:

- Backfill por `meetingDate` local.
- Crear automaticamente `MonthlySchedule` para cada `year + month` encontrado.
- Asociar cada semana a su programa mensual.
- Revisar semanas que cruzan mes; por regla P0, usar el mes de `meetingDate` como mes operativo.

### Recordatorios existentes sin AutomationPlan

Riesgo:

- Recordatorios ya creados no tendran `automationPlanId`.

Estrategia:

- Para cada asignacion con recordatorios existentes, crear un `AutomationPlan` historico o activo segun estado.
- Asociar entregas existentes a ese plan.
- Si los recordatorios estan `PENDING`, recalcular/cancelar/regenerar segun reglas P0.
- Si estan `SENT` o `FAILED`, conservarlos y asociarlos a un plan historico para trazabilidad.

### Recordatorios existentes a medianoche UTC

Riesgo:

- Recordatorios ya creados pueden estar programados con desfase.

Estrategia:

- No modificar `SENT`.
- No borrar `FAILED`.
- Para `PENDING`, recalcular solo si la asignacion y semana siguen activas.
- Registrar evento `REMINDERS_REGENERATED`.

### Duplicados funcionales

Riesgo:

- El constraint evita duplicados exactos, pero puede haber recordatorios obsoletos para publicadores anteriores.

Estrategia:

- Al regenerar, cancelar `PENDING` anteriores antes de crear nuevos.
- Conservar `SENT` como historial.
- Crear nuevos recordatorios para destinatarios actuales.

### Historial eliminado al borrar semanas

Riesgo:

- El codigo actual borra `JwMessageLog` al eliminar semana.

Estrategia:

- Cambiar eliminacion a archivado/cancelacion si hay historial.
- Permitir hard delete solo para semanas sin asignaciones, recordatorios ni logs.

### Configuracion divergente

Riesgo:

- UI guarda `TIMEZONE`, `REMINDER_SEND_HOUR`, `TEST_MODE`, `TEST_PHONE`, pero worker usa variables de entorno para modo prueba.

Estrategia:

- Definir una sola fuente de verdad.
- Para P0, calculo de fechas debe usar `AppConfig`.
- El modo prueba debe revisarse antes de afirmar que UI controla envios reales.

## Estrategia para no perder historial

Reglas obligatorias:

- Nunca borrar `JwMessageLog` en operaciones normales.
- Nunca modificar logs ya creados salvo correcciones administrativas explicitas futuras.
- No borrar recordatorios `SENT`.
- No borrar recordatorios `FAILED`; pueden quedar como evidencia.
- Cancelar `PENDING` obsoletos en vez de borrarlos.
- Usar `CANCELLED` y `ARCHIVED` para cerrar entidades.
- Registrar eventos de auditoria para cambios automaticos.
- Asociar semanas existentes a `MonthlySchedule` mediante backfill.
- Asociar recordatorios existentes a `AutomationPlan` mediante backfill.

## Fases de implementacion P0

### P0.1 - Fechas y zona horaria

- Crear helper unico para calcular `scheduledAt`.
- Usar `America/Mexico_City` por defecto.
- Leer `TIMEZONE` desde `AppConfig`.
- Leer `REMINDER_SEND_HOUR` desde `AppConfig`.
- Usar `meetingDate` como fecha local.
- Usar `meetingTime` para validar `SAME_DAY`.
- Evitar construcciones que interpreten fechas locales como medianoche UTC.

### P0.2 - Generacion correcta de recordatorios

- Crear `AutomationPlan` activo por asignacion.
- Crear `ReminderDelivery` por destinatario y tipo.
- Crear `INITIAL_NOTICE`.
- Aplicar reglas por destinatario.
- Excluir `SEVEN_DAYS_BEFORE` para acompanante.
- Evitar duplicados exactos.
- Llenar snapshots al crear/editar asignaciones.

### P0.3 - Regeneracion por cambios

- Detectar cambios relevantes en asignacion y semana.
- Marcar `AutomationPlan` anterior como `SUPERSEDED`.
- Cancelar entregas pendientes anteriores.
- Crear nuevo `AutomationPlan`.
- Crear nuevas `ReminderDelivery` con fechas correctas.
- Conservar enviados y logs.
- Registrar evento de auditoria.

### P0.4 - Cancelacion y cambio

- Implementar `CHANGE_NOTICE`.
- Implementar `CANCELLATION_NOTICE`.
- Cancelar pendientes.
- Conservar historial.

### P0.5 - Eliminacion segura

- Agregar estado de semana.
- No permitir borrar semana con historial.
- Implementar cancelacion/archivo de semana.

### P0.6 - Pruebas

Crear pruebas para:

- crear semana futura;
- crear semana a un mes;
- crear varias semanas;
- cambiar asignado;
- cambiar acompanante;
- cambiar fecha;
- cambiar hora;
- cancelar asignacion;
- completar asignacion;
- borrar semana sin historial;
- archivar semana con historial;
- verificar que historial no se pierde;
- verificar escenario 1 de junio, reunion 3 de julio 19:00, envio 09:00 CDMX.

### P0.7 - Cierre de arquitectura operativa

- Dejar aprobado el diseno del Centro de Automatizaciones.
- Dejar aprobado el modelo de Dashboard operativo.
- No implementar todavia la pantalla `/dashboard/automatizaciones`.
- No incluir generador automatico de asignaciones.
- Usar este documento como contrato para implementar P0 sin volver a cambiar la arquitectura base.

## Casos de prueba minimos

### Caso 1 - Semana futura

Entrada:

```text
now = 2026-06-01T12:00:00 America/Mexico_City
weekStartDate = 2026-06-29
meetingDate = 2026-07-03
meetingTime = 19:00
TIMEZONE = America/Mexico_City
REMINDER_SEND_HOUR = 9
```

Esperado asignado:

| Tipo | Local esperado |
|---|---|
| `INITIAL_NOTICE` | inmediato |
| `SEVEN_DAYS_BEFORE` | 2026-06-26 09:00 CDMX |
| `THREE_DAYS_BEFORE` | 2026-06-30 09:00 CDMX |
| `ONE_DAY_BEFORE` | 2026-07-02 09:00 CDMX |
| `SAME_DAY` | 2026-07-03 09:00 CDMX |

Esperado acompanante:

| Tipo | Local esperado |
|---|---|
| `INITIAL_NOTICE` | inmediato |
| `THREE_DAYS_BEFORE` | 2026-06-30 09:00 CDMX |
| `ONE_DAY_BEFORE` | 2026-07-02 09:00 CDMX |
| `SAME_DAY` | 2026-07-03 09:00 CDMX |

### Caso 2 - Cambio de asignado

Entrada:

- asignado anterior: Publicador A;
- asignado nuevo: Publicador B;
- hay recordatorios `PENDING`;
- hay un `INITIAL_NOTICE` ya `SENT`.

Esperado:

- `PENDING` de A pasan a `CANCELLED`.
- `SENT` de A se conservan.
- Se crean recordatorios nuevos para B.
- Se crea `CHANGE_NOTICE` si aplica.
- `JwMessageLog` no se borra.

### Caso 3 - Cambio de fecha

Entrada:

- reunion cambia de 2026-07-03 a 2026-07-10.

Esperado:

- Recordatorios `PENDING` anteriores pasan a `CANCELLED`.
- Recordatorios `SENT` se conservan.
- Se crean nuevos recordatorios con base en 2026-07-10.
- Se crea `CHANGE_NOTICE` si ya habia avisos enviados o recordatorios activos.

### Caso 4 - Cancelar asignacion

Entrada:

- asignacion activa con recordatorios generados.

Esperado:

- asignacion queda `CANCELLED`.
- pendientes normales quedan `CANCELLED`.
- se crea `CANCELLATION_NOTICE` inmediato si aplica.
- historial se conserva.

### Caso 5 - Completar asignacion

Entrada:

- asignacion activa con pendientes futuros.

Esperado:

- asignacion queda `COMPLETED`.
- pendientes futuros quedan `CANCELLED`.
- no se crea `CANCELLATION_NOTICE`.
- historial se conserva.

### Caso 6 - Eliminar semana con historial

Entrada:

- semana con asignaciones, recordatorios o logs.

Esperado:

- no se hace hard delete.
- se ofrece cancelar o archivar.
- logs permanecen.

### Caso 7 - Programa mensual y centro operativo

Entrada:

- existen varias semanas de julio 2026;
- existen entregas programadas para hoy, manana y dias futuros.

Esperado:

- todas las semanas pertenecen a `MonthlySchedule` Julio 2026.
- el modelo permite consultar entregas por programa mensual.
- el diseno del Centro de Automatizaciones permite filtrar por Julio 2026.
- el diseno del Dashboard operativo define como responder que se enviara hoy y manana sin depender de interpretar contadores sueltos.

## Criterios de aceptacion P0

P0 se considera corregido cuando:

- Cada semana pertenece a un `MonthlySchedule`.
- Cada asignacion con recordatorios generados tiene un `AutomationPlan` activo o historico.
- Cada mensaje programado existe como `ReminderDelivery`.
- El escenario 1 de junio / 3 de julio / 19:00 produce fechas locales correctas.
- `INITIAL_NOTICE` se crea para asignado y acompanante.
- El acompanante no recibe `SEVEN_DAYS_BEFORE`.
- Cambiar asignado o acompanante no deja pendientes obsoletos activos.
- Cambiar fecha/hora regenera pendientes con fechas correctas.
- Cancelar asignacion crea aviso de cancelacion cuando corresponde.
- Cambiar asignacion crea aviso de cambio cuando corresponde.
- Completar asignacion cancela pendientes sin generar cancelacion.
- Eliminar semana con historial no borra logs.
- Snapshots se llenan al crear/editar asignaciones.
- Los mensajes enviados se conservan siempre como historial.
- El diseno del Dashboard operativo queda documentado.
- El diseno del Centro de Automatizaciones queda documentado para P1.

## Diagramas de secuencia

### Crear automatizacion

```text
Administrador
    |
    | Crear/generar recordatorios
    v
Backend API
    |
    | Validar semana, asignacion, publicadores, configuracion
    v
AutomationPlan
    |
    | Expandir reglas por rol y tipo
    v
ReminderDelivery
    |
    | Quedan PENDING hasta scheduledAt
    v
Worker
```

Secuencia detallada:

1. Administrador solicita generar recordatorios para una asignacion o semana.
2. Backend API lee `TIMEZONE`, `REMINDER_SEND_HOUR`, semana, asignacion y publicadores.
3. Backend API crea `AutomationPlan DRAFT`.
4. Backend API calcula entregas con helper unico de fechas.
5. Backend API crea `ReminderDelivery PENDING`.
6. Backend API cambia `AutomationPlan` a `ACTIVE`.
7. Backend API cambia asignacion a `SCHEDULED`.
8. Backend API crea eventos `AUTOMATION_PLAN_CREATED`, `REMINDERS_GENERATED` y `REMINDER_DELIVERY_CREATED`.
9. Worker procesara las entregas cuando venzan.

### Envio de mensaje

```text
Worker
    |
    | Toma ReminderDelivery vencida
    v
WhatsApp Service
    |
    | Envia mensaje
    v
WhatsApp
    |
    | Resultado
    v
MessageAttempt
    |
    | Actualizar estado
    v
ReminderDelivery
```

Secuencia detallada:

1. Worker busca entregas `PENDING` o reintentos vencidos.
2. Worker bloquea/toma la entrega pasando a `QUEUED`.
3. Worker valida plan, semana, asignacion y publicador.
4. Worker pasa la entrega a `SENDING`.
5. Worker renderiza mensaje.
6. Worker llama WhatsApp Service.
7. Worker crea `MessageAttempt`.
8. Worker actualiza `ReminderDelivery` a `SENT`, `FAILED`, `SKIPPED`, `CANCELLED` o `DEAD`.
9. Worker crea `JwAutomationEvent`.
10. Dashboard, Historial y Centro de Automatizaciones reflejan el nuevo estado.

## Architectural Decisions

### ADR-001 - Introducir MonthlySchedule desde P0

Decision:

- Crear `MonthlySchedule` desde P0 aunque el generador mensual inteligente sea P2/P3.

Motivo:

- El negocio se organiza por programas mensuales, no por semanas aisladas.
- Agregarlo despues obligaria a migrar semanas, entregas e historial ya existentes.
- Permite filtrar dashboard y automatizaciones por mes desde temprano.

Consecuencia:

- P0 agrega una entidad adicional y backfill, pero reduce refactorizaciones futuras.

### ADR-002 - Separar AutomationPlan y ReminderDelivery

Decision:

- `AutomationPlan` representa la regla.
- `ReminderDelivery` representa cada mensaje concreto.

Motivo:

- Una regla puede generar varias entregas.
- Un cambio de asignacion debe reemplazar el plan sin borrar entregas historicas.
- La pantalla de automatizaciones necesita mostrar entregas, pero la auditoria necesita conocer que plan las produjo.

Consecuencia:

- El modelo es mas claro y permite versiones de plan.

### ADR-003 - Usar MessageAttempt como historial inmutable

Decision:

- Cada intento real de envio se registra como `MessageAttempt`/`JwMessageLog` y no se modifica en flujo normal.

Motivo:

- El administrador necesita saber que se intento enviar, a quien, cuando, con que cuerpo y con que resultado.
- Los errores de WhatsApp requieren trazabilidad.

Consecuencia:

- El historial puede crecer, pero se conserva evidencia operativa.

### ADR-004 - No borrar historial

Decision:

- No borrar mensajes, intentos, eventos, planes con entregas ni entregas terminales.

Motivo:

- Borrar historial destruye auditoria y hace imposible explicar envios pasados.
- Cambios y cancelaciones deben ser visibles, no invisibles.

Consecuencia:

- Se usan estados (`CANCELLED`, `ARCHIVED`, `DEAD`) en vez de eliminacion fisica.

### ADR-005 - Usar soft delete

Decision:

- Publicadores y entidades con historial usan soft delete.

Motivo:

- Un publicador eliminado puede aparecer en mensajes y asignaciones pasadas.
- La integridad historica pesa mas que limpiar visualmente la base.

Consecuencia:

- Las consultas operativas deben filtrar `deletedAt = null` o `isActive = true`.

### ADR-006 - Usar Worker independiente

Decision:

- El envio queda en un Worker separado del Backend API.

Motivo:

- El API debe responder rapido al administrador.
- El envio de WhatsApp es asincrono, lento y propenso a fallos.
- El worker permite reintentos, lotes y recuperacion tras caidas.

Consecuencia:

- Se necesita manejar concurrencia y estados `QUEUED`/`SENDING`.

### ADR-007 - Usar Dashboard operativo

Decision:

- El Dashboard debe responder preguntas de negocio, no solo mostrar contadores.

Motivo:

- Un administrador necesita saber que ocurrira hoy, que fallo y que requiere accion.
- Los contadores sin contexto obligan a investigar manualmente semana por semana.

Consecuencia:

- P0 documenta el modelo.
- P1 implementa Centro de Automatizaciones y evolucion del Dashboard.

## Roadmap oficial

### P0 - Motor estable

Objetivo:

- Corregir el motor actual de automatizaciones.
- Introducir `MonthlySchedule`, `AutomationPlan`, `ReminderDelivery` y `MessageAttempt`.
- Corregir fechas, zona horaria y hora de envio.
- Crear aviso inicial, cambio y cancelacion.
- Regenerar correctamente ante cambios.
- No perder historial.
- Dejar documentada la arquitectura del Dashboard operativo y Centro de Automatizaciones.

No incluye:

- Generador automatico de asignaciones.
- Implementacion completa del Centro de Automatizaciones.
- Integraciones externas de programas.

### P1 - Centro de Automatizaciones

Objetivo:

- Implementar `/dashboard/automatizaciones`.
- Mostrar entregas por hoy, manana, semana y mes.
- Filtrar por estado, publicador, rol, semana y programa mensual.
- Evolucionar el Dashboard para responder preguntas operativas.
- Permitir inspeccionar fallidos y pendientes sin entrar semana por semana.

### P2 - Programa mensual inteligente

Objetivo:

- Fortalecer `MonthlySchedule` como unidad operativa principal.
- Mejorar navegacion y reportes por mes.
- Preparar reglas para distribucion futura de asignaciones.
- Permitir planificar y cerrar meses completos.

### P3 - Generador automatico de asignaciones

Objetivo:

- Generar asignaciones automaticamente dentro de un programa mensual.
- Distribuir lecturas, asignaciones de "Seamos mejores maestros" y acompanantes.
- Considerar equidad, disponibilidad, historial y restricciones por publicador.
- Mantener aprobacion humana antes de generar automatizaciones.

### P4 - Integracion con fuente oficial

Objetivo:

- Evaluar si existe una fuente tecnica confiable para programas de Vida y Ministerio.
- Validar viabilidad legal y terminos de uso antes de cualquier integracion.
- Si es apropiado, importar estructura semanal para reducir captura manual.
- Si no es viable, mantener carga manual o plantillas internas.
