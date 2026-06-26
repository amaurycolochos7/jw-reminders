# Architecture

## Fuente de verdad

La arquitectura del proyecto queda gobernada por:

- `docs/MASTER-PROJECT-DIRECTIVE.md`
- `docs/AUTOMATION-MODEL-FIX.md`
- `docs/P4-JW-SOURCE-RESEARCH.md`
- `docs/DESIGN-SYSTEM-JW-REMINDERS.md`

## Componentes

```text
Panel Web
  -> Backend API
    -> PostgreSQL
    -> Worker
    -> WhatsApp Service
      -> WhatsApp
```

## Responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| Web | Panel administrativo, flujo operativo, dashboard, programas, propuestas, importacion y supervision. No decide reglas criticas. |
| API | Reglas de dominio, validacion, persistencia, auditoria, importaciones, generacion de planes y entregas. |
| Worker | Procesa `ReminderDelivery`, valida estado vigente, envia por WhatsApp Service, registra intentos y eventos. |
| WhatsApp Service | Adaptador tecnico del canal WhatsApp. No es fuente de verdad. |
| PostgreSQL | Estado transaccional, historial, eventos, planes, entregas y configuracion. |

## Modelo de automatizacion

```text
MonthlySchedule
  -> JwMeetingWeek
    -> AssignmentTemplate
    -> JwAssignment
      -> AutomationPlan
        -> ReminderDelivery
          -> JwMessageLog
```

`JwAutomationEvent` registra eventos de dominio y ejecucion.

## Importaciones

```text
Provider
  -> Parser
  -> Validator
  -> Normalizer
  -> Importer
  -> Persistencia
```

Providers actuales:

- ManualProvider;
- ImportProvider;
- JWProvider documentado como no disponible por ahora.

## Reglas no negociables

- No enviar mensajes sin `AutomationPlan` y `ReminderDelivery`.
- No borrar historial operativo.
- No usar `alert()` ni `confirm()` nativos.
- No hacer scraping de JW.ORG.
- No mezclar templates, propuestas, asignaciones, automatizaciones y mensajes.

