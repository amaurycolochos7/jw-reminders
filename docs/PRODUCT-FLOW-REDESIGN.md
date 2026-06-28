# PRODUCT FLOW REDESIGN — Auditoría del flujo actual vs. flujo objetivo

> Documento de auditoría (NO se ha escrito código). Compara el sistema **tal como está hoy**
> con el **flujo objetivo** definido por el cambio de prioridad: convertir JW-REMINDERS en una
> herramienta extremadamente sencilla para preparar el programa de Vida y Ministerio, centrada en UX.
>
> Principio rector de esta etapa: **menos clics, menos campos, menos pantallas, el siguiente paso siempre evidente.**
> NO se añaden providers, arquitecturas, abstracciones, integraciones ni fases técnicas nuevas.


---

## Registro de implementación (estado por fase)

> Esta sección se actualiza a medida que se implementa el rediseño. La auditoría de abajo
> permanece como referencia del plan.

### Fase A — Reglas por género + formulario de asignación simplificado

- **Estado:** ✅ Completada, desplegada y validada en producción · commits `a39d9d6`, `9150016`.
- **Implementado:**
  - Módulo canónico de reglas en `packages/shared/src/assignment-rules` (género, acompañante,
    derivación de sección/título/duración por tipo) + enum `Gender`. Espejo en
    `apps/web/src/lib/assignment-rules.ts` (la web no compila `shared` en su Docker build).
  - Backend: validación de género al crear/editar asignación (`assignments.service.ts`),
    filtrado por género en el motor de propuesta (`assignment-proposal.ts`) y en la generación
    simple (`monthly-schedules.routes.ts`).
  - Frontend: `AssignmentForm` reducido a **Parte · Persona · Acompañante · Duración · Notas**.
    Sección, título, duración y número se derivan del tipo; sala/título/referencia/contexto/número
    quedan en "Opciones avanzadas". La lista de personas se filtra automáticamente por las reglas.
  - Reglas aplicadas: Lectura de la Biblia y Discurso → solo hombres; partes de estudiante →
    acompañante obligatorio del mismo sexo. **Género desconocido (null) nunca bloquea** (conservador,
    para no romper datos sin sexo capturado).
- **Pruebas:** `pnpm --filter @jw-reminders/api test` → 27/27 verdes (5 nuevas de reglas/propuesta).
  Builds OK: `shared` (tsc), `api` (tsc), `web` (next build).
- **Compatibilidad:** importación, propuesta, semanas y programas siguen compilando y pasando pruebas.
- **Estado:** ✅ **Completada y validada en producción** (deploy `compose.deploy` Dokploy, `composeStatus=done`).
- **Deploy/validación en producción (con evidencia):**
  - Deploy disparado vía API de Dokploy (`POST /api/compose.deploy`, `composeId=z6xyxXGM1QTnRlFs_2Lmc`)
    porque el webhook de GitHub no se dispara de forma fiable. `composeStatus` pasó a `done`.
  - Confirmación no destructiva: `GET https://jw-reminders.duckdns.org/api/version` →
    `{"version":"1.0.0","build":"fase-a"}` (antes `{"version":"1.0.0"}`), prueba de que el código nuevo está vivo.
  - Validación de comportamiento en producción (reversible, sin dejar datos): se creó una publicadora de
    prueba (FEMALE), se intentó asignarle Lectura de la Biblia y Discurso → la API respondió **HTTP 400**:
    `"Lectura de la Biblia solo puede asignarse a hombres."` y `"Discurso solo puede asignarse a hombres."`;
    la publicadora de prueba se eliminó (DELETE 204). Conteo de publicadores restaurado.
  - Nota técnica permanente: `/api/version` ahora expone una etiqueta de build (`BUILD_TAG`), por lo que
    todos los deploys futuros se verifican de forma automática y no destructiva.

### Fase B — Paso 6: semana como centro de trabajo + acciones por automatización

- **Estado:** Implementada y verificada localmente en rama `fase-b-paso6-automation-actions`
  (NO en `main`, NO en producción, por indicación expresa). `BUILD_TAG="fase-b"`.
