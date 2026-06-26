# Changelog

## Unreleased

- Se versiono `docs/MASTER-PROJECT-DIRECTIVE.md` como directiva principal del proyecto.
- Se agregaron documentos raiz de gobierno: `ARCHITECTURE.md`, `DEPLOY.md`, `RELEASE.md` y `CHANGELOG.md`.
- Se actualizo `README.md` y el reporte final para referenciar la Directiva Maestra.

## 2026-06-25 - P4.5 Centro Operativo

- Se reescribio el Dashboard como Centro Operativo: una sola pantalla para responder que hacer hoy, que esta mal, que sigue, que termino y que requiere atencion.
- Nuevo servicio `operational-center.service` que integra estado del sistema (worker/scheduler/WhatsApp/TEST_MODE/ultima sincronizacion/ultimo envio), programas, semanas, propuestas, automatizaciones (hoy/manana/proximas 7/vencidas/fallidas/canceladas), publicadores, flujo recomendado dinamico, panel de alertas inteligentes y calendario operativo mensual.
- Acciones rapidas y navegacion directa desde el dashboard; auto-actualizacion cada 30s.
- Cumple DESIGN.md (paleta ink/fog/graphite/azure/caution), sin emojis, sin `alert()`/`confirm()`, responsive.
- `next.config.js`: toggle `NEXT_OUTPUT` para build local sin standalone; `pnpm-workspace.yaml`: allowlist de dependencias con build nativo.
- Probado localmente (typecheck, build, 20 tests, smoke del endpoint) y en produccion (deploy via API de Dokploy).

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

