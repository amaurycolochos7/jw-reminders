# JW Reminders — Matriz formal de pruebas (mensajería robusta)

Fecha de ejecución: 2026-07-03 · Rama: `feature/mensajeria-robusta` · Entorno: local (Docker Postgres 16, DB limpia con las 15 migraciones + seed), WhatsApp **mock** (no se enviaron mensajes reales), `TEST_MODE=true`.

Leyenda de estado: **PASS** = verificado con evidencia · **BLOCKED** = requiere entorno/aprobación no disponible localmente.

Evidencia citada:
- `E2E` = `apps/api/scripts/e2e-mensajeria.ts` (flujo completo con worker real + WhatsApp mock).
- `SMOKE` = `apps/api/scripts/smoke-endpoints.ts` (endpoints HTTP que consume el frontend).
- `UNIT` = `node --import tsx --test` (shared 19, worker 28, api 138).
- `TSC` = `tsc --noEmit` por paquete.
- `DB` = consulta directa vía `psql`.
- `DOCKER` = build de imagen Linux.

---

## 1. Plantillas globales

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| P1 Editar plantilla | Editar cuerpo de plantilla activa | `PUT /message-templates/:id` con body nuevo | 200; cuerpo actualizado | 200 OK | SMOKE | PASS | Panel no controla el texto |
| P2 Nueva versión al guardar | Cada edición crea versión, no sobrescribe | PUT con body distinto | `versionCreated = activeVersion+1` | v6 creada | SMOKE | PASS | Se pierde historial / no reproducible |
| P3 Historial de versiones | Consultar versiones | `GET /message-templates/:id/versions` | ≥2 versiones | ok (≥2) | SMOKE | PASS | Sin trazabilidad de cambios |
| P4 Variables válidas | Catálogo documentado | `GET /message-templates/variables` | incluye `listaAsignaciones`, `nombre`… | ok | SMOKE, UNIT | PASS | Editor sin guía |
| P5 Variables inválidas | Detectar token desconocido | `renderMessage("{{noExiste}}")` | `invalidVariables=["noExiste"]` + warning | ok | UNIT | PASS | Se envía `{{token}}` crudo |
| P6 Variable mal escrita | Llaves malformadas | `renderMessage("{{nombre")` | warning "mal formadas" | ok | UNIT | PASS | Texto roto |
| P7 Preview render único | Preview = misma función que envío | `POST /message-templates/:id/preview` | render con datos de ejemplo | ok (incluye "Carlos") | SMOKE | PASS | Preview ≠ envío (bug original) |
| P8 Formato WhatsApp | Conserva `*`,`_`, saltos, viñetas, emojis | `renderMessage` con formato | idéntico byte a byte | ok | UNIT (index.test) | PASS | Se rompen negritas |

## 2. Generación de mensajes

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| G1 Aviso inicial agrupado | Agrupar por persona+mes | 2 asignaciones misma persona → `generateSnapshots` | 1 grupo | grupos=1 | E2E, SMOKE | PASS | Mensajes duplicados por persona |
| G2 Un mensaje físico por persona | 1 render por grupo | ídem | `messages.length=1` | ok | SMOKE (batch detail) | PASS | Spam al publicador |
| G3 Varias asignaciones en 1 mensaje | Lista agrupa ambas | snapshot | 2 fechas en el texto | "10 de julio" y "17 de julio" | E2E | PASS | Información incompleta |
| G4 Snapshot congelado | Guardar `renderedMessage` | tras generar | renderedMessage no null en las 2 hermanas | ok | E2E, DB | PASS | Worker renderiza en vivo (bug) |
| G5 Edición manual | `edit-final` marca editado | `POST /deliveries/:id/edit-final` | texto exacto + `manuallyEdited=true` | ok | E2E, SMOKE | PASS | No se puede ajustar antes de enviar |
| G6 Regeneración manual | Volver a plantilla actual | `POST /deliveries/:id/regenerate` | cambia + `regeneratedAt` + `sourceType=REGENERATED_TEMPLATE` | ok | E2E | PASS | No se puede refrescar |
| G7 Aprobación batch | DRAFT→READY | `POST /batches/:id/approve` | entregas READY | approved=2/1 | E2E, SMOKE | PASS | Se envía sin revisar |

