# Changelog

## Unreleased

- Se versiono `docs/MASTER-PROJECT-DIRECTIVE.md` como directiva principal del proyecto.
- Se agregaron documentos raiz de gobierno: `ARCHITECTURE.md`, `DEPLOY.md`, `RELEASE.md` y `CHANGELOG.md`.
- Se actualizo `README.md` y el reporte final para referenciar la Directiva Maestra.

## 2026-06-25 - P4 Providers

- Se implemento arquitectura desacoplada de providers para importacion de programas.
- Se agregaron ManualProvider e ImportProvider.
- Se documento JWProvider como no disponible hasta existir una fuente oficial/viable.
- Se agrego `AssignmentTemplate` y el generador de propuestas usa templates cuando existen.
- Fase probada localmente y en produccion.

## 2026-06-25 - P3 Generador de asignaciones

- Se implemento generador de propuestas revisables.
- Se agrego estado `PROPOSED`.
- Se agrego revision, edicion, aprobacion y descarte de propuestas.
- Se impidio generar automatizaciones sobre propuestas no aprobadas.
- Fase probada localmente y en produccion.

## 2026-06-25 - P2 Programa mensual

- Se fortalecio `MonthlySchedule` como unidad operativa.
- Se agrego detalle del programa, metricas, acciones masivas y completitud.
- Se agrego estado `COMPLETED` para programas mensuales.
- Fase probada localmente y en produccion.

## 2026-06-25 - P1 Centro de Automatizaciones

- Se implemento el Centro Global de Automatizaciones.
- Se agregaron filtros por rango, estado, rol, publicador y programa.
- El Dashboard evoluciono hacia preguntas operativas.
- Fase probada localmente y en produccion.

## 2026-06-25 - P0 Motor estable

- Se separaron `AutomationPlan`, `ReminderDelivery` y `JwMessageLog`.
- Se agrego `MonthlySchedule` y auditoria con `JwAutomationEvent`.
- Se corrigio timezone `America/Mexico_City` y hora `REMINDER_SEND_HOUR`.
- Se agregaron `INITIAL_NOTICE`, `CHANGE_NOTICE` y `CANCELLATION_NOTICE`.
- Se corrigio que el acompanante no reciba recordatorio de 7 dias.
- Se conservaron historiales al editar, cancelar, completar o archivar.
- Fase probada localmente y en produccion.

