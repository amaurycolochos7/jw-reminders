# TECHNICAL DEBT & AUDITORIA FINAL

> Auditoria pre-v1.0. **Solo documenta**: no se refactoriza ni se cambia comportamiento (salvo bug critico, ninguno encontrado en esta auditoria).
> Severidad: A (critico), M (medio), B (bajo). Cada item indica evidencia y propuesta (no aplicada).

---

## 1. Resumen de la auditoria (preguntas requeridas)

| Pregunta | Respuesta corta |
|---|---|
| Hay codigo duplicado? | Si, puntual: helpers de fechas y de "completitud" repetidos en 3-5 lugares. |
| Hay modulos demasiado grandes? | Si: `monthly-schedules.service.ts` y `operational-center.service.ts`. |
| Hay tablas innecesarias? | Si: `JwAssignmentReminder` (legacy, sin uso en el flujo actual). |
| Hay endpoints innecesarios? | Posible: modulo `reminders` (legacy) y campos legacy del dashboard. |
| Hay dependencias innecesarias? | No claras; `puppeteer`/`whatsapp-web.js` es el riesgo, no un sobrante. |
| Hay oportunidades claras de refactor? | Si: centralizar helpers de fecha/completitud y retirar codigo muerto. |

Veredicto general: **arquitectura solida y coherente** (estados, versionado, capas desacopladas). La deuda es acotada y de mantenimiento, no estructural.

---

## 2. Codigo duplicado (M)

- **`meetingDatesForMonth(year, month, dow)`** duplicada en `monthly-schedules.routes.ts` y `services/providers/manual.provider.ts`. Misma logica (fechas de reunion del mes).
  - Propuesta: mover a `services/date-utils.ts` y reusar.
- **Logica de "completitud" de semana/programa** repetida en `operational-center.service.ts`, `monthly-schedules.service.ts` y `web/.../semanas/page.tsx` (los mismos 4 pasos). Confirmado por busqueda (`weekCompletion`/`completionForWeek`/`completion`).
  - Propuesta: una funcion compartida (`shared` o `date-utils`) y un endpoint que la exponga para el frontend.
- **Buckets de estado de entregas** (pending/sent/failed/cancelled) calculados en varios servicios (`monthly-schedules.service`, `operational-center.service`, `automation-center.routes`).
  - Propuesta: helper unico `bucketDeliveries(status[])`.
- Helpers menores (`localDate`, `utcMidnight`, `pairKey`) repetidos entre archivos.

Impacto: riesgo de divergencia (que una vista calcule distinto que otra). Bajo riesgo funcional hoy porque las definiciones coinciden.

---

## 3. Modulos demasiado grandes (M)

- **`apps/api/src/modules/monthly-schedules/monthly-schedules.service.ts`** (~550 lineas): concentra metricas, generacion de semanas/asignaciones, automatizaciones masivas y todo el ciclo de propuestas.
  - Propuesta: separar en `proposal.service.ts` y `program-metrics.service.ts`.
- **`apps/api/src/modules/dashboard/operational-center.service.ts`** (~430 lineas): una sola funcion arma todo el Centro Operativo con muchas consultas.
  - Propuesta: dividir por seccion (system/programs/weeks/automations/calendar) y componer; o cachear partes.
- **`apps/web/src/app/dashboard/page.tsx`** (~790 lineas): muchos subcomponentes en un archivo.
  - Propuesta: extraer paneles a `components/operational/`.

Ninguno es bloqueante; son candidatos a division para mantenibilidad.

---

## 4. Tablas innecesarias / a revisar

- **`JwAssignmentReminder` (A para limpieza, B funcional)**: modelo legacy previo a `AutomationPlan`/`ReminderDelivery`. No participa en el flujo actual. El worker, la generacion y el Centro de Automatizaciones usan `ReminderDelivery`.
  - Propuesta: deprecar formalmente y, tras confirmar que no hay datos vivos, retirar en una migracion dedicada. No borrar a la ligera (revisar datos historicos primero).
- El resto de tablas tienen proposito claro (ver `DATABASE-ARCHITECTURE.md`).

---

## 5. Endpoints innecesarios / a revisar

- **Modulo `reminders`** (`/api/reminders`): parece de consulta legacy, solapado con `automation-center`. Verificar si el frontend lo usa; si no, deprecar.
- **Campos legacy del dashboard** (`stats`, `operations`, `systemStatus`, `assignments`, `activity`) que `dashboard.routes.ts` mantiene por compatibilidad junto a `operationalCenter`.
  - Propuesta: una vez confirmado que solo el Centro Operativo consume `/api/dashboard`, retirar los campos legacy.
- **`generate-assignments` (directo)** en `monthly-schedules` coexiste con el flujo de **propuesta** (P3). No es un bug, pero hay dos caminos para crear asignaciones; conviene documentar cual es el recomendado (la propuesta) y, eventualmente, unificar.

---

## 6. Codigo muerto en frontend (B)