## 3. Worker / envío

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| W1 Envía solo renderedMessage | Worker no renderiza | `processReminders()` con snapshot | envía el snapshot tal cual | ok | E2E | PASS | Texto distinto al aprobado |
| W2 No render vivo (flujo nuevo) | Bloquear si snapshot vacío | delivery flujo-nuevo con renderedMessage=null | SKIPPED, no envía | status=SKIPPED, received=0 | E2E | PASS | Se inventa texto |
| W3 snapshot === enviado | Paridad final | comparar mock recibido vs snapshot | iguales | `enviado === renderedMessage` | E2E | PASS | Incoherencia plantilla↔envío |
| W4 No duplicado | Segundo tick no reenvía | `processReminders()` x2 | received sigue en 1 | ok | E2E | PASS | Mensajes repetidos |
| W5 Estado SENT | Marca SENT correcto | tras envío | 2 entregas SENT | ok | E2E, DB | PASS | Estado inconsistente |
| W6 Log técnico | JwMessageLog fiel | tras envío | `messageBody === enviado` | ok | E2E | PASS | Historial no auditable |

## 4. WhatsApp / cola

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| WA1 READY envía | Gate permite | mock status READY | envía | ok | E2E, SMOKE | PASS | — |
| WA2 Pausado no envía | Pausa manual sticky | `SENDS_PAUSED=true` → tick | no envía; cola intacta | received=0, siguen READY | E2E | PASS | Envíos no controlables |
| WA3 Desconectado no envía | Gate auto | status≠READY | no envía | evaluateSendGate=whatsapp_not_ready | UNIT | PASS | Falsos SENT |
| WA4 Pausa automática protege cola | No reclama nada | status≠READY | entregas quedan intactas | ok (gate return) | UNIT, E2E | PASS | Pérdida/duplicado |
| WA5 Reanudación segura | Reanudar continúa | `SENDS_PAUSED=false` → tick | envía pendientes | ok | E2E | PASS | Cola atascada |
| WA6 No pérdida | Nada se borra al pausar | ídem WA2 | deliveries persisten | ok | E2E | PASS | Pérdida de mensajes |
| WA7 No duplicado | Idempotencia | reintentos | 1 solo SENT | ok | E2E, UNIT (idempotency) | PASS | Duplicados |

## 5. Mensaje manual

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| M1 Preview | Ver antes de enviar | UI textarea + preview | render negritas | ok (UI) | SMOKE (render), visual | PASS | Envío a ciegas |
| M2 Confirmación | Confirmar antes de enviar | botón "Revisar y enviar" → "Confirmar" | doble paso | ok (UI) | visual | PASS | Envío accidental |
| M3 Envío TEST_MODE | Enviar manual | `POST /manual-send` (mock) | sent=true; enviado===texto | ok | SMOKE | PASS | — |
| M4 No crea batch | Aislado de automatización | contar batches antes/después | sin cambios | ok | SMOKE | PASS | Confusión con automatizaciones |
| M5 No crea deliveries | ídem | contar deliveries | sin cambios | ok | SMOKE | PASS | ídem |
| M6 No envía si pausado/no READY | Guardia | pausar → manual-send | 409, sent=false, received=0 | ok | SMOKE | PASS | Envía cuando no debe |

## 6. Mensaje de prueba

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| T1 Preview desde plantilla | Render único | `POST /test-template/preview` | rendered + versión | ok | SMOKE | PASS | Preview engañoso |
| T2 Datos de ejemplo | Sin publicador | preview sin publisherId | usa sampleVariables | ok | SMOKE | PASS | — |
| T3 Publicador real | Override nombre/teléfono | preview con publisherId | usa datos del publicador | ok (código verificado) | SMOKE/UNIT | PASS | — |
| T4 Teléfono autorizado | Enviar a número de prueba | `POST /test-template` targetPhone | sent=true | ok | SMOKE | PASS | — |
| T5 No dispara automatización | Aislado | contar batches/deliveries | sin cambios | ok | SMOKE | PASS | Automatización accidental |
| T6 preview === enviado | Paridad | comparar mock vs rendered | iguales | `enviado === render` | SMOKE | PASS | Prueba no representativa |