- **Reconciliación con el repo:** las instrucciones mencionaban un rol `ATHLETE`, un modelo `AuditLog`
  y una rama `cedgym-staging` que **no existen en JW-REMINDERS** (provienen de otro proyecto). Se mapeó:
  rol → N/A (la app es admin-only tras `authMiddleware`); auditoría → `JwAutomationEvent` (mecanismo del
  repo) con **metadatos sin el texto del mensaje**; staging → no existe (ver bloqueo de deploy).
- **Migración aditiva:** `ReminderDelivery.customMessage String?` (migración formal
  `20260628020000_p6_reminder_custom_message`, sin `db push`). Reversible, no toca datos existentes.
- **Worker:** prioridad de mensaje `resolveOutboundMessage(customMessage, plantilla)` — usa el texto
  personalizado si existe y no está vacío; si no, la plantilla.
- **Backend (bajo `authMiddleware`):** `GET .../deliveries/by-week/:weekId` (panel + conteos),
  `GET .../deliveries/:id/preview` (render sin enviar), `POST .../deliveries/:id/message`
  (editar/restaurar customMessage), `POST .../send-now`, `POST .../reschedule`. Reutiliza `retry`/`cancel`.
  Estados permitidos: editar/enviar-ahora/reprogramar solo en `PENDING`/`FAILED`; nunca en
  `QUEUED`/`SENDING` (evita envíos dobles). Auditoría con `JwAutomationEvent` (sin texto del mensaje).
- **Frontend:** panel **Automatizaciones** embebido en la semana con grupos Pendientes/Enviadas/
  Fallidas/Canceladas + motivo, indicador "Mensaje personalizado", botones Ver/Editar/Enviar ahora/
  Reprogramar/Reintentar/Cancelar, modal de edición con "Restaurar plantilla", y aviso:
  *"Si cambias la asignación, los recordatorios se regenerarán y cualquier mensaje editado será reemplazado."*
- **Pruebas:** 36/36 verdes (10 nuevas de Paso 6: prioridad de mensaje, estados permitidos/bloqueados,
  invariante anti-envío-doble, auditoría sin texto, indicador). Builds OK: shared/api/worker/web.
  Tests de persistencia/auditoría en BD y el render real quedan para validación en staging.
- **Deploy/validación:** ⛔ **Bloqueado.** No existe rama `cedgym-staging` ni entorno staging en este
  repo (solo `main`→producción). Por indicación de no tocar `main`/producción, queda en rama feature
  sin desplegar. Requiere definición del entorno de staging.

---

---

## 0. Cómo leer este documento

- **§1 Flujo actual** — lo que el código hace hoy (verificado leyendo el repo).
- **§2 Flujo objetivo** — lo que pediste.
- **§3 Diferencias** — brecha entre ambos.
- **§4–§6** — qué simplificar, qué campos y pasos eliminar.
- **§7 Navegación nueva** — mapa propuesto.
- **§8 Mockups textuales** — cada pantalla rediseñada.
- **§9 Orden de implementación** — secuencia recomendada.
- **§10 Riesgos de migración** — qué puede romperse.

---

## 1. Flujo actual (estado real del sistema)

### 1.1 Navegación actual (10 entradas en el Sidebar)

```
Dashboard · Publicadores · Programas · Importar · Semanas · Automatizaciones · Historial · Plantillas · WhatsApp · Configuración
```

Hay **dos formas de llegar a las semanas** (entrada "Semanas" de nivel superior **y** dentro de
"Programas › [programa]"), y las **automatizaciones viven en una pantalla separada** del trabajo de la semana.

### 1.2 Recorrido actual para dejar listos los recordatorios

1. **Publicadores** (`/dashboard/publicadores`): alta con muchos campos (el modelo soporta nombre,
   displayName, phone, whatsappPhone, género, isActive, canReceiveAssignments, canBeCompanion, notas
   + campos "futuros": congregationId, email, birthDate, emergencyContact, roleNotes, tags, metadata).
2. **Programas** (`/dashboard/programas`): crear programa mensual (año/mes).
3. **Programas › [id]**: botón *Generar semanas* (auto, por día de la semana) — **ya no se crean a mano**.
   - Alternativa: **Importar** (`/dashboard/importar`) crea programa + semanas + plantillas de partes.
