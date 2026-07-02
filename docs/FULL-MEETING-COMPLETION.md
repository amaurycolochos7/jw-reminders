# FULL-MEETING-COMPLETION — Completar el resto de la reunión

Estado: **PROPUESTA DE DISEÑO (Fase 3)**. Documento previo a la implementación.
No se ha escrito código de esta fase todavía (según la directiva: "No programar
hasta crear este documento").

Objetivo: que el sistema administre la **reunión completa** (Presidente, oraciones,
Tesoros, Perlas, Lectura, Nuestra Vida Cristiana, Estudio Bíblico de la
Congregación, Palabras de introducción/conclusión) reutilizando el mecanismo que
ya funciona para Seamos Mejores Maestros (SMM), **sin rediseñar ni romper SMM**.

---

## 1. Diagnóstico actual (cómo funciona hoy)

Pipeline actual, de WOL al mensaje enviado:

```
WOL (scrape HTML)
  └─ wol-importer.service (htmlToText, findVidaYMinisterioLink, importWeekFromWol)
      └─ wol-parser.parseWolProgram(text)         ← SOLO extrae TARGET_TITLES
          └─ MeetingProgramItem[] (upsert por (weekId, sortOrder))
              └─ buildSlotsFromProgramItems()      ← 1 item = 1 slot
                  └─ buildAssignmentProposal()      ← Fase 2: filtra por capacidad
                      └─ JwAssignment (status PROPOSED → aprobar → DRAFT)
                          └─ createAutomationPlanForAssignment()
                              └─ AutomationPlan + ReminderDelivery[]
                                  └─ worker processReminders() → WhatsApp (1 msg por delivery)
```

Entidades y enums relevantes:

- `MeetingProgramItem`: fila por parte del programa real. Campos genéricos:
  `itemNumber`, `section`, `title`, `assignmentType`, `durationMinutes`, `context`,
  `description`, `reference`, `lesson`, `requiresAssistant`, `sortOrder`, `rawText`.
- `JwAssignment`: la asignación real. Genérica: `title`, `durationMinutes`,
  `section`, `assignmentType`, `assignedPublisherId`, `companionPublisherId?`,
  snapshots de nombre/teléfono, `status`, `programItemId?`.
- `AutomationPlan` + `ReminderDelivery`: automatizaciones por asignación.
- Enum `AssignmentSection` = `BIBLE_READING | APPLY_YOURSELF`.
- Enum `AssignmentType` = `BIBLE_READING, START_CONVERSATION, MAKE_RETURN_VISIT,
  BIBLE_STUDY, EXPLAIN_BELIEFS, MAKE_DISCIPLES, TALK, OTHER`.

Puntos clave del comportamiento actual:

- **El parser sólo reconoce SMM + Lectura.** `TARGET_TITLES` = lectura, empiece
  conversaciones, revisitas, haga discípulos, explique sus creencias, curso
  bíblico, discurso. Todo lo demás (Tesoros, Perlas, NVC, EBC, introducción,
  conclusión, canciones) es un `STOP_MARKER`: corta el cuerpo y **no se emite**.
- `requiresAssistant(title)` (shared/wol) decide acompañante por título.
- `needsCompanionFor(type)` (monthly-schedules) = `type !== BIBLE_READING && type
  !== TALK` → hoy devolvería `true` para cualquier tipo nuevo (⚠️ a corregir).
- Automatizaciones: `createAutomationPlanForAssignment` ya funciona para cualquier
  `JwAssignment`; las partes sin acompañante simplemente no generan filas de
  acompañante (`COMPANION_RULES` sólo se usan si hay `companionPublisherId`).
- Envío: el worker manda **un mensaje por `ReminderDelivery`** (por asignación y
  por persona). No hay agrupación por persona/semana.
- Capacidades (Fase 1/2): ya existen en `JwPublisher` las 13 capacidades y la
  validación estricta. La elegibilidad `isPublisherEligibleForAssignment` es
  capability-aware, pero el mapeo `ASSIGNMENT_TYPE_REQUIRED_CAPABILITY` sólo cubre
  los tipos asignables actuales (Lectura, Discurso, partes SMM).

## 2. Qué YA funciona en SMM (y se conserva intacto)

- Detección/creación de partes desde WOL (Lectura + 5 tipos de estudiante).
- Guardado de título, duración, orden (`sortOrder`), contexto, referencia, lección.
- Asignación de persona + acompañante con reglas de género y de capacidad.
- Generación de automatizaciones y recordatorios (7/3/1/mismo día).
- Visualización dentro de la semana y estados pendientes/enviadas/canceladas.

**No se tocará** el parseo de SMM, sus reglas, el mapeo de sus tipos, ni sus
automatizaciones. Los cambios son aditivos.

## 3. Qué falta para el resto de la reunión

Partes a soportar y su origen:

| Parte | ¿En el texto de WOL? | Capacidad | Acompañante |
|---|---|---|---|
| Presidente | No (rol local) | canBeChairman | No |
| Palabras de introducción | Sí (1 min) | canBeChairman | No |
| Oración inicial | No (junto a canción) | canPray | No |
| Canción inicial | Informativa (nº) | — (no asignable) | No |
| Tesoros punto 1 (título variable) | Sí (10 min) | canTreasures | No |
| Busquemos perlas escondidas | Sí (10 min) | canSpiritualGems | No |
| Lectura de la Biblia | Sí (ya existe) | canBibleReading | No |
| Nuestra Vida Cristiana (1..N, dinámica) | Sí (variable) | canChristianLife | No |
| Estudio Bíblico Congregación — Conductor | Sí (30 min) | canConductCBS | No |
| Estudio Bíblico Congregación — Lector | Sí (implícito) | canReadCBS | No |
| Palabras de conclusión | Sí (3 min) | canConcludingRemarks | No |
| Canción final | Informativa (nº) | — (no asignable) | No |
| Oración final | No (junto a canción) | canPray | No |

Notas:
- El Presidente y las oraciones **no aparecen con nombre en WOL** (se asignan
  localmente). Se modelan como "partes estándar" que se crean por semana.
- Las canciones son **informativas**: se guardan para mostrarlas, pero no generan
  asignación ni recordatorio.
- Nuestra Vida Cristiana es **dinámica** (1, 2 o más partes; necesidades; videos;
  informes; títulos variables). No se asume número fijo: cada `MeetingProgramItem`
  emitido por el parser es una parte independiente con su `sortOrder`.

## 4. Propuesta de modelo (cambios mínimos, sin nueva entidad núcleo)

Decisión: **reutilizar `MeetingProgramItem` + `JwAssignment`**. Son ya lo bastante
genéricos (título/duración/orden/sección/tipo/asignado). NO se crea una entidad
nueva ni se rediseña `AssignmentTemplate` (que hoy no participa de este flujo).

### 4.1 Extender enums (aditivo)

`AssignmentType` (nuevos, sin tocar los existentes):

```
CHAIRMAN                         // Presidente
OPENING_COMMENTS                 // Palabras de introducción
OPENING_PRAYER                   // Oración inicial
TREASURES_TALK                   // Tesoros punto 1 (título variable)
SPIRITUAL_GEMS                   // Busquemos perlas escondidas
CHRISTIAN_LIVING                 // Parte(s) de Nuestra Vida Cristiana
CONGREGATION_BIBLE_STUDY_CONDUCTOR
CONGREGATION_BIBLE_STUDY_READER
CONCLUDING_COMMENTS              // Palabras de conclusión
CLOSING_PRAYER                   // Oración final
SONG                             // Canción (informativa, no asignable)
```

`AssignmentSection` (nuevos): `OPENING`, `TREASURES`, `LIVING_AS_CHRISTIANS`,
`CONCLUSION`. Se conservan `BIBLE_READING` y `APPLY_YOURSELF`. La sección se usa
sólo para agrupar/mostrar; no cambia la lógica de SMM.

### 4.2 Campo nuevo en `MeetingProgramItem`

`requiresAssignee Boolean @default(true)` — distingue partes asignables de las
informativas (canciones). Las canciones se guardan con `requiresAssignee=false` y
`assignmentType=SONG`; el generador y los formularios las ignoran como asignables
pero la semana las muestra.

(Alternativa evaluada: no persistir canciones. Se prefiere guardarlas como
informativas para mostrar el programa completo y su número de canción.)

### 4.3 Mapeo tipo → capacidad (extender `ASSIGNMENT_TYPE_REQUIRED_CAPABILITY`)

```
CHAIRMAN                          → canBeChairman
OPENING_COMMENTS                  → canBeChairman
OPENING_PRAYER / CLOSING_PRAYER   → canPray
TREASURES_TALK                    → canTreasures
SPIRITUAL_GEMS                    → canSpiritualGems
BIBLE_READING                     → canBibleReading   (ya existe)
CHRISTIAN_LIVING                  → canChristianLife
CONGREGATION_BIBLE_STUDY_CONDUCTOR→ canConductCBS
CONGREGATION_BIBLE_STUDY_READER   → canReadCBS
CONCLUDING_COMMENTS               → canConcludingRemarks
SONG                              → null (no asignable)
```

La elegibilidad (`isPublisherEligibleForAssignment`) ya bloquea si la capacidad es
`false`; sólo hay que ampliar el `EligibilityPublisher` para incluir las 8
capacidades de partes de reunión y el mapeo. El backend ya bloquea combinaciones
inválidas a nivel de publicador (Fase 1); además `validateAssignmentGenders`/una
nueva `validateAssignmentCapability` deben rechazar asignar a alguien sin la
capacidad del tipo (defensa en el `createAssignment`/`updateAssignment`).

### 4.4 "Partes estándar" no presentes en WOL

Presidente, Oración inicial y Oración final no vienen en el texto de WOL. Se
crean automáticamente al importar/crear la semana como `MeetingProgramItem`
estándar (con `sortOrder` reservado al inicio/fin). El administrador asigna la
persona. Esto se hace en un helper `ensureStandardMeetingParts(weekId)` que es
idempotente (upsert por sortOrder), de modo que reimportar no duplica.

## 5. Cambios mínimos por componente

1. **Prisma**: añadir valores a los enums + `requiresAssignee` a
   `MeetingProgramItem`. Migración aditiva (enum `ADD VALUE`, columna con DEFAULT).
2. **shared/wol**: ampliar `mapWolTitleToType`, `mapWolTitleToSection`,
   `requiresAssistant` (todos los nuevos = sin acompañante) y `normalizeTitle`
   (ya existe). Añadir detección de las nuevas partes.
3. **wol-parser**: ampliar `TARGET_TITLES` y el manejo de secciones para emitir
   Tesoros/Perlas/NVC/EBC/introducción/conclusión y canciones (informativas).
   Mantener el comportamiento actual de SMM idéntico (mismos títulos, mismos
   cortes). Capturar títulos variables (Tesoros punto 1, partes de NVC) y
   duraciones. Marcar `requiresAssignee=false` en canciones.
4. **wol-importer**: tras `persistItems`, llamar `ensureStandardMeetingParts`
   (presidente + oraciones). `itemLooksComplete` se ajusta para partes sin
   duración conocida (p. ej. presidente) → no marcar NEEDS_REVIEW por eso.
5. **shared/assignment-rules**: extender `ASSIGNMENT_TYPE_REQUIRED_CAPABILITY`,
   `EligibilityPublisher` (8 capacidades más), `typeNeedsCompanion` y
   `ASSIGNMENT_TYPE_RULES`/`ASSIGNMENT_TYPE_OPTIONS`. Espejo en web.
6. **monthly-schedules.service**: `needsCompanionFor` debe devolver `false` para
   todos los tipos nuevos (hoy devuelve `true` por defecto → ⚠️ bug a corregir);
   los `select` de publicadores del generador y del endpoint de candidatos deben
   incluir las 8 capacidades nuevas; `buildSlotsFromProgramItems` debe saltar
   items `requiresAssignee=false` (canciones).
7. **assignments.service**: `createAssignment`/`updateAssignment` validan la
   capacidad del tipo además del género.
8. **Frontend**: `AssignmentForm` y `propuesta` filtran candidatos por capacidad
   del tipo (ya usan `isPublisherEligibleForAssignment`); añadir los nuevos tipos
   a las opciones y las 8 capacidades a las interfaces `Publisher`. La vista de
   semana agrupa por sección y muestra canciones como informativas.
9. **Automatizaciones**: sin cambios de núcleo (ya funcionan por `JwAssignment`).
   Revisar plantillas para lenguaje genérico (no "acompañante" cuando no aplica).

## 6. Agrupación de mensajes por persona/semana (pieza nueva, la más compleja)

Hoy: 1 `ReminderDelivery` → 1 mensaje. Meta: **un solo mensaje por persona y
semana** listando todas sus partes.

Opciones evaluadas:

- **A. Agrupar en el envío (recomendada, menos invasiva).** El worker, al
  encontrar un `ReminderDelivery` vencido, reúne los deliveries hermanos de la
  MISMA `publisherId` + misma semana (`meetingWeek`) + mismo "bucket" de envío
  (INITIAL, 7/3/1/SAME_DAY) que también estén vencidos, y compone **un mensaje
  agrupado** con `buildGroupedPersonMessage(persona, semana, partes[])`. Marca
  todos los deliveries del grupo como `SENT` con un `providerMessageId` común;
  registra un `JwMessageLog` por el grupo (o uno por delivery apuntando al mismo
  mensaje). Requiere claim atómico del grupo para evitar dobles envíos.
- **B. Entidad `PersonWeekNotice`.** Generar en el momento de la automatización
  una notificación agrupada por (persona, semana, tipo) que referencia varias
  asignaciones. Más limpio conceptualmente, pero añade esquema y migra el modelo
  de envío. Mayor riesgo.

Recomendación: implementar **A** con un helper puro `buildGroupedPersonMessage` en
`shared` (probado con unit tests) y un `groupKey = publisherId|meetingWeekId|bucket`
para el claim. Mantener `ReminderDelivery` por asignación (para programación,
reintentos y auditoría) y sólo agrupar la *presentación/envío*. Si una persona
tiene una sola parte, el mensaje agrupado degenera al mensaje individual actual.

Ejemplo de salida:

```
Hola Gabriel.
Estas son tus asignaciones para la reunión del viernes 3 de julio:
• Presidente.
• Tesoros de la Biblia: "Cómo competir en una carrera contra caballos".
• Oración final.
Hora de reunión: 7:00 p.m.
```

## 7. Riesgos y mitigaciones

- **Romper SMM al ampliar el parser.** Mitigación: no modificar los títulos ni
  cortes de SMM; añadir detección nueva en ramas separadas. Los 3 casos de SMM
  (`wol-parser.test.ts:72-114`, `:146-168`, `:175-222`) deben seguir verdes sin
  cambio. ⚠️ **Corrección tras auditoría:** NO es cierto que toda la suite quede
  "verde sin cambios de expectativa". Dos casos *negativos* codifican justamente
  la ausencia de las partes nuevas y **fallarán a propósito** al emitirlas:
  `:116-144` exige `items.length === 4` sobre un texto con Tesoros/NVC/Canción/
  Necesidades/EBC/conclusión, y `:170-173` exige `length === 0` para
  `"Cántico 88 y oración\nPalabras de introducción (1 min.)"`. Ambos deben
  **reescribirse** con las nuevas expectativas, distinguiendo "no arrastrar footer
  al *cuerpo* de un item SMM" (intacto) de "emitir Tesoros/NVC/etc. como items"
  (nuevo). Esta reescritura es obligatoria, no opcional.
- **`needsCompanionFor` marca acompañante para tipos nuevos.** Mitigación:
  corregir la tabla de reglas; test que verifique needsCompanion=false para todos
  los tipos nuevos.
- **Datos existentes** (semanas ya importadas, "Julio 2026" en producción).
  Mitigación: migración aditiva; `ensureStandardMeetingParts` idempotente; no
  reprocesar semanas ya asignadas salvo acción explícita del administrador.
- **Enum `ADD VALUE` en Postgres** no es transaccional en algunas versiones.
  Mitigación: migración dedicada sólo con `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
- **Agrupación de mensajes / doble envío.** Mitigación: claim atómico por
  `groupKey`, `NotificationLog` por persona+semana+bucket, y `TEST_MODE` en QA.
- **Presidente/oraciones no vienen de WOL.** Mitigación: partes estándar creadas
  localmente; el administrador siempre puede editarlas.
- **Revisión manual antes de aprobar.** Mitigación: el importador deja
  `NEEDS_REVIEW` cuando faltan datos; la aprobación de participantes sigue siendo
  explícita (no se crean automatizaciones solas).

## 8. Plan de implementación (fases pequeñas, verificables)

1. Enums + `requiresAssignee` + migración aditiva + `ensureStandardMeetingParts`.
2. shared: mapeo capacidad, `EligibilityPublisher`, reglas de acompañante, tipos;
   espejo web. Tests unitarios.
3. Parser/importer: emitir las nuevas partes y canciones; capturar títulos
   variables y duraciones; mantener SMM idéntico. Tests con texto real.
4. Generador + caller: `needsCompanionFor`, selects con nuevas capacidades, saltar
   canciones. Validación de capacidad en `createAssignment`/`updateAssignment`.
5. Frontend: tipos + capacidades en formularios y vista de semana agrupada.
6. Automatizaciones: verificar que funcionan para las nuevas partes; plantillas.
7. Agrupación de mensajes por persona/semana (helper + worker). Tests.
8. Verificación (typecheck/build/tests) → commit → push → deploy → QA prod →
   limpieza QA → actualizar reporte.

Cada paso mantiene verde la suite existente antes de avanzar.

## 9. Pruebas requeridas

Unitarias (locales):
- Parser: extrae Tesoros/Perlas/NVC(1..N)/EBC/introducción/conclusión con título y
  duración; canciones marcadas informativas; **SMM sin cambios** (regresión).
- Capacidad por tipo: `requiredCapabilityForType` para los 11 nuevos tipos.
- Elegibilidad: mujer no elegible a Presidente/Oración/Tesoros/Perlas/NVC/
  Conductor/Lector/Conclusión; sólo con la capacidad correspondiente aparece.
- `needsCompanionFor` = false para todos los tipos nuevos.
- `buildGroupedPersonMessage`: una persona con varias partes → un mensaje; una
  parte → mensaje individual; orden por `sortOrder`; hora de reunión incluida.
- Backend rechaza asignar a quien no tiene la capacidad del tipo.

Integración/QA en producción (datos temporales, luego limpiados):
- Importar una semana real y verificar que aparecen todas las secciones.
- Asignar personas a Presidente, oración, Tesoros, Perlas, NVC, Conductor, Lector,
  Conclusión respetando capacidades; el backend rechaza inválidas.
- Generar automatizaciones para esas partes (sin envío automático).
- Verificar mensaje agrupado por persona/semana en `TEST_MODE`.

## 10. Respuestas directas a las 9 preguntas

1. **¿Cómo se modela SMM hoy?** WOL → `parseWolProgram` → `MeetingProgramItem` →
   `buildSlotsFromProgramItems` → `buildAssignmentProposal` → `JwAssignment` →
   `AutomationPlan`/`ReminderDelivery` → worker. Enums `AssignmentSection` (2) y
   `AssignmentType` (8).
2. **¿Qué se reutiliza?** Casi todo: `MeetingProgramItem`, `JwAssignment`,
   automatizaciones, worker, elegibilidad por capacidad. El modelo ya es genérico.
3. **¿Cambios mínimos?** Ampliar enums, mapeo tipo→capacidad, parser e importer;
   corregir `needsCompanionFor`; partes estándar (presidente/oraciones);
   agrupación de mensajes. Todo aditivo.
4. **¿Extender `JwAssignment`/`AssignmentTemplate` o nueva entidad?** Reutilizar
   `JwAssignment` + `MeetingProgramItem` (+ campo `requiresAssignee`). NO se crea
   entidad núcleo nueva; `AssignmentTemplate` no se toca. Para agrupación se
   evalúa un helper de envío (opción A) frente a una entidad `PersonWeekNotice`
   (opción B); se recomienda A.
5. **¿Cómo evitar romper SMM?** Cambios aditivos; parser de SMM intacto; tests de
   regresión con texto real; migraciones con DEFAULT/`ADD VALUE IF NOT EXISTS`.
6. **¿Qué endpoints se amplían?** Importación/parseo (más partes), generación de
   propuesta (ya itera items), candidatos (exponer 8 capacidades más), CRUD de
   asignaciones (validar capacidad), y el flujo de agrupación en el envío.
7. **¿Qué pantallas cambian?** `AssignmentForm` (tipos + capacidades),
   `propuesta`, vista de semana `semanas/[id]` (agrupar por sección + informativas).
8. **¿Automatizaciones para las nuevas partes?** Sin cambios de núcleo: al ser
   `JwAssignment`, `createAutomationPlanForAssignment` ya las cubre; partes sin
   acompañante no generan filas de acompañante. Sólo se revisan plantillas.
9. **¿Agrupación por persona/semana?** Helper puro `buildGroupedPersonMessage` +
   agrupación en el worker por `publisherId|meetingWeekId|bucket`, con claim
   atómico y dedupe por `NotificationLog`. Ver sección 6.

## 11. Criterio de aceptación (de la fase completa)

- SMM sigue funcionando igual (regresión verde).
- El resto de la reunión se representa (todas las partes, estructura dinámica).
- Se pueden asignar personas a presidente, oración, tesoros, perlas, vida
  cristiana, conductor, lector y conclusión, aplicando capacidades.
- El backend bloquea asignaciones sin la capacidad requerida.
- Se pueden generar automatizaciones para esas partes (sin envío automático).
- Los mensajes se agrupan por persona/semana.
- Producción desplegada, pruebas pasan, datos QA limpiados, reporte actualizado.

---

## 12. Auditoría de código (verificación previa a implementar)

Antes de escribir código se auditó el sistema real (6 revisiones paralelas: Prisma,
shared, parser/importer WOL, generador/asignaciones, worker/envío, frontend). El
diseño se confirma **viable y sustancialmente correcto**. Correcciones y precisiones
verificadas (con evidencia `archivo:línea`):

### 12.1 Correcciones a afirmaciones del documento

1. **`needsCompanionFor` — impacto sobreestimado.** Existe y devuelve
   `type !== BIBLE_READING && type !== TALK`
   (`monthly-schedules.service.ts:465-467`), así que da `true` para tipos nuevos.
   PERO su único consumidor es `getProposal` (`:791`) como **flag de presentación**;
   el acompañante real lo decide `item.requiresAssistant → slot.needsCompanion`
   (`:34`, `assignment-proposal.ts:223`). El bug es real pero **cosmético (UI)**, no
   crea filas de acompañante erróneas. Se corrige igual.

2. **Regresión del parser NO queda intacta.** Ver §7 corregida: dos tests negativos
   (`wol-parser.test.ts:116-144` y `:170-173`) deben reescribirse a propósito.

3. **`ASSIGNMENT_TYPE_OPTIONS` no existe en shared** — solo en el espejo web
   (`apps/web/src/lib/assignment-rules.ts:132-141`). Hay que **crearlo** en shared,
   no "extenderlo".

4. **Las 8 capacidades de reunión YA existen** en `publisher-capabilities.ts`
   (web y shared, `CapabilityKey`). Lo que falta NO es el modelo de capacidad sino:
   (a) `EligibilityPublisher` (hoy 3 caps, `assignment-rules.ts:183-195`),
   (b) las interfaces `Publisher` de los componentes (hoy 3 caps:
   `AssignmentForm.tsx:19-31`, `semanas/[id]/page.tsx:13-25`,
   `propuesta/page.tsx:33-43`), y (c) el mapeo tipo→capacidad.

### 12.2 Puntos críticos omitidos (cambios obligatorios adicionales)

5. **`AssignmentSection` solo tiene 2 valores** (`BIBLE_READING`, `APPLY_YOURSELF`)
   y `buildSlotsFromProgramItems` **fuerza** toda sección a esos dos
   (`monthly-schedules.service.ts:27-29`). Las secciones nuevas (OPENING,
   TREASURES, LIVING_AS_CHRISTIANS, CONCLUSION) requieren `ALTER TYPE ... ADD VALUE`
   **y** quitar esa coerción, o se aplastarían a `APPLY_YOURSELF`.

6. **`JwAssignment.assignedPublisherId` y `room` son NOT NULL**
   (`schema.prisma:258,264`). Crear partes del programa sin persona asignada choca
   con esas restricciones. Decisión pendiente: hacerlos nullable o asignar desde el
   inicio. (Recomendado: mantener el flujo actual — las asignaciones se crean solo
   al aprobar propuesta, ya con persona; las partes "sin asignar" viven como
   `MeetingProgramItem`, no como `JwAssignment`.)

7. **El tipo de valor de `ASSIGNMENT_TYPE_REQUIRED_CAPABILITY` está restringido** a
   `"canBibleReading" | "canGiveTalk" | "canParticipateSMM" | null`
   (`assignment-rules.ts:207-210` y `requiredCapabilityForType:223-224`). Añadir
   `canTreasures`, `canPray`, etc. exige **ampliar esa unión en 2 sitios** o no
   compila TS. En shared **y** en el espejo web.

8. **El esquema Zod del router bloquea tipos/secciones nuevos**
   (`assignments.routes.ts:11-12`): `createSchema`/`updateSchema` fijan el enum viejo
   de 8 tipos. Rechazarían los nuevos antes del service. Ampliar obligatorio.

9. **Hay DOS rutas de generación**, no una: `generateProposal` y
   `generateAssignmentsDirect` (`assignment-proposal`/`monthly-schedules.service`),
   ambas con el mismo `select` de 3 capacidades (`:519-523`, `:606-610`, `:770-771`).
   **Ambas** deben incluir las 8 capacidades nuevas.

10. **Web NO importa de `packages/shared`** (su Dockerfile no compila shared;
    comentario explícito en `assignment-rules.ts:1-7`). Todo tipo/capacidad/regla
    nueva se replica **manualmente** en `apps/web/src/lib/*.ts` **y** en shared.
    Además dentro de shared hay 4 definiciones a sincronizar (enum, union type,
    labels, unión del mapa de capacidad).

### 12.3 Agrupación de mensajes (Opción A) — viabilidad ALTA, con fricciones

11. Deliveries hermanos con mismo `publisherId` + `reminderType` + semana comparten
    `scheduledAt` idéntico (mismo offset/`meetingDateLocal`/`sendHour`,
    `date-utils.ts:96-114`), así que vencen en el mismo tick → la agrupación es
    natural. El claim atómico ya existe pero **por `id`**
    (`process-reminders.ts:96-101`); hay que generalizarlo a claim por grupo.
12. **`ReminderDelivery` no tiene `meetingWeekId`**; la semana se alcanza vía
    `assignment.meetingWeek`. El `groupKey` y el claim requieren filtro relacional
    anidado (`assignment: { meetingWeekId }`), que Prisma `updateMany` sí admite.
13. **"bucket" = enum `ReminderType`** (`schema.prisma:55-63`), no un campo nuevo.
14. **No hay formateador de hora**: `meetingTime` se emite crudo (p. ej. `"19:00"`).
    Para "7:00 p.m." hay que añadir un formateador (hoy inexistente).
15. **`NotificationLog` es por asignación** (`unique [assignmentId, recipientPersonId,
    notificationKey]`), no por persona+semana+bucket. Un mensaje agrupado generaría
    N filas de auditoría; sirve como dedup pero no es la clave que sugería §6.

### 12.4 Datos ya confirmados como correctos

- Enums Prisma: `AssignmentType` (8), `AssignmentSection` (2) — exactos.
- 13 capacidades en `JwPublisher` (incluye `canGiveTalk`, no listada en §1) — exacto.
- `MeetingProgramItem` con `@@unique([meetingWeekId, sortOrder])`; **no** existe
  `requiresAssignee` (sí `requiresAssistant`, semántica distinta — no confundir).
- `createAutomationPlanForAssignment` genérico; sin acompañante no crea filas de
  acompañante (`automation.service.ts:202-241`) — no requiere cambios de núcleo.
- Parser: 1 item = 1 slot; `TARGET_TITLES` tiene 9 entradas (incluye
  `"primera conversacion"` y `"revisita"`, omitidas en §3); la no-emisión la causa
  `isTargetTitle`, no `STOP_MARKER` (mecanismos independientes a modificar por
  separado).
- `itemLooksComplete` marca **toda la semana** `NEEDS_REVIEW` si algún item carece
  de `durationMinutes` (`wol-importer.service.ts:120-124,206-207`).

### 12.5 Bug preexistente detectado (fuera de alcance, anotado)

- `typeLabel` en la vista de semana mapea `BIBLE_STUDY → "Haga discípulos"`
  (`semanas/[id]/page.tsx:88`), debería ser "Curso bíblico". Corregir de paso.

---

Pendiente de aprobación para iniciar la implementación por los pasos de la
sección 8. No se inicia exportación ni PDF/Word en esta fase.
