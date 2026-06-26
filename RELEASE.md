# Release

## Estado actual

JW-REMINDERS tiene implementadas y desplegadas las fases:

- P0 - Motor estable de automatizaciones;
- P1 - Centro global de automatizaciones;
- P2 - Programa mensual;
- P3 - Generador automatico de asignaciones con propuesta revisable;
- P4 - Arquitectura de Providers e importacion segura.

## Ultimos commits funcionales

Ver `docs/REPORTE-FINAL-JW-REMINDERS.md` para el detalle completo de commits, pruebas locales, deploys y smoke tests de produccion.

## Politica de cierre

Una release solo se considera cerrada cuando cumple:

- build y typecheck limpios;
- pruebas unitarias/funcionales segun aplique;
- migraciones aplicadas;
- deploy en Dokploy;
- smoke tests de produccion;
- documentacion actualizada;
- cumplimiento de `docs/MASTER-PROJECT-DIRECTIVE.md`.

## Notas operativas

- `TEST_MODE=true` envia mensajes al telefono de prueba configurado.
- WhatsApp requiere sesion valida para envios reales.
- No se implementa scraping ni integracion automatica con JW.ORG.