4. **Asignaciones** — tres caminos distintos:
   - Manual en **Semanas › [id]** con `AssignmentForm` (11 campos).
   - *Generar asignaciones* (reparto simple) en el programa.
   - *Generar propuesta* (motor inteligente) → estado `PROPOSED` → **Aprobar propuesta** → `DRAFT`.
5. **Generar automatizaciones** — paso explícito y separado:
   - Individual: *Generar recordatorios* sobre una asignación (`Semanas › [id]`).
   - Masivo: *Generar automatizaciones* en el programa.
6. **WhatsApp** (`/dashboard/whatsapp`): escanear QR / verificar sesión.
7. **Automatizaciones** (`/dashboard/automatizaciones`): centro operativo **global** (hoy/mañana/
   vencidas/fallidas), con acciones **reintentar** y **cancelar** por entrega.

### 1.3 Qué muestra hoy cada pantalla relevante

- **Dashboard**: guía de 7 pasos (`WorkflowGuide`) + métricas globales.
- **Programas (lista)**: tarjetas con weekCount, assignmentCount, pending, sent, failed, completion %.
- **Programa (detalle)**: métricas del mes (totalWeeks, activeWeeks, totalAssignments, pending, sent,
  failed, completion) + lista de semanas con su completion %, pending, sent, failed. Botones de
  generar semanas/asignaciones/propuesta/automatizaciones/regenerar/cancelar.
- **Semana (detalle)**: info de la reunión (editable), lista de asignaciones (tarjetas), modal
  `AssignmentForm` para crear/editar, modal `AssignmentReminders` para **ver** recordatorios
  (solo lectura), botón *Generar recordatorios*.
- **AssignmentReminders (modal)**: lista los recordatorios del asignado y del acompañante con su
  estado. **No permite ninguna acción** (ni ver el texto, ni enviar, ni reprogramar, ni cancelar).
- **Automatizaciones (global)**: vistas hoy/mañana/semana/mes/vencidas/calendario/rango; resumen por
  estado; detalle de entrega con historial de intentos y cuerpo del mensaje ya enviado; acciones
  **retry** y **cancel**.

### 1.4 Reglas que el sistema aplica hoy

- En `AssignmentForm`: si la sección es Lectura o el tipo es Lectura/Discurso → oculta acompañante.
  Para el resto, muestra acompañante (opcional).
- En el motor de propuesta (`assignment-proposal.ts`): respeta `canReceiveAssignments` / `canBeCompanion`,
  equilibra carga e historial, evita parejas repetidas, no repite persona en la misma semana.
- ⚠️ **El género NO se usa en ningún filtro de UI ni en el motor de propuesta.** El modelo tiene
  `Gender`, pero hoy nada impide asignar a una mujer una Lectura de la Biblia o un Discurso.

---

## 2. Flujo objetivo (nueva prioridad)

1. **Publicadores**: solo nombre, teléfono, sexo, activo/inactivo + reglas de elegibilidad. Nada más.
2. **Programa mensual**: crear "Julio 2026"; las semanas existen dentro, **sin crearlas a mano**.
3. **Vista de semanas como tarjetas**: fecha, estado, #asignaciones, automatizaciones pendientes,
   enviadas, errores — todo visible sin entrar.
4. **Semana = centro del trabajo diario**: una sola pantalla con info de la reunión, asignaciones,
   automatizaciones, historial, mensajes enviados y pendientes. Sin saltar entre 5 módulos.
5. **Crear asignaciones tipo "llenar la hoja del programa"**: pocas columnas (Sección, Parte, Persona,
   Acompañante, Duración, Notas, Siguiente). Las reglas se aplican **solas** (Discurso/Lectura → solo
   hombres; Estudiante/Ayudante → pareja; etc.). El usuario no piensa en reglas.
6. **Automatizaciones dentro de la semana, el corazón del producto**: pendientes / enviadas /
   canceladas / fallidas + **motivo**, todo sin cambiar de pantalla. Cada automatización con acciones de
   1 clic: **ver mensaje, editar mensaje, enviar ahora, reprogramar, cancelar**.
7. **Vista mensual de control**: al abrir el programa responder de inmediato: cuántos mensajes faltan,
   cuántos se enviaron, qué semanas siguen incompletas, cuáles terminaron, qué errores hay — sin abrir cada semana.