- **`components/MetricsPanel.tsx`** y **`components/WorkflowGuide.tsx`**: tras la reescritura del dashboard (P4.5) ya no se importan en ninguna pagina (busqueda: solo aparecen en su propio archivo).
  - Propuesta: confirmar y eliminar, o reintegrar si se desean.

---

## 7. Dependencias

- No se detectan dependencias claramente sobrantes. `helmet`, `cors`, `zod`, `bcryptjs`, `jsonwebtoken` estan justificadas.
- **`whatsapp-web.js` + `puppeteer/Chromium` (A de riesgo, no de sobrante)**: dependencia pesada y fragil (automatiza WhatsApp Web no oficial). Es el mayor riesgo externo. Mitigacion estrategica: abstraer canal de envio (ver `SCALABILITY.md`) y evaluar WhatsApp Cloud API.
- `pnpm-workspace.yaml` declara allowlist de builds nativos (prisma/esbuild/puppeteer) — correcto para pnpm 9.

---

## 8. Acoplamientos y partes criticas

- **Envio acoplado a WhatsApp**: el worker llama directo a `whatsapp-client.ts`/HTTP `/send`. Acoplado a un canal. Propuesta: interfaz `MessageChannel`.
- **Mono-tenant**: el dominio asume una congregacion; `congregationId` existe pero no se usa. Acoplamiento implicito en consultas. Propuesta: scoping por tenant antes de multi-congregacion.
- **Sesion WhatsApp unica y estado en memoria/disco**: punto unico de fallo del envio.
- **Worker single-instance + "cola en tabla"**: simple y robusto para el volumen actual; no escala horizontalmente sin una cola real.

---

## 9. Riesgos de fiabilidad

- **Entregas huerfanas `QUEUED`/`SENDING`** si el worker cae justo despues de reclamar y antes de finalizar: no hay barrido de recuperacion que las devuelva a `PENDING`. Hoy mitigado porque el operador puede reintentar manualmente.
  - Propuesta: un "sweep" que reponga a `PENDING` las entregas en `QUEUED/SENDING` con `lastAttemptAt` antiguo.
- **WhatsApp no listo**: si la sesion no esta `READY`, todos los envios fallan y reintentan (correcto), pero conviene una alerta proactiva (ya existe en el Centro Operativo).

---

## 10. Seguridad (deuda)

- **`JWT_SECRET` con fallback `"secret"`** en `auth.service`/`middleware` si la env falta (A): asegurar que en produccion la variable siempre este definida y eliminar el fallback.
- **Sin RBAC, sin refresh tokens, sin rate limiting** en la API (M).
- **Worker y servicio WhatsApp sin autenticacion** (A si se exponen): hoy dependen del aislamiento de red interna de Docker. No deben publicarse puertos al exterior.
- Sin multi-tenant: un admin ve todo (M para el caso multi-congregacion).

---

## 11. Pruebas y CI (M)

- Hay **20 pruebas unitarias** (date-utils, assignment-proposal, import pipeline). No hay pruebas de integracion/E2E ni CI automatizado.
  - Propuesta: pipeline CI (typecheck + build + tests) y pruebas de integracion del worker y de los endpoints criticos.

---

## 12. Oportunidades de refactor (resumen, no aplicadas)

| # | Refactor | Severidad | Beneficio |
|---|---|---|---|
| 1 | Centralizar `meetingDatesForMonth` y helpers de fecha en `date-utils` | M | Menos divergencia |
| 2 | Funcion unica de completitud (semana/programa) compartida | M | Consistencia UI/API |
| 3 | Helper unico de buckets de entregas | M | Consistencia metricas |
| 4 | Dividir `monthly-schedules.service` y `operational-center.service` | M | Mantenibilidad |
| 5 | Retirar `JwAssignmentReminder` (tras verificar datos) | B/A | Esquema mas limpio |
| 6 | Retirar `reminders` y campos legacy del dashboard si no se usan | B | Superficie menor |
| 7 | Eliminar componentes muertos (`MetricsPanel`, `WorkflowGuide`) | B | Menos ruido |
| 8 | Abstraer `MessageChannel` (desacoplar WhatsApp) | M | Escala/robustez |
| 9 | Eliminar fallback de `JWT_SECRET`; endurecer auth | A | Seguridad |
| 10 | Sweep de recuperacion de entregas huerfanas | M | Fiabilidad del envio |

---

## 13. Conclusion

El sistema esta listo para congelar como v1.0 a nivel arquitectonico: el modelo de estados, el versionado de planes, el locking del worker y las capas desacopladas (Providers) son decisiones correctas y extensibles. La deuda identificada es **acotada y de mantenimiento** (duplicacion menor, codigo muerto, endurecimiento de seguridad, preparacion multi-tenant), no estructural. Ninguna requiere reescritura. Las prioridades antes de crecer: endurecer seguridad (#9), preparar multi-tenant (`congregationId`), y desacoplar el canal de envio (#8).

No se realizo ningun cambio de codigo en esta fase (solo documentacion). No se encontro ningun bug critico que comprometiera la estabilidad.