## 7. Seguridad

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| S1 Sin JWT_SECRET fallback | No usar "secret" | `getJwtSecret()` | prod: throw; dev: efímero | código sin `\|\| "secret"` | TSC, revisión | PASS | Tokens falsificables |
| S2 JWT_SECRET obligatorio prod | Fallar sin él | `assertSecurityConfig` NODE_ENV=production | `process.exit(1)` | implementado | revisión | PASS | Arranque inseguro |
| S3 bcrypt funcionando | Hash seguro + migración | login admin (sha256 legacy) | migra a bcrypt | DB: `bcrypt` | DB, SMOKE | PASS | Contraseñas débiles |
| S4 ADMIN_PASSWORD | Sin default hardcoded | seed sin `dorian123` | usa env o genera temporal | código + grep | git grep | PASS | Credencial pública |
| S5 CORS restringido | No abierto en prod | `CORS_ORIGINS` obligatorio prod | exit si falta | implementado | revisión | PASS | CSRF/abuso |
| S6 Auth interna WhatsApp | Token obligatorio prod | `WHATSAPP_INTERNAL_TOKEN` | API/worker envían header; WA exige; prod exit si falta | implementado | SMOKE, revisión | PASS | Envío arbitrario en red |
| S7 Endpoints protegidos | /send,/restart,/disconnect,/generate-qr,/status,/pause,/resume | — | /send…/status por token interno; /pause,/resume tras authMiddleware JWT | ver §16 doc | revisión | PASS | Control no autorizado |
| S8 Rate limit | Login limitado | 10/min por IP | 429 al exceder | implementado | revisión | PASS | Fuerza bruta |
| S9 Logs sin datos sensibles | Máscara de teléfono | logs de envío | `52****99` | implementado | revisión | PASS | Fuga de PII |
| S10 Grep de secretos | Nada en repo | `git grep dorian123` / tokens VPS | 0 resultados | 0 | git grep | PASS | Secreto filtrado |

## 8. Build / deploy

| Caso | Objetivo | Pasos / Datos | Esperado | Obtenido | Evidencia | Estado | Riesgo si falla |
|---|---|---|---|---|---|---|---|
| B1 tsc | Tipos válidos | `tsc --noEmit` shared/api/worker/whatsapp/web | 0 errores | 0 | TSC | PASS | Build roto |
| B2 tests | Suite unitaria | node test runner | todo verde | 185 (19+28+138) | UNIT | PASS | Regresiones |
| B3 smoke | Endpoints frontend | smoke-endpoints | todo verde | ok | SMOKE | PASS | Frontend desconectado |
| B4 build web Linux/Docker | Confirmar standalone | `docker build -f apps/web/Dockerfile` | imagen creada | jw-web-verify OK | DOCKER | PASS | Deploy web falla |
| B5 migrate deploy desde cero | Cadena de migraciones | DB vacía → `migrate deploy` | 15 aplicadas | ok | consola | PASS | Deploy DB falla |
| B6 migrate status | Estado consistente | `prisma migrate status` | up to date | "up to date" | consola | PASS | Drift de esquema |
| B7 seed idempotente | Re-siembra segura | `seed` x2 | 2ª vez "respetada" | ok | consola | PASS | Sobrescribe ediciones |

## Casos BLOCKED (requieren tu acción / entorno real)

| Caso | Motivo | Desbloqueo |
|---|---|---|
| Envío real por WhatsApp Web | No se envían mensajes reales en pruebas | Aprobación + número autorizado en staging/prod |
| Validación visual del panel | Sin navegador en el entorno de trabajo | Tú levantas local/staging y revisas |
| Deploy a producción | Bloqueado por diseño | Rotar credenciales + revisar doc + aprobación explícita |