NO en esta etapa: importación PDF/Word/EPUB, providers, nuevas abstracciones/integraciones/fases.

---

## 3. Diferencias (brecha actual → objetivo)

| # | Tema | Hoy | Objetivo | Brecha |
|---|---|---|---|---|
| 1 | Navegación | 10 entradas; "Semanas" y "Automatizaciones" de nivel superior | Centrada en Programa → Semana | **Alta**: reorganizar nav, mover automatizaciones a la semana |
| 2 | Publicadores | Muchos campos (incl. "futuros") | nombre, teléfono, sexo, activo + reglas | **Media**: ocultar campos sobrantes |
| 3 | Crear semanas | Auto (generar semanas) ✔ | Auto, sin tocar nada | **Baja**: ya está, falta hacerlo automático al abrir/crear programa |
| 4 | Vista de semanas | Lista dentro del programa con métricas | Tarjetas con 6 datos claros | **Media**: rediseñar a tarjetas legibles |
| 5 | Semana como centro | Asignaciones sí; automatizaciones en modal solo-lectura; centro global aparte | Todo en una pantalla con acciones | **Alta**: construir panel de automatizaciones embebido con acciones |
| 6 | Form de asignación | 11 campos, modal grande | "Hoja del programa", pocas columnas | **Alta**: rediseño del editor de asignaciones |
| 7 | Reglas por género | No se aplican | Automáticas (solo hombres, parejas…) | **Alta**: lógica nueva de elegibilidad por género/tipo |
| 8 | Acciones por automatización | Solo retry/cancel, en pantalla global | ver/editar mensaje, enviar ahora, reprogramar, cancelar (1 clic) | **Alta**: faltan endpoints "enviar ahora", "reprogramar", "editar/ override de mensaje" |
| 9 | Caminos de asignación | 3 (manual, reparto, propuesta+aprobar) | 1 claro | **Media**: unificar, esconder duplicados |
| 10 | Vista mensual | Métricas presentes pero dispersas | Respuesta inmediata a 5 preguntas | **Baja/Media**: reordenar/destacar lo que ya existe |
| 11 | Importar | Módulo activo | Despriorizado | **Baja**: ocultar de la nav |

### 3.1 Funcionalidad que HOY NO EXISTE y el objetivo exige (gaps de backend)

Esto es clave: el Paso 6 pide acciones que **no tienen endpoint** hoy.

- **Ver mensaje antes de enviarse**: hoy el texto solo se renderiza al momento del envío (worker).
  No hay endpoint que devuelva el "preview" del mensaje de una entrega `PENDING`. → *Falta*.
- **Editar mensaje** de una entrega concreta: el modelo `ReminderDelivery` no tiene campo de cuerpo
  personalizado; el cuerpo sale siempre de la plantilla. → *Falta* (requiere campo override o similar,
  pero **sin** nueva arquitectura: un solo campo de texto opcional es suficiente).
- **Enviar ahora**: `retry` solo aplica a `FAILED/DEAD`. Para `PENDING` no hay "adelantar envío".
  → *Falta* (puede ser un endpoint que ponga `scheduledAt = now`).
- **Reprogramar**: no existe endpoint para cambiar `scheduledAt` de una entrega. → *Falta*.
- **Reglas por género**: no hay filtro. → *Falta* (lógica de elegibilidad).

> Nota: estos faltantes se pueden cubrir con **endpoints pequeños sobre el modelo existente**, sin
> introducir nuevas abstracciones. Encaja en "simplificar/mejorar UX", no en "nueva arquitectura".

---

## 4. Pantallas que deben simplificarse

1. **Sidebar / navegación** — de 10 a ~5 entradas relevantes. Quitar "Semanas" (se entra por el programa)
   y "Importar" (despriorizado); replegar "Automatizaciones" global a un rol secundario (la operación
   diaria pasa a vivir dentro de la semana).
2. **AssignmentForm** — de modal de 11 campos a editor tipo hoja con 4–6 columnas y "Siguiente".
3. **Semana (detalle)** — pasar de "lista de asignaciones + modal de recordatorios solo-lectura" a
   **un tablero único** con secciones: Reunión · Asignaciones · Automatizaciones · Historial.
