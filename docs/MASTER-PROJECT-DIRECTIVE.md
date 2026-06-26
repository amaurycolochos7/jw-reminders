# JW-REMINDERS - Master Project Directive v1.0

## Proposito

Este documento es la directiva principal del proyecto JW-REMINDERS.

Todas las decisiones futuras deben respetarlo. Si una tarea posterior contradice esta directiva, prevalece esta directiva salvo aprobacion explicita del administrador del proyecto.

El objetivo no es solo escribir codigo. El objetivo es construir un producto profesional, estable, escalable, mantenible y listo para operar durante anos.

## Principios

1. La calidad tiene prioridad sobre la velocidad.
2. Ninguna funcionalidad puede romper otra.
3. Todo cambio importante debe poder auditarse.
4. La arquitectura debe permitir crecimiento sin reescribir el sistema.
5. Las responsabilidades deben permanecer desacopladas: UI, API, Worker, Scheduler, base de datos, providers, automatizaciones, asignaciones, programas e importaciones.

## Ciclo de desarrollo obligatorio

Cada funcionalidad debe pasar por:

```text
Investigacion
  -> Analisis
  -> Diseno
  -> Arquitectura
  -> Implementacion
  -> Pruebas locales
  -> Pruebas funcionales
  -> Deploy
  -> Pruebas en produccion
  -> Documentacion
  -> Cierre
```

No se deben omitir etapas.

## Automatizaciones

Toda automatizacion debe tener:

```text
Plan
  -> Reglas
  -> Destinatarios
  -> Programacion
  -> Ejecucion
  -> Intentos
  -> Resultado
  -> Historial
  -> Auditoria
```

Nunca se deben enviar mensajes directamente desde una accion de UI o API sin pasar por entidades persistentes que representen el proceso completo.

## Importaciones

Los datos pertenecen al sistema, no al proveedor.

Toda integracion debe seguir:

```text
Provider
  -> Parser
  -> Validator
  -> Normalizer
  -> Importer
  -> Persistencia
```

Nunca se debe importar directamente a la base de datos desde un proveedor externo.

## Programas

Un programa mensual contiene:

```text
Semanas
  -> Templates
  -> Asignaciones
  -> Automatizaciones
  -> Mensajes
```

Estas entidades no deben mezclarse.

## Asignaciones

Las asignaciones tienen ciclo de vida:

```text
Template
  -> Propuesta
  -> Aprobada
  -> Programada
  -> Recordatorios
  -> Completada
  -> Archivada
```

Cada estado debe tener reglas claras y auditables.

## Dashboard

El Dashboard no debe ser un conjunto de tarjetas aisladas. Debe responder inmediatamente:

- Que debo hacer hoy.
- Que esta pendiente.
- Que ya termino.
- Que fallo.
- Que requiere atencion.
- Cuantos mensajes saldran hoy.
- Que semanas siguen incompletas.
- Que programas estan pendientes.

## UX

El usuario nunca debe preguntarse que sigue.

Cada pantalla debe dejar claro:

- donde esta;
- que puede hacer;
- que falta;
- cual es el siguiente paso.

## Diseno

El producto debe cumplir `DESIGN.md` y `docs/DESIGN-SYSTEM-JW-REMINDERS.md`.

Reglas obligatorias:

- no usar emojis;
- no usar colores fuera de la guia;
- no improvisar componentes;
- no introducir estilos inconsistentes;
- no usar `alert()` ni `confirm()` nativos;
- mantener una sola experiencia visual.

## Responsive

Mobile first.

Toda pantalla debe funcionar correctamente en:

- 320 px;
- 360 px;
- 390 px;
- 412 px;
- 768 px;
- 1024 px;
- 1366 px;
- 1440 px;
- 1920 px.

No debe haber scroll horizontal accidental, elementos ocultos ni desbordes incoherentes.

## Seguridad

Reglas obligatorias:

- endpoints protegidos;
- JWT validado;
- roles respetados cuando existan;
- variables en entorno;
- contrasenas hasheadas;
- logs sin secretos;
- WhatsApp no debe enviar mensajes si el sistema no esta listo.

## QA

No basta con compilar.

La verificacion debe cubrir, segun aplique:

- pruebas unitarias;
- pruebas funcionales;
- pruebas de integracion;
- smoke tests;
- pruebas en produccion.

## DevOps

Todo cambio que afecte el producto debe cerrar con:

```text
Commit
  -> Push
  -> Deploy
  -> Migraciones
  -> Health checks
  -> Smoke test
  -> Verificacion manual
  -> Reporte
```

No se debe considerar terminado un cambio de producto sin validar produccion.

## Documentacion

Toda modificacion relevante debe actualizar, segun corresponda:

- `docs/REPORTE-FINAL-JW-REMINDERS.md`;
- `CHANGELOG.md`;
- `RELEASE.md`;
- `DEPLOY.md`;
- `ARCHITECTURE.md`.

La documentacion debe reflejar el estado real del sistema.

## Prohibiciones

Nunca:

- dejar codigo muerto;
- dejar `TODO` o `FIXME`;
- hardcodear datos sensibles;
- duplicar logica;
- romper compatibilidad sin migracion;
- ocultar errores;
- asumir que algo funciona sin probarlo.

## Definicion de terminado

Una tarea solo se considera terminada cuando:

- compila;
- pasa pruebas;
- se despliega cuando afecta el producto;
- funciona en produccion cuando afecta el producto;
- esta documentada;
- no rompe modulos existentes;
- cumple `DESIGN.md`;
- cumple esta directiva.

Hasta entonces, la tarea sigue abierta.