4. **AssignmentReminders (modal)** — dejar de ser solo-lectura; o desaparecer integrándose en el
   panel de automatizaciones de la semana, con acciones por entrega.
5. **Programa (detalle)** — convertir la lista de semanas en **tarjetas** y subir arriba el "resumen
   de control mensual" (5 preguntas).
6. **Publicadores** — formulario reducido a lo esencial + reglas.

---

## 5. Campos que pueden eliminarse / ocultarse

### 5.1 Formulario de asignación (`AssignmentForm`)
Hoy: `assignmentNumber, section, assignmentType, title, durationMinutes, room, context, reference,
assignedPublisherId, companionPublisherId, notes` (11).

| Campo | Acción | Motivo |
|---|---|---|
| `assignmentNumber` | **Eliminar de la UI** | Se asigna secuencialmente solo (ya se hace en import/propuesta). |
| `title` | **Auto** desde el tipo | "Lectura de la Biblia", "Empiece conversaciones"… se derivan del tipo. |
| `section` | **Auto** desde el tipo | La sección se infiere del tipo (ya existe `inferSection`). |
| `room` | **Ocultar** (default MAIN) | Solo mostrar si la congregación usa sala auxiliar. |
| `context` | **Mover a "avanzado"/ocultar** | Rara vez se usa; no es parte de "la hoja". |
| `reference` | **Opcional, plegado** | Útil para Lectura; mostrar solo cuando aplica. |
| `durationMinutes` | **Mantener** (con default por tipo) | Está en la hoja; prellenar por tipo. |
| `assignedPublisherId` | **Mantener** (Persona) | Núcleo. |
| `companionPublisherId` | **Mantener condicional** (Acompañante) | Solo cuando el tipo lo requiere. |
| `notes` | **Mantener** | Está en la hoja. |

Resultado: el usuario ve **Parte (tipo) · Persona · Acompañante · Duración · Notas** → "Siguiente".

### 5.2 Publicadores
Mantener: `fullName` (nombre), `phone` (teléfono), `gender` (sexo), `isActive`,
`canReceiveAssignments`, `canBeCompanion`.
Ocultar de la UI (siguen en el modelo, sin borrarlos de la DB): `displayName` (opcional),
`whatsappPhone` (usar el mismo teléfono salvo excepción), `congregationId`, `email`, `birthDate`,
`emergencyContact`, `roleNotes`, `tags`, `metadata`, `notes` (opcional).

---

## 6. Pasos innecesarios a eliminar / fusionar

1. **"Importar" en el flujo principal** → fuera de la nav primaria (se retoma después).
2. **Tres caminos de asignación** → dejar **uno** visible (captura manual tipo hoja). La propuesta
   automática puede quedar como botón secundario "Sugerir reparto", pero no como camino paralelo confuso.
3. **Aprobar propuesta + Generar automatización** (dos pasos) → cuando se use captura manual, la
   asignación nace `DRAFT` directamente; generar automatización es **un** botón claro por semana.
4. **Entrar a "Semanas" como módulo aparte** → se accede solo desde el programa.
5. **Ir a "Automatizaciones" global para reintentar/cancelar** → esas acciones pasan a la semana.
   La pantalla global se conserva como vista de supervisión, no como lugar de trabajo.
6. **Generar recordatorios por asignación uno por uno** → preferir **"Generar todo de la semana"**
   con posibilidad de ajustar individualmente después.

---

## 7. Propuesta de nuevo flujo de navegación

### 7.1 Sidebar propuesto (5 entradas)

```
Inicio · Publicadores · Programas · Configuración · WhatsApp
```

- **Automatizaciones (global)** e **Historial**: accesibles desde "Inicio" o desde la semana, no como
  módulos primarios.
- **Importar** y **Plantillas**: en un menú secundario "Más / Ajustes avanzados".

### 7.2 Jerarquía de trabajo (la columna vertebral)

```
Programas
   └── Programa "Julio 2026"   ← VISTA MENSUAL (las 5 preguntas + tarjetas de semanas)
          └── Semana "10–16 jul"   ← CENTRO DE TRABAJO (todo en una pantalla)
                 ├── Reunión (fecha, hora, sala)
                 ├── Asignaciones (hoja editable + reglas automáticas)
                 ├── Automatizaciones (pendientes/enviadas/canceladas/fallidas + acciones)
                 └── Historial / Mensajes
```

### 7.3 Recorrido del usuario (objetivo, mínimos clics)

```
Crear programa  →  (semanas aparecen solas)  →  abrir semana  →  llenar hoja de asignaciones
   →  "Generar recordatorios de la semana"  →  supervisar/ajustar en la misma pantalla
```

---

## 8. Mockups textuales por pantalla

> Solo estructura y contenido; sin estilos. Sirve para validar UX antes de programar.

### 8.1 Publicadores (simplificado)

```
┌─ Publicadores ───────────────────────────────────────────────┐
│  [ + Nuevo publicador ]                      Buscar: [______] │
│                                                               │
│  Nombre            Teléfono       Sexo   Activo   Reglas      │
│  ─────────────────────────────────────────────────────────── │
│  Juan Pérez        555-1234       H      ●Sí      Asign ✔ Acomp✔
│  María López       555-5678       M      ●Sí      Asign ✔ Acomp✔
│  Luis Gómez        555-0000       H      ○No      Asign ✔ Acomp✘
└───────────────────────────────────────────────────────────────┘

Modal "Nuevo publicador":
  Nombre*        [_______________]
  Teléfono*      [_______________]
  Sexo*          (•) Hombre  ( ) Mujer
  Activo         [✔]
  ── Reglas ──
  Puede recibir asignaciones   [✔]
  Puede ser acompañante        [✔]
  [ Guardar ]  [ Cancelar ]
```

### 8.2 Programa mensual — VISTA MENSUAL (Paso 7)

```
┌─ Julio 2026 ─────────────────────────────────────  [Activo] ─┐
│  RESUMEN DE CONTROL                                           │
│   Mensajes por enviar: 18     Enviados: 42     Errores: 2     │
│   Semanas: 4   ·  Completas: 2   ·  Incompletas: 2            │
│                                                               │
│  [ Generar recordatorios de todo el mes ]   [ Sugerir reparto ]
│                                                               │
│  SEMANAS                                                      │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐       │
│  │ 30 jun–6 jul  │ │ 7–13 jul      │ │ 14–20 jul     │  ...   │
│  │ ● Completada  │ │ ● Activa      │ │ ○ Incompleta  │       │
│  │ Asign: 4      │ │ Asign: 4      │ │ Asign: 0      │       │
│  │ Pend: 0       │ │ Pend: 6       │ │ Pend: 0       │       │
│  │ Env: 16       │ │ Env: 10       │ │ Env: 0        │       │
│  │ Errores: 0    │ │ Errores: 2 ⚠  │ │ Errores: 0    │       │
│  │ [ Abrir ]     │ │ [ Abrir ]     │ │ [ Abrir ]     │       │
│  └───────────────┘ └───────────────┘ └───────────────┘       │
└───────────────────────────────────────────────────────────────┘
```
(Datos ya disponibles en `getMonthlyScheduleDetail`: pending, sent, failed, completion por semana.)

### 8.3 Semana — CENTRO DE TRABAJO (Pasos 4, 5, 6 en una pantalla)

```
┌─ Semana 7–13 jul · Reunión jue 10 jul 19:00 · Sala Principal ─ [Editar] ┐
│                                                                          │
│ ── ASIGNACIONES (hoja del programa) ───────────────────  [Generar todo] │
│  Parte                         Persona        Acompañante  Dur  Notas    │
│  ─────────────────────────────────────────────────────────────────────  │
│  Lectura de la Biblia          [Juan ▾](H)    —            4'   [__]     │
│  Empiece conversaciones        [María ▾]      [Ana ▾]      3'   [__]     │
│  Haga revisitas                [Luis ▾]       [Pedro ▾]    4'   [__]     │
│  Curso bíblico                 [Sara ▾]       [Eva ▾]      5'   [__]     │
│  [ + Añadir parte ]                                       [ Guardar ]    │
│   ⓘ "Lectura" y "Discurso" solo listan hombres. "Curso/Revisitas"        │
│      exigen acompañante. El sistema filtra solo.                         │
│                                                                          │
│ ── AUTOMATIZACIONES ───────────────────────────────────────────────────  │
│  Pendientes (6) · Enviadas (10) · Canceladas (1) · Fallidas (2)          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Juan · Aviso inicial      ● Enviado   10 jul 09:00                   │ │
│  │ Juan · 3 días antes       ◐ Pendiente 07 jul 09:00  [Ver][Enviar ya]│ │
│  │ María · Mismo día         ✕ Fallido   "Sesión WhatsApp caída" ⚠     │ │
│  │                              [Ver mensaje][Editar][Reenviar][Cancelar]│ │
│  │ Luis · 1 día antes        ◐ Pendiente 09 jul 09:00 [Reprogramar][✕] │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ── HISTORIAL / MENSAJES ────────────────────────────────────────────────  │
│  10 jul 09:01  Enviado a Juan (Aviso inicial)                            │
│  10 jul 09:01  Error a María (Mismo día) — Sesión no disponible          │
└──────────────────────────────────────────────────────────────────────────┘
```

Acciones por automatización (1 clic), con popovers ligeros:
```
[Ver mensaje] → muestra el texto renderizado (preview).
[Editar]      → textarea con el texto; guarda un override para esa entrega.
[Enviar ya]   → adelanta scheduledAt a ahora (próximo tick lo manda).
[Reprogramar] → selector de fecha/hora → actualiza scheduledAt.
[Cancelar]    → marca CANCELLED con motivo.
[Reenviar]    → para FAILED/DEAD (ya existe como retry).
```

### 8.4 Editor de una parte (cuando se añade/edita una fila)

```
┌─ Asignación ─────────────────────────────┐
│ Parte:       [ Empiece conversaciones ▾ ] │  ← define sección, título, si pide acompañante
│ Persona:     [ María López ▾ ]            │  ← lista filtrada por reglas (género/tipo)
│ Acompañante: [ Ana Ruiz ▾ ]               │  ← visible solo si la parte lo requiere
│ Duración:    [ 3 ] min                    │  ← prellenada por tipo
│ Notas:       [ ____________ ]             │
│              [ Guardar ]  [ Siguiente → ] │  ← "Siguiente" pasa a la fila/parte siguiente
└───────────────────────────────────────────┘
```

### 8.5 Inicio (reemplaza Dashboard, orientado a acción)

```
┌─ Inicio ───────────────────────────────────────────────────┐
│  WhatsApp: ● Conectado            Modo prueba: ○ Desactivado │
│  Hoy salen 5 mensajes · Vencidos 0 · Fallidos 2 ⚠           │
│                                                              │
│  Programa activo: Julio 2026   →  [ Abrir ]                  │
│  [ + Nuevo programa ]   [ + Nuevo publicador ]               │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Orden recomendado de implementación

> De mayor impacto-UX / menor riesgo, a mayor complejidad. Cada fase es entregable y verificable.

**Fase A — Reglas automáticas de elegibilidad (núcleo de "el sistema piensa por ti")**
- Filtrar la lista de Persona por género según el tipo (Lectura/Discurso → solo hombres).
- Forzar acompañante donde aplica; ocultarlo donde no.
- Aplicar las mismas reglas en el motor de propuesta.
- *Riesgo bajo, alto valor percibido.*

**Fase B — Simplificar el formulario de asignación**
- Derivar sección/título del tipo; ocultar número, sala (default), contexto, referencia.
- Prellenar duración por tipo. Editor tipo "fila + Siguiente".

**Fase C — Semana como centro de trabajo (unificar pantalla)**
- Embeber el panel de automatizaciones (pendientes/enviadas/canceladas/fallidas + motivo) en la semana.
- Mostrar historial/mensajes en la misma pantalla.

**Fase D — Acciones por automatización (endpoints nuevos pequeños)**
- `Ver mensaje` (preview render), `Enviar ya` (scheduledAt=now), `Reprogramar` (set scheduledAt),
  `Editar mensaje` (campo override por entrega), reutilizar retry/cancel existentes.
- *Aquí está el grueso del trabajo de backend; mantenerlo mínimo, sin nuevas abstracciones.*

**Fase E — Vista mensual de control**
- Reordenar el detalle del programa: arriba las 5 preguntas; semanas como tarjetas claras.

**Fase F — Limpieza de navegación**
- Reducir sidebar a 5 entradas; mover Importar/Plantillas/Automatizaciones-global a secundario.

**Fase G — Publicadores simplificados**
- Ocultar campos "futuros"; dejar nombre/teléfono/sexo/activo + reglas.

**Fase H — Semanas automáticas**
- Que al crear el programa las semanas se generen solas (con día/hora por defecto editable),
  evitando el clic extra de "Generar semanas".

---

## 10. Riesgos de migración

1. **Coexistencia de dos modelos de recordatorio** (`ReminderDelivery` vs `JwAssignmentReminder`).
   Las acciones nuevas deben operar sobre `ReminderDelivery` (lo que usa el worker). Riesgo de tocar
   el modelo legado por error. *Mitigación:* confirmar y, si procede, retirar el legado antes de Fase D.

2. **"Editar mensaje" cambia el contrato de envío.** Hoy el texto se renderiza siempre desde plantilla
   en el worker. Introducir un override por entrega obliga a que el worker prefiera el texto editado.
   *Riesgo:* mensajes inconsistentes si se edita después de enviar, o si se regenera el plan (que hoy
   *supersede* y crea entregas nuevas, perdiendo el override). *Mitigación:* el override se conserva por
   `(assignment, publisher, reminderType)` o se re-aplica al regenerar; definir regla explícita.

3. **Reglas por género pueden bloquear datos existentes.** Asignaciones ya creadas pueden violar las
   nuevas reglas (p. ej. una mujer en Lectura). *Mitigación:* aplicar reglas solo a NUEVAS asignaciones
   y avisar (no romper) en las existentes.

4. **"Enviar ya" / "Reprogramar" tocan `scheduledAt`.** El worker hace *claim* atómico y reintentos;
   cambiar `scheduledAt` de algo `QUEUED/SENDING` puede causar doble envío. *Mitigación:* permitir estas
   acciones solo en `PENDING`/`FAILED`, nunca en `QUEUED/SENDING`.

5. **Quitar "Semanas" e "Importar" de la nav** puede romper enlaces/bookmarks y rutas internas
   (`/dashboard/semanas`, `/dashboard/importar`). *Mitigación:* conservar las rutas (redirigir) aunque
   se quiten del menú.

6. **Regeneración automática al editar asignación** (ya existe) puede sorprender al usuario en el nuevo
   flujo unificado: editar una fila cancela pendientes y crea aviso de cambio. *Mitigación:* mostrar el
   aviso actual ("se cancelarán pendientes y se enviará aviso de cambio") de forma clara en la hoja.

7. **El `INITIAL_NOTICE` sale casi inmediato.** En un flujo más rápido (menos clics), el riesgo de
   mandar avisos reales por accidente sube. *Mitigación:* destacar el estado de `TEST_MODE` en "Inicio"
   y/o pedir confirmación al "Generar recordatorios" cuando el modo prueba está apagado.

8. **Despriorizar import** no debe borrar `AssignmentTemplate` ni el código del provider; solo ocultarlo.
   *Riesgo:* perder la estructura de partes importada que la propuesta usa. *Mitigación:* mantener el
   modelo y los datos; solo retirar de la navegación primaria.

---

## Apéndice — Inventario de acciones backend para el rediseño

| Acción objetivo | ¿Existe hoy? | Endpoint actual / a crear |
|---|---|---|
| Listar entregas de una semana | Parcial | `GET /assignments/:id` (por asignación); falta agregada por semana |
| Ver/preview del mensaje | **No** | *crear* (render sin enviar) |
| Editar mensaje (override) | **No** | *crear* + campo en `ReminderDelivery` |
| Enviar ahora | **No** | *crear* (`scheduledAt = now`, solo PENDING) |
| Reprogramar | **No** | *crear* (set `scheduledAt`, solo PENDING/FAILED) |
| Reintentar | Sí | `POST /automation-center/deliveries/:id/retry` |
| Cancelar | Sí | `POST /automation-center/deliveries/:id/cancel` |
| Generar recordatorios (semana) | Parcial | por asignación / por programa; falta "por semana" directo |
| Reglas de género | **No** | *lógica nueva* en form + propuesta |

> Todos los faltantes se resuelven con endpoints pequeños sobre el modelo actual. No requieren nuevas
> arquitecturas, providers ni fases técnicas — alineado con la prioridad de esta etapa.
