# PLAN-JW-REMINDERS.md
## Proyecto Separado: Recordatorios de Asignaciones JW

**Fecha:** Junio 2026
**Estado:** Especificacion final — listo para implementar
**Proyecto:** jw-reminders (independiente de Sistra)

---

## 1. Objetivo

Crear un sistema independiente para recordatorios automaticos de asignaciones de:
- Lectura de la Biblia
- Seamos mejores maestros

Envia recordatorios por WhatsApp sin afectar el sistema actual de Sistra/streaming.

---

## 2. Decision tecnica principal

- El proyecto JW sera **separado** de Sistra.
- No se usara la base de datos de produccion de Sistra.
- No se modificara la logica de vencimientos de streaming.
- Solo se copiara el patron tecnico de automatizacion.

---

## 3. Arquitectura propuesta

**Nombre del proyecto:** `jw-reminders`

**Servicios:**
- Backend/API (Next.js o similar)
- Worker/Scheduler
- WhatsApp Bot (instancia independiente)
- Base de datos PostgreSQL
- Panel web administrativo

---

## 4. Infraestructura en Dokploy

Crear en Dokploy:
- Nueva aplicacion
- Nueva base de datos
- Nuevos contenedores
- Nuevas variables de entorno
- Nuevo dominio/subdominio
- Backups independientes
- Logs independientes

**Dominio:** `jw-reminders.duckdns.org` (DuckDNS, IP del VPS ya configurada)

---

## 5. Que se copiara de Sistra (solo como referencia)

- Patron de scheduler (node-cron)
- Patron de envio WhatsApp (whatsapp-web.js)
- Patron de logs de mensajes
- Patron de plantillas con variables
- Patron de anti-duplicados (constraint unico + upsert)
- Estructura de worker

**No copiar:** logica de streaming, tablas de clientes, flujos comerciales, datos reales, variables de produccion.

---

## 6. Alcance funcional

### SI cubre

- **Lectura de la Biblia** (individual, sin acompanante)
- **Seamos Mejores Maestros:**
  - Empiece conversaciones
  - Haga revisitas
  - Curso biblico
  - Explique sus creencias
  - Haga discipulos
  - Discurso
  - Otras asignaciones de esta seccion

### NO cubre

- Tesoros de la Biblia
- Perlas Escondidas
- Nuestra Vida Cristiana
- Estudio biblico de la congregacion
- Presidente, consejero, oracion, lectores

### Flexibilidad semanal

- Cantidad variable de asignaciones por semana (no numero fijo)
- Admin agrega, quita, reordena libremente
- No asume que siempre hay 3 asignaciones
- Puede haber 2, 4, 5 o mas por semana

---

## 7. Base de datos

### JwPublisher — Entidad central del sistema

Los publicadores son la **base del sistema completo**, no solo un directorio de contactos.
De ellos depende:
- Envio correcto por WhatsApp
- Asignacion como estudiante
- Asignacion como acompanante
- Historial de participaciones
- Recordatorios futuros
- Posibles modulos adicionales que se desarrollaran despues en el mismo proyecto

**El modelo debe ser robusto y extensible desde el inicio.**

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| fullName | String | Si | Nombre completo legal |
| displayName | String | No | Nombre corto para mostrar |
| phone | String | Si | Telefono principal (unique) |
| whatsappPhone | String | No | Telefono WhatsApp si difiere del principal |
| gender | Enum | No | MALE / FEMALE |
| isActive | Boolean | Si | Default true (soft delete) |
| canReceiveAssignments | Boolean | Si | Default true |
| canBeCompanion | Boolean | Si | Default true |
| notes | String | No | Notas generales |
| createdAt | DateTime | Auto | |
| updatedAt | DateTime | Auto | |

**Campos preparados para futuro (opcionales, nullable):**

| Campo | Tipo | Descripcion |
|---|---|---|
| congregationId | FK | Para cuando haya tabla de congregaciones |
| email | String | Correo electronico |
| birthDate | DateTime | Fecha de nacimiento |
| emergencyContact | String | Contacto de emergencia |
| roleNotes | String | Notas sobre su rol en la congregacion |
| tags | String | Tags separados por coma (futuro) |
| metadata | Json | Campo libre para extensiones futuras |

**Reglas de negocio:**
- No permitir telefonos duplicados (unique constraint en `phone`)
- Validar formato del numero antes de guardar
- Si `isActive = false` → no aparece para nuevas asignaciones
- Si tiene historial → no se elimina fisicamente (soft delete)
- Las asignaciones referencian por ID, no por texto
- El acompanante tambien debe ser un publicador registrado
- Los recordatorios apuntan a `recipientPublisherId`
- Los logs guardan `publisherId` + telefono usado + cuerpo del mensaje

**Panel de publicadores (v1):**
- Crear publicador
- Editar publicador
- Activar/desactivar publicador
- Buscar por nombre
- Buscar por telefono
- Ver historial de asignaciones
- Ver si puede ser acompanante
- Ver si recibe recordatorios

### JwMeetingWeek

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| weekStartDate | DateTime | Si | Inicio de la semana |
| meetingDate | DateTime | Si | Fecha exacta de la reunion |
| meetingTime | String | Si | "19:00" |
| congregationName | String | No | Congregacion |
| notes | String | No | Notas generales |
| createdAt | DateTime | Auto | |
| updatedAt | DateTime | Auto | |

### JwAssignment

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| meetingWeekId | FK | Si | Semana a la que pertenece |
| assignmentNumber | Int | Si | Numero: 3, 4, 5, 6, 7... |
| section | Enum | Si | BIBLE_READING o APPLY_YOURSELF |
| assignmentType | Enum | Si | Tipo especifico |
| title | String | Si | Nombre visible |
| durationMinutes | Int | No | Duracion en minutos |
| context | String | No | "predicacion informal", "de casa en casa" |
| reference | String | No | "lmd leccion 3 punto 5" |
| assignedPublisherId | FK | Si | Asignado principal |
| companionPublisherId | FK | No | Acompanante (null si no aplica) |
| assignedNameSnapshot | String | No | Snapshot del nombre al crear |
| assignedPhoneSnapshot | String | No | Snapshot del telefono al crear |
| companionNameSnapshot | String | No | Snapshot nombre acompanante |
| companionPhoneSnapshot | String | No | Snapshot telefono acompanante |
| room | Enum | Si | MAIN o AUXILIARY |
| notes | String | No | Observaciones |
| status | Enum | Si | PENDING / NOTIFIED / CANCELLED / COMPLETED |
| createdAt | DateTime | Auto | |
| updatedAt | DateTime | Auto | |

**Snapshots:** Se guardan al crear/editar la asignacion para que el historial no cambie si despues se edita el nombre o telefono del publicador. El sistema siempre usa `publisherId` para relaciones, pero conserva snapshot para reportes.

**Enums de assignmentType:**
- BIBLE_READING
- START_CONVERSATION
- MAKE_RETURN_VISIT
- BIBLE_STUDY
- EXPLAIN_BELIEFS
- MAKE_DISCIPLES
- TALK
- OTHER

### JwAssignmentReminder

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| assignmentId | FK | Si | Asignacion |
| publisherId | FK | Si | Destinatario (asignado O acompanante) |
| reminderDay | Enum | Si | Tipo de recordatorio |
| scheduledAt | DateTime | Si | Momento de envio (UTC) |
| sentAt | DateTime | No | Cuando se envio |
| status | Enum | Si | PENDING / SENT / FAILED / SKIPPED / CANCELLED |
| errorMessage | String | No | Error si fallo |
| createdAt | DateTime | Auto | |
| updatedAt | DateTime | Auto | |

**Constraint unico:** `@@unique([assignmentId, publisherId, reminderDay])`

**Enum reminderDay (reminderType):**
- INITIAL_NOTICE
- SEVEN_DAYS_BEFORE
- THREE_DAYS_BEFORE
- ONE_DAY_BEFORE
- SAME_DAY
- CHANGE_NOTICE
- CANCELLATION_NOTICE

### JwMessageTemplate

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| type | String | Si | Tipo de plantilla (unique) |
| title | String | Si | Nombre descriptivo |
| body | String | Si | Cuerpo con {{variables}} |
| isActive | Boolean | Si | Default true |
| createdAt | DateTime | Auto | |
| updatedAt | DateTime | Auto | |

### JwMessageLog

| Campo | Tipo | Req | Descripcion |
|---|---|---|---|
| id | cuid | Auto | PK |
| assignmentId | FK | No | Asignacion relacionada |
| publisherId | FK | No | Publicador destinatario |
| phone | String | Si | Telefono al que se envio |
| messageType | String | No | Tipo de mensaje |
| messageBody | String | Si | Cuerpo del mensaje enviado |
| providerMessageId | String | No | ID del proveedor |
| status | Enum | Si | SENT / FAILED / SKIPPED |
| errorMessage | String | No | Error si fallo |
| sentAt | DateTime | No | Timestamp de envio |
| createdAt | DateTime | Auto | |

---

## 8. Recordatorios por destinatario

### Regla clave

Los recordatorios se generan **por destinatario**, no solo por asignacion.

Si una asignacion tiene estudiante y acompanante, se crean recordatorios separados:
- `assignmentId + assignedPublisherId + SEVEN_DAYS_BEFORE`
- `assignmentId + assignedPublisherId + THREE_DAYS_BEFORE`
- `assignmentId + assignedPublisherId + ONE_DAY_BEFORE`
- `assignmentId + assignedPublisherId + SAME_DAY`
- `assignmentId + companionPublisherId + THREE_DAYS_BEFORE`
- `assignmentId + companionPublisherId + ONE_DAY_BEFORE`
- `assignmentId + companionPublisherId + SAME_DAY`

### Reglas de envio

| Dia | Asignado | Acompanante |
|---|---|---|
| Aviso inicial (al crear) | Si | Si |
| 7 dias antes | Si | No |
| 3 dias antes | Si | Si |
| 1 dia antes | Si | Si |
| Mismo dia | Si | Si |

### Reglas de cancelacion

- Si `status = CANCELLED` → no enviar ningun recordatorio pendiente
- Si `status = COMPLETED` → cancelar pendientes sin enviar mensaje
- Cambio de asignado → cancelar reminders del anterior, crear para el nuevo
- Cambio de fecha → regenerar todos los reminders

### Calculo de scheduledAt

- Se usa la zona horaria configurada (America/Mexico_City)
- Hora de envio configurable (ej: 9:00 AM)
- Recordatorio "mismo dia" se calcula tomando en cuenta la hora de la reunion

---

## 9. Plantillas de mensajes

### Variables disponibles

```
{{assignedName}}        — Nombre del asignado
{{companionName}}       — Nombre del acompanante
{{assignmentTitle}}     — Titulo/tema de la asignacion
{{assignmentNumber}}    — Numero (3, 4, 5...)
{{assignmentType}}      — "Empiece conversaciones", "Haga revisitas", etc.
{{meetingDate}}         — "martes 8 de julio de 2026"
{{meetingTime}}         — "19:00"
{{room}}                — "Sala principal" / "Sala auxiliar"
{{context}}             — "predicacion informal"
{{reference}}           — "lmd leccion 3 punto 5"
{{duration}}            — "4 min"
{{congregationName}}    — Nombre de la congregacion
{{notes}}               — Observaciones
```

### Aviso inicial (asignado)

```
Saludos, {{assignedName}}.

Se le ha asignado la siguiente participacion:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Duracion: {{duration}}
Contexto: {{context}}
Referencia: {{reference}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Acompanante: {{companionName}}

Por favor confirme que recibio este aviso.
Cualquier duda o inconveniente, comuniquese con anticipacion.
```

### Aviso inicial (acompanante)

```
Saludos, {{companionName}}.

Ha sido asignado(a) como acompanante de {{assignedName}}:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Contexto: {{context}}

Por favor coordinense para la presentacion.
```

### Recordatorio 7 dias

```
Saludos, {{assignedName}}.

Le recordamos que en una semana tiene la siguiente participacion:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}}
Sala: {{room}}
Referencia: {{reference}}

Le animamos a prepararse con tiempo.
```

### Recordatorio 3 dias

```
Saludos, {{assignedName}}.

Su participacion es en 3 dias:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duracion: {{duration}}
Acompanante: {{companionName}}

Si tiene algun inconveniente, avisenos con la mayor brevedad posible.
```

### Recordatorio 1 dia

```
Saludos, {{assignedName}}.

Manana tiene su participacion en la reunion:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}
Duracion: {{duration}}

Le deseamos exito. Recuerde llegar puntual.
```

### Recordatorio mismo dia

```
Saludos, {{assignedName}}.

Hoy es su participacion en la reunion:

Asignacion {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}

Exito en su presentacion.
```

### Cambio de asignacion

```
Saludos, {{assignedName}}.

Ha habido un cambio en su asignacion:

Nueva asignacion: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duracion: {{duration}}
Referencia: {{reference}}
Acompanante: {{companionName}}

{{notes}}

Disculpe las molestias.
```

### Cancelacion

```
Saludos, {{assignedName}}.

Su asignacion del {{meetingDate}} ha sido cancelada:
Asignacion {{assignmentNumber}}: {{assignmentTitle}}

{{notes}}

Agradecemos su buena disposicion.
```

**Nota:** Las lineas con variables vacias se eliminan automaticamente del mensaje final.

---

## 10. Flujo general

```
1. Admin crea semana (fecha, hora, congregacion)
2. Admin agrega N asignaciones (cantidad variable)
3. Sistema genera recordatorios por cada asignacion:
   - Para el asignado: INITIAL_NOTICE, 7d, 3d, 1d, mismo dia
   - Para el acompanante (si hay): INITIAL_NOTICE, 3d, 1d, mismo dia
4. Worker revisa cada 10 min: reminders con status=PENDING y scheduledAt<=now
5. Worker envia WhatsApp (instancia independiente)
6. Worker registra en JwMessageLog
7. Worker marca reminder como SENT/FAILED
8. Anti-duplicados via constraint unico en BD
9. Admin puede editar, cancelar o reenviar desde el panel
```

---

## 11. Variables de entorno

```env
DATABASE_URL=postgresql://...
WHATSAPP_API_URL=http://whatsapp-bot:3010
WHATSAPP_TOKEN=secreto
APP_URL=https://jw-reminders.duckdns.org
NODE_ENV=production
CRON_SECRET=secreto
TIMEZONE=America/Mexico_City
LOG_LEVEL=info
REMINDER_SEND_HOUR=9
JWT_SECRET=secreto_jwt
ADMIN_EMAIL=admin
ADMIN_PASSWORD=dorian123
```

**No reutilizar secretos de produccion de Sistra.**

---

## 12. Panel web administrativo

### Decisiones tomadas

- Si habra panel web desde la primera version.
- Login con usuario y contrasena.
- Credenciales iniciales de prueba: `admin` / `dorian123`
- Contrasena guardada como hash en BD (no hardcodeada en frontend).

### Pantallas

| Ruta | Funcion |
|---|---|
| /login | Autenticacion |
| /dashboard | Vista general: proximas reuniones, recordatorios pendientes |
| /semanas | Lista de semanas, crear nueva |
| /semanas/nueva | Carga rapida: fecha + N filas dinamicas |
| /semanas/{id} | Detalle, editar asignaciones, agregar/quitar |
| /asignaciones/{id} | Detalle, editar, cancelar, completar, reenviar |
| /publicadores | CRUD de publicadores |
| /plantillas | Editar plantillas de mensaje |
| /historial | Log de mensajes enviados |
| /configuracion | Zona horaria, hora de envio, congregacion |

---

## 13. WhatsApp

### Decision

- Se usara una **nueva instancia independiente** de WhatsApp.
- Contenedor separado con el mismo patron tecnico (whatsapp-web.js + Chromium).
- Credenciales separadas, sesion separada, numero separado.
- Nombre en Dokploy: `jw-reminders`
- No reutilizar la instancia productiva de Sistra.

---

## 14. Importacion CSV/Excel

- **No confirmada para la primera version.**
- Disenar BD y backend para soportarla en el futuro.
- Primera version: captura manual desde el panel.
- Formato futuro del CSV:

```csv
numero,seccion,tipo,titulo,duracion_min,contexto,referencia,asignado_nombre,asignado_telefono,acompanante_nombre,acompanante_telefono,sala
3,BIBLE_READING,BIBLE_READING,1 Timoteo 4:1-8,4,,,Juan Perez,9611234567,,,MAIN
4,APPLY_YOURSELF,START_CONVERSATION,Empiece conversaciones,4,predicacion informal,lmd leccion 3 punto 5,Maria Lopez,9617654321,Ana Garcia,9618765432,MAIN
```

---

## 15. Plan de implementacion por fases

| Fase | Que | Estimado |
|---|---|---|
| 1 | Infraestructura: crear proyecto, BD, app en Dokploy | 0.5 dia |
| 2 | Schema Prisma + migracion + seed plantillas | 0.5 dia |
| 3 | Auth + CRUD publicadores | 1 dia |
| 4 | CRUD semanas + asignaciones (formulario dinamico) | 2 dias |
| 5 | Generacion de recordatorios + logica de negocio | 1 dia |
| 6 | Worker + cron + envio WhatsApp + logs | 1.5 dias |
| 7 | Panel: historial, configuracion, dashboard | 1 dia |
| 8 | QA + deploy staging + pruebas con numeros internos | 0.5 dia |
| **Total** | | **8 dias** |

---

## 16. Checklist de seguridad

- [ ] No tocar base de datos de Sistra
- [ ] No tocar cron de streaming
- [ ] No tocar contenedores actuales de Sistra
- [ ] No compartir secretos entre proyectos
- [ ] No usar datos reales en pruebas
- [ ] Tener backups de la nueva BD
- [ ] Tener logs accesibles
- [ ] Tener rollback disponible
- [ ] Validar zona horaria en cada calculo
- [ ] Validar anti-duplicados con constraint unico

---

## 17. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Mensajes duplicados | Constraint unico en BD + upsert |
| Zona horaria incorrecta | Config explicita + funcion de conversion |
| WhatsApp bloqueado por exceso | Delay entre envios + batch limitado |
| Numeros mal capturados | Validacion al crear publicador |
| Cambios no comunicados | Envio automatico de msg "cambio" |
| Deploy sobre contenedor equivocado | Proyecto separado en Dokploy |
| Mezcla de variables de entorno | Variables completamente independientes |

---

## 18. Decisiones confirmadas

| Decision | Valor |
|---|---|
| Nombre del proyecto | `jw-reminders` |
| Dominio | `jw-reminders.duckdns.org` (DuckDNS, IP ya apuntada al VPS) |
| Panel web | Si, desde v1 |
| Login admin | admin / dorian123 (hash en BD) |
| Instancia WhatsApp | Nueva, independiente |
| Import CSV | No en v1, preparado para v2 |
| Mensaje al acompanante | Si |
| Recordatorio mismo dia | Si |
| Reminders por destinatario | Si (separados para asignado y acompanante) |
| Constraint unico | `[assignmentId, publisherId, reminderDay]` |
| Variables de plantilla | Doble llave: `{{variable}}` |
| Hora de envio | Configurable (default 9:00 AM) |
| Timezone | America/Mexico_City |
| Cantidad asignaciones/semana | Variable, sin limite fijo |
| Publicadores como base central | Si, entidad robusta y extensible |
| Telefono unico por publicador | Si, unique constraint |
| Soft delete de publicadores | Si, `isActive = false` |
| Snapshot en asignaciones | Si, nombre + telefono al momento de crear |
| Publicador = acompanante | Si, ambos son JwPublisher por ID |
| Preparado para modulos futuros | Si, campos opcionales y metadata |


---

## 19. Fase 2: Investigacion de fuente JW / API / Importador de guia

### Objetivo

Investigar si existe una fuente tecnica confiable para obtener automaticamente la estructura semanal de:
- Lectura de la Biblia
- Seamos mejores maestros

El objetivo es cargar las asignaciones reales de cada semana sin capturarlas manualmente.

### Importante

No asumir que existe una API publica documentada. Primero investigar:
- Si jw.org expone datos en JSON desde el navegador.
- Que endpoints usa la pagina de la Guia de actividades.
- Si los datos vienen en HTML, JSON, JWPUB, EPUB o algun archivo descargable.
- Si JW Library usa paquetes o archivos descargables que puedan parsearse.
- Si existe una forma legal, estable y segura de obtener solo la estructura semanal.

La Guia de actividades esta publicada por periodos en jw.org y contiene el programa semanal de la reunion de entre semana. Usar eso como fuente base.

### Alcance exacto de extraccion

Extraer unicamente:
- Semana (fecha o rango)
- Lectura de la Biblia
- Numero de asignacion
- Nombre de la asignacion
- Duracion
- Contexto
- Referencia (ej: lmd leccion 3 punto 5)
- Si parece requerir acompanante
- Si parece ser discurso
- Orden de aparicion

**No extraer ni guardar contenido doctrinal completo innecesario.**

### Estrategias a investigar

#### Opcion A: API/JSON de jw.org

Revisar en Network del navegador:
- Requests XHR/fetch
- Respuestas JSON
- Parametros de idioma
- Parametros de publicacion
- Parametros de fecha
- Versiones, cache, headers necesarios

Documentar si existe endpoint reutilizable.

#### Opcion B: Parseo HTML

Si no hay API publica, investigar si se puede parsear el HTML de las paginas de jw.org.
Evaluar:
- Estabilidad del HTML
- Riesgo de que cambie la estructura
- Selectores confiables
- Manejo por idioma, mes y semana

#### Opcion C: Descarga JWPUB/EPUB/PDF

Investigar si se puede descargar la publicacion mensual y parsearla.
Revisar:
- JWPUB (formato propietario de JW Library)
- EPUB
- PDF
- Archivos internos con texto estructurado

#### Opcion D: Importacion asistida (fallback)

Permitir que el administrador copie y pegue el texto de la guia, y el sistema lo convierta en estructura semanal. Esta opcion debe quedar como respaldo si no hay API estable.

### Entregable tecnico

Antes de desarrollar esta fase, entregar un archivo:

**JW-SOURCE-RESEARCH.md**

Debe contener:
- Fuente encontrada
- URL o endpoint detectado, si existe
- Tipo de respuesta: JSON, HTML, JWPUB, EPUB, PDF
- Ejemplo real de datos obtenidos
- Como identificar la semana
- Como identificar Lectura de la Biblia
- Como identificar Seamos mejores maestros
- Como diferenciar:
  - Empiece conversaciones
  - Haga revisitas
  - Curso biblico
  - Explique sus creencias
  - Discurso
  - Otro
- Riesgos tecnicos
- Riesgos legales o de uso
- Recomendacion final
- Plan de implementacion

### Regla de seguridad

- No hacer scraping agresivo.
- No hacer requests masivos.
- Usar cache local.
- Actualizar como maximo una vez al dia o bajo accion manual del administrador.

### Modelo recomendado

Tabla: **JwSourceImport**

| Campo | Tipo | Descripcion |
|---|---|---|
| id | cuid | PK |
| sourceType | String | "api_json", "html_parse", "jwpub", "manual_paste" |
| sourceUrl | String | URL o ruta de la fuente |
| language | String | "es", "en", etc. |
| period | String | "2026-07", "2026-W28", etc. |
| rawDataSnapshot | Text | Datos crudos obtenidos |
| parsedData | Json | Estructura parseada |
| status | Enum | PENDING / PARSED / IMPORTED / FAILED |
| errorMessage | String | Error si fallo |
| importedAt | DateTime | Cuando se importo |
| createdAt | DateTime | Auto |

### Flujo esperado

```
1. Admin selecciona idioma y periodo
2. Sistema consulta fuente JW
3. Sistema obtiene estructura de semanas
4. Sistema muestra vista previa
5. Admin confirma
6. Sistema crea JwMeetingWeek
7. Sistema crea JwAssignment SIN publicadores asignados
8. Generador propone publicadores equilibradamente
9. Admin revisa y aprueba
10. Se activan recordatorios
```

### Relacion con Fase 1

**Fase 2 NO bloquea Fase 1.**

| Fase 1 (primera version) | Fase 2 (automatizacion) |
|---|---|
| Publicadores | Importar estructura real desde fuente JW |
| Asignaciones manuales | Generar semanas automaticamente |
| Recordatorios | Proponer publicadores equilibradamente |
| WhatsApp | |

Fase 1 se implementa primero con captura manual. Fase 2 se agrega despues como mejora sin romper lo existente.


---

## 20. PLAN MAESTRO DE EJECUCION COMPLETA

### Objetivo de ejecucion

Construir, desplegar, probar y documentar el sistema completo `jw-reminders` como proyecto independiente. No solo proponer: **ejecutar hasta el final**.

El agente debe dejar el sistema:
- Construido
- Conectado
- Desplegado
- Probado
- Documentado

---

### 20.1 Infraestructura obligatoria en Dokploy

Crear desde cero en el VPS (187.77.11.79):

| Servicio | Nombre en Dokploy | Descripcion |
|---|---|---|
| Frontend/Panel | jw-reminders-web | Next.js, panel admin |
| Backend/API | (incluido en web) | API Routes de Next.js |
| Worker/Scheduler | jw-reminders-worker | Cron + envio WhatsApp |
| WhatsApp | (incluido en worker) | whatsapp-web.js + Chromium |
| Base de datos | jw_reminders_db | PostgreSQL 16 independiente |

**Adicionalmente:**
- Red interna propia del proyecto
- Volumenes persistentes (sesion WhatsApp, BD)
- Dominio: `jw-reminders.duckdns.org` con SSL via Traefik
- Health checks
- Logs visibles
- Backups configurados

**Regla critica:** No tocar contenedores, base de datos, variables ni deploys de Sistra.

---

### 20.2 WhatsApp — Instancia independiente

Crear instancia WhatsApp nueva. Debe probarse y documentarse:

| Paso | Verificacion |
|---|---|
| Contenedor creado | Docker container corriendo |
| Volumen persistente | Sesion sobrevive reinicio |
| QR generado | Visible en logs o panel |
| Escaneo exitoso | Estado AUTHENTICATED |
| Bot ready | Estado READY |
| Persistencia | Reiniciar container, sigue autenticado |
| Envio de prueba | Mensaje llega al telefono |
| Desconexion | Manejo limpio, reintento automatico |
| Logs claros | STARTING, QR_REQUIRED, AUTHENTICATED, READY, DISCONNECTED, FAILED |

La sesion no debe perderse en cada deploy.

---

### 20.3 Funcionamiento interno requerido

El sistema debe permitir:

**Autenticacion:**
- Login admin con usuario y contrasena

**Publicadores:**
- Crear, editar, activar/desactivar
- Telefono unico validado
- Soft delete (nunca borrar si tiene historial)

**Semanas:**
- Crear semana de reunion (fecha, hora, congregacion)
- Agregar N asignaciones variables

**Asignaciones:**
- Lectura de la Biblia (individual)
- Seamos mejores maestros (con/sin acompanante)
- Tipo: START_CONVERSATION, MAKE_RETURN_VISIT, BIBLE_STUDY, EXPLAIN_BELIEFS, MAKE_DISCIPLES, TALK, OTHER
- Asignado principal + acompanante opcional

**Recordatorios:**
- Aviso inicial
- 7 dias antes
- 3 dias antes
- 1 dia antes
- Mismo dia
- Por destinatario (separados para asignado y acompanante)
- Anti-duplicados via constraint unico

**Envio:**
- Mensaje al asignado
- Mensaje al acompanante si existe
- Registro en logs por cada intento
- Cancelacion envia mensaje de cancelacion
- Edicion regenera recordatorios

**Historial:**
- Ver mensajes enviados
- Ver estado de cada recordatorio
- Filtrar por publicador, fecha, estado

---

### 20.4 Base de datos

Crear migraciones desde cero. Tablas:

- AdminUser
- JwPublisher
- JwMeetingWeek
- JwAssignment
- JwAssignmentReminder
- JwMessageTemplate
- JwMessageLog
- JwWhatsappSessionLog (estado del bot)

Reglas:
- No borrar publicadores con historial (soft delete)
- Telefonos unicos
- Recordatorios por destinatario
- Constraint unico: `[assignmentId, recipientPublisherId, reminderType]`
- Logs separados por persona
- Snapshots de nombre/telefono en asignaciones y logs

---

### 20.5 Seguridad

- No hardcodear contrasena en frontend
- Usuario admin inicial: `admin` / `dorian123` (hash en BD)
- Forzar cambio recomendado antes de produccion publica
- No exponer endpoints internos sin auth
- Proteger rutas admin con JWT/session
- Variables de entorno propias
- No reutilizar secretos de Sistra

---

### 20.6 DNS y dominio

Configurar y validar:

| Paso | Verificacion |
|---|---|
| DNS apunta al VPS | `jw-reminders.duckdns.org` → 187.77.11.79 |
| Dokploy reconoce dominio | Labels de Traefik configurados |
| SSL funciona | HTTPS con certificado valido |
| Frontend abre | Panel accesible en navegador |
| API responde | Endpoints responden por HTTPS |
| Worker conecta | Comunicacion interna entre servicios |
| WhatsApp responde | Health check interno OK |

---

### 20.7 Pruebas obligatorias antes de entregar

#### Infraestructura

- [ ] Frontend online y accesible
- [ ] Backend/API respondiendo
- [ ] Base de datos conectada
- [ ] Worker corriendo
- [ ] WhatsApp conectado
- [ ] SSL activo
- [ ] Logs visibles

#### Funcionales

- [ ] Login admin funciona
- [ ] Crear publicador
- [ ] Editar publicador
- [ ] Desactivar publicador
- [ ] Crear semana
- [ ] Crear asignacion de Lectura de la Biblia
- [ ] Crear asignacion de Seamos mejores maestros con acompanante
- [ ] Generar recordatorios automaticamente
- [ ] Enviar mensaje de prueba al asignado
- [ ] Enviar mensaje de prueba al acompanante
- [ ] Cancelar asignacion (envio de msg cancelacion)
- [ ] Ver historial de mensajes
- [ ] Confirmar que no hay mensajes duplicados

#### WhatsApp

- [ ] QR generado
- [ ] Sesion autenticada
- [ ] Sesion persiste tras reinicio de contenedor
- [ ] Mensaje enviado correctamente
- [ ] Error registrado si numero invalido

---

### 20.8 Reporte final obligatorio

Al finalizar, entregar: **REPORTE-FINAL-JW-REMINDERS.md**

Contenido:
- Que se construyo
- Servicios en Dokploy
- URLs finales
- Variables configuradas (sin mostrar secretos)
- Base de datos creada
- Migraciones aplicadas
- Estado de WhatsApp
- Pruebas realizadas
- Evidencias de resultados
- Errores encontrados y corregidos
- Riesgos pendientes
- Instrucciones para usar el sistema
- Instrucciones para reiniciar servicios
- Instrucciones para regenerar QR si WhatsApp se desconecta
- Checklist final de produccion

---

### 20.9 Regla critica de entrega

**NO marcar como terminado si falta alguna de estas partes:**

1. Deploy en Dokploy
2. Base de datos creada y migrada
3. Frontend funcionando
4. Backend funcionando
5. Worker funcionando
6. WhatsApp autenticado
7. Pruebas realizadas
8. Reporte final entregado

El sistema debe quedar construido, conectado, desplegado y probado.

---

### 20.10 Orden de ejecucion

```
Paso 1: Crear proyecto local (scaffold Next.js + worker)
Paso 2: Schema Prisma + migraciones
Paso 3: Auth + seed admin user
Paso 4: CRUD publicadores
Paso 5: CRUD semanas + asignaciones
Paso 6: Logica de recordatorios
Paso 7: Worker + cron + WhatsApp client
Paso 8: Envio + logs + anti-duplicados
Paso 9: Panel completo (dashboard, historial, plantillas)
Paso 10: Docker compose + Dockerfiles
Paso 11: Deploy en VPS via SSH
Paso 12: Configurar dominio + SSL en Traefik
Paso 13: Conectar WhatsApp (QR)
Paso 14: Pruebas end-to-end
Paso 15: Reporte final
```


---

## 21. ESTRUCTURA OBLIGATORIA DEL PROYECTO

### Principio

El proyecto debe quedar organizado de forma clara, auditable y mantenible.
No se permite dejar toda la logica en un solo archivo ni mezclar frontend, backend, worker, WhatsApp y base de datos sin separacion.

### Estructura tipo monorepo

```
jw-reminders/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── publishers/
│   │   │   │   ├── meeting-weeks/
│   │   │   │   ├── assignments/
│   │   │   │   ├── reminders/
│   │   │   │   ├── message-templates/
│   │   │   │   └── message-logs/
│   │   │   ├── lib/
│   │   │   ├── styles/
│   │   │   └── types/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── publishers/
│   │   │   │   ├── meeting-weeks/
│   │   │   │   ├── assignments/
│   │   │   │   ├── reminders/
│   │   │   │   ├── message-templates/
│   │   │   │   ├── message-logs/
│   │   │   │   └── whatsapp/
│   │   │   ├── jobs/
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── schemas/
│   │   │   └── server.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── worker/
│   │   ├── src/
│   │   │   ├── jobs/
│   │   │   ├── processors/
│   │   │   ├── services/
│   │   │   ├── lib/
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── whatsapp/
│       ├── src/
│       │   ├── client/
│       │   ├── routes/
│       │   ├── session/
│       │   ├── services/
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── database/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       └── client.ts
│   │
│   ├── shared/
│   │   ├── src/
│   │   │   ├── constants/
│   │   │   ├── enums/
│   │   │   ├── validators/
│   │   │   ├── types/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── config/
│       ├── env/
│       ├── eslint/
│       └── tsconfig/
│
├── docs/
│   ├── PLAN-JW-REMINDERS.md
│   ├── DESIGN-SYSTEM-JW-REMINDERS.md
│   ├── JW-SOURCE-RESEARCH.md
│   ├── DEPLOY-DOKPLOY.md
│   ├── WHATSAPP-SESSION.md
│   ├── TESTING-CHECKLIST.md
│   └── REPORTE-FINAL-JW-REMINDERS.md
│
├── infra/
│   ├── docker/
│   ├── dokploy/
│   ├── nginx/
│   └── backups/
│
├── scripts/
│   ├── db-migrate.sh
│   ├── db-seed.sh
│   ├── deploy.sh
│   ├── healthcheck.sh
│   └── backup-db.sh
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── README.md
```

---

### 21.1 Reglas por servicio

#### Frontend (`apps/web/`)

- No colocar logica de base de datos en frontend.
- No colocar secretos en frontend.
- Separar pantallas por modulo en `features/`.
- Componentes reutilizables en `components/`.
- Llamadas al API centralizadas en `lib/api`.

#### Backend/API (`apps/api/`)

- Cada dominio tiene su modulo propio.
- No mezclar rutas de publicadores con rutas de asignaciones.
- No poner toda la logica en `server.ts`.
- Cada modulo separa:

```
modules/publishers/
├── publishers.routes.ts
├── publishers.service.ts
├── publishers.schema.ts
└── publishers.controller.ts
```

#### Worker (`apps/worker/`)

- No expone panel web.
- No maneja rutas admin.
- Solo procesa recordatorios pendientes.
- Logs claros.
- Idempotente.
- Evita duplicados.

#### WhatsApp (`apps/whatsapp/`)

- Sesion persiste en volumen.
- QR consultable desde endpoint protegido o logs.
- No mezclar logica de asignaciones dentro del cliente.
- Solo recibe solicitudes de envio desde API/worker.
- Expone estado: QR_REQUIRED, READY, DISCONNECTED, FAILED.

#### Base de datos (`packages/database/`)

- No crear modelos dispersos.
- No modificar BD manualmente sin migracion.
- Todo cambio pasa por migraciones.
- Seed inicial crea: usuario admin, plantillas base, configuracion inicial.

#### Codigo compartido (`packages/shared/`)

- Enums
- Tipos
- Validadores
- Constantes
- Helpers de fecha
- Helpers de telefono

---

### 21.2 Documentacion obligatoria

| Archivo | Contenido |
|---|---|
| README.md | Que es, como correr local, como desplegar, servicios |
| docs/PLAN-JW-REMINDERS.md | Plan maestro |
| docs/DESIGN-SYSTEM-JW-REMINDERS.md | Diseno visual |
| docs/DEPLOY-DOKPLOY.md | Pasos exactos del deploy |
| docs/WHATSAPP-SESSION.md | Sesion, QR, reinicios, errores |
| docs/TESTING-CHECKLIST.md | Pruebas obligatorias |
| docs/REPORTE-FINAL-JW-REMINDERS.md | Reporte de entrega |

---

### 21.3 Prohibido

- Poner todo en un solo archivo.
- Mezclar frontend con backend.
- Crear logica de WhatsApp dentro del frontend.
- Crear cron dentro del frontend.
- Usar la base de datos de Sistra.
- Reutilizar contenedores de Sistra.
- Guardar secretos en el repositorio.
- Dejar variables sin documentar.
- Crear archivos sueltos sin ubicacion clara.
- Hacer cambios sin actualizar documentacion.

---

### 21.4 Criterio de aceptacion

El proyecto NO se considera terminado si:

- [ ] No respeta la estructura de carpetas
- [ ] No tiene documentacion actualizada
- [ ] No tiene .env.example
- [ ] No tiene migraciones
- [ ] No tiene health checks
- [ ] No tiene reporte final
- [ ] No tiene pruebas documentadas

### 21.5 Regla de auditoria

Antes de entregar, generar mapa del proyecto:

```bash
tree -L 4 -I "node_modules|.git|dist|build"
```

Y colocarlo en el reporte final.


---

## 22. REPOSITORIO Y DESPLIEGUE EN DOKPLOY EXISTENTE

### Repositorio oficial

```
https://github.com/amaurycolochos7/jw-reminders.git
```

El agente debe trabajar sobre este repositorio.

---

### 22.1 Regla critica sobre Dokploy

- **NO** instalar Dokploy dentro del VPS.
- **NO** crear un nuevo panel Dokploy.
- **NO** modificar la instalacion base de Dokploy.

El proyecto debe desplegarse en el **Dokploy existente** (panel en `http://187.77.11.79:3000`) que sera proporcionado mediante API/token/panel.

El VPS solo se usa para tareas auxiliares:
- Verificar DNS
- Revisar conectividad
- Consultas tecnicas
- Comandos puntuales si se autorizan
- Validaciones de red

La aplicacion debe vivir **dentro del panel Dokploy existente**.

---

### 22.2 Tareas: Preparar repositorio

1. Clonar o usar el repositorio GitHub
2. Crear estructura ordenada del proyecto (seccion 21)
3. Crear commits claros y descriptivos
4. Subir cambios a GitHub
5. Confirmar que el repo queda limpio
6. Confirmar que NO se suben secretos
7. Crear `.env.example` completo
8. Crear `.gitignore` adecuado

---

### 22.3 Tareas: Conectar con Dokploy existente

En el panel/API Dokploy existente:

| Tarea | Detalle |
|---|---|
| Crear proyecto | `jw-reminders` |
| Conectar repo GitHub | `https://github.com/amaurycolochos7/jw-reminders.git` |
| Rama principal | `main` |
| Configurar build/deploy | Docker compose |
| Variables de entorno | Todas las necesarias (seccion 11) |

**Servicios a crear:**

| Servicio | Nombre |
|---|---|
| Frontend/Panel | jw-reminders-web |
| Backend/API | jw-reminders-api |
| Worker/Scheduler | jw-reminders-worker |
| WhatsApp | jw-reminders-whatsapp |
| Base de datos | jw-reminders-db |

**Configuracion adicional:**
- Red interna entre servicios
- Volumenes persistentes (sesion WhatsApp, datos BD)
- Health checks por servicio
- Logs visibles
- Reinicio automatico (`restart: unless-stopped`)
- Dominio: `jw-reminders.duckdns.org`
- SSL activo via Traefik/Let's Encrypt

---

### 22.4 Base de datos

- Crear PostgreSQL independiente dentro de Dokploy.
- **No usar** base de datos de Sistra.
- **No usar** base de datos externa sin autorizacion.
- Aplicar migraciones (`prisma migrate deploy`).
- Ejecutar seed inicial (`prisma db seed`).
- Crear usuario admin: `admin` / `dorian123` (hash en BD).

---

### 22.5 WhatsApp

- Crear servicio WhatsApp separado dentro de Dokploy.
- Crear volumen persistente para sesion.
- Exponer mecanismo controlado para obtener QR (logs o endpoint protegido).
- Escanear QR.
- Confirmar estado READY.
- Probar envio de mensaje.
- Confirmar que la sesion persiste despues de reinicio del contenedor.

---

### 22.6 Deploy futuro (CI/CD)

El proyecto debe quedar preparado para deploys futuros desde GitHub.
Cada push a la rama configurada debe permitir redeploy desde Dokploy sin reconfigurar manualmente.

**Documentar:**
- Rama usada (`main`)
- Servicios conectados
- Comando build
- Comando start
- Variables necesarias
- Volumenes
- Dominios
- Como redeployar

---

### 22.7 Prohibido

- Instalar Dokploy en el VPS
- Crear otro panel Dokploy
- Usar contenedores de Sistra
- Usar base de datos de Sistra
- Usar variables de Sistra
- Mezclar deploys con proyectos existentes
- Hacer cambios manuales no documentados
- Subir tokens o credenciales al repositorio

---

### 22.8 Documentacion obligatoria

Crear o actualizar:
- `docs/DEPLOY-DOKPLOY.md` — Pasos exactos del deploy
- `docs/INFRASTRUCTURE.md` — Servicios, redes, volumenes
- `docs/ENVIRONMENT.md` — Variables de entorno (sin secretos)
- `docs/WHATSAPP-SESSION.md` — QR, sesion, reinicios
- `docs/REPORTE-FINAL-JW-REMINDERS.md` — Reporte de entrega

---

### 22.9 Validaciones finales

Antes de entregar, confirmar:

- [ ] GitHub tiene el codigo actualizado
- [ ] Dokploy esta conectado al repo
- [ ] Servicios levantan correctamente
- [ ] Frontend responde por dominio (`https://jw-reminders.duckdns.org`)
- [ ] API responde por dominio o red interna
- [ ] Worker procesa recordatorios
- [ ] WhatsApp esta autenticado
- [ ] Base de datos tiene migraciones aplicadas
- [ ] Admin puede iniciar sesion
- [ ] Se puede crear publicador
- [ ] Se puede crear asignacion
- [ ] Se puede enviar mensaje de prueba
- [ ] Se puede hacer redeploy desde Dokploy


---

## 23. AJUSTE DE AMBIENTES

### Flujo de trabajo

El proyecto **NO usara staging**. El flujo es:

```
Local (Docker) → Pruebas locales → Deploy directo a produccion (Dokploy)
```

---

### 23.1 Ambiente local obligatorio

Antes de desplegar en Dokploy, el agente debe levantar todo localmente con Docker:
- Frontend
- Backend/API
- Worker
- WhatsApp
- PostgreSQL

**Archivos a crear:**

| Archivo | Uso |
|---|---|
| `docker-compose.local.yml` | Levanta todos los servicios en local |
| `.env.example` | Template de variables para produccion |
| `.env.local.example` | Template de variables para desarrollo local |

---

### 23.2 Pruebas locales obligatorias

Antes de subir a produccion, probar en local:

- [ ] Login admin funciona
- [ ] Crear publicador
- [ ] Crear semana
- [ ] Crear asignacion individual (Lectura de la Biblia)
- [ ] Crear asignacion con acompanante (Seamos mejores maestros)
- [ ] Generar recordatorios automaticamente
- [ ] Ver logs de mensajes
- [ ] Probar WhatsApp en modo prueba (TEST_MODE=true)
- [ ] Confirmar que no hay duplicados
- [ ] Confirmar que worker procesa correctamente

---

### 23.3 Deploy en produccion

Despues de pasar pruebas locales, desplegar en Dokploy existente.

- No instalar Dokploy en el VPS.
- No crear staging.
- No tocar Sistra.

---

### 23.4 Seguridad para produccion directa

Como no hay staging, antes de produccion debe existir:

| Requisito | Descripcion |
|---|---|
| Backup inicial de BD | Dump de la base despues del seed |
| Backup volumen WhatsApp | Copia del volumen de sesion |
| Modo prueba configurable | TEST_MODE=true activo al iniciar |
| Checklist de deploy | Documentado en docs/DEPLOY-DOKPLOY.md |
| Rollback documentado | Como revertir si algo falla |
| Health checks | Endpoints /health en cada servicio |
| Logs visibles | Accesibles desde Dokploy |

---

### 23.5 Modo prueba (TEST_MODE)

Variable de entorno:

```env
TEST_MODE=true
TEST_PHONE=5219611234567
```

**Si `TEST_MODE=true`:**
- No envia mensajes a publicadores reales.
- Redirige TODOS los mensajes al numero `TEST_PHONE`.
- Guarda logs marcados como mensajes de prueba.
- El worker procesa normalmente pero el destino es siempre TEST_PHONE.

**Si `TEST_MODE=false`:**
- Envio real a los telefonos de publicadores.
- Solo activar despues de validar que todo funciona.

---

### 23.6 Criterio para activar produccion real

**No se permite cambiar `TEST_MODE=false` hasta confirmar:**

- [ ] WhatsApp en estado READY
- [ ] Admin login funciona
- [ ] CRUD publicadores funciona
- [ ] CRUD asignaciones funciona
- [ ] Recordatorios se generan correctamente
- [ ] Logs se registran correctamente
- [ ] Envio de prueba llega al TEST_PHONE
- [ ] No hay mensajes duplicados
- [ ] Backups creados
- [ ] Rollback documentado

Solo despues de cumplir los 10 puntos se cambia a `TEST_MODE=false`.


---

## 24. FLUJO OBLIGATORIO DE PRUEBAS Y CORRECCION

### Orden de trabajo

```
1. Construir el proyecto
2. Levantar todo en local con Docker
3. Ejecutar pruebas locales
4. Corregir cualquier error local
5. Repetir pruebas locales hasta que pasen
6. Subir cambios al repositorio GitHub
7. Desplegar en Dokploy existente
8. Ejecutar pruebas en produccion
9. Corregir cualquier error detectado en produccion
10. Volver a desplegar si hubo correcciones
11. Repetir pruebas en produccion hasta validar funcionamiento
12. Entregar reporte final completo
```

---

### 24.1 Pruebas locales obligatorias

Antes de produccion, probar en local:

#### Build

- [ ] Build frontend exitoso
- [ ] Build backend/API exitoso
- [ ] Build worker exitoso
- [ ] Build WhatsApp exitoso

#### Infraestructura

- [ ] Conexion a PostgreSQL
- [ ] Migraciones aplicadas
- [ ] Seed ejecutado

#### Funcionales

- [ ] Login admin
- [ ] Crear publicador
- [ ] Editar publicador
- [ ] Desactivar publicador
- [ ] Crear semana
- [ ] Crear asignacion de Lectura de la Biblia
- [ ] Crear asignacion de Seamos mejores maestros sin acompanante
- [ ] Crear asignacion de Seamos mejores maestros con acompanante
- [ ] Generar recordatorios
- [ ] Procesar recordatorios con worker
- [ ] Enviar mensaje de prueba
- [ ] Registrar logs
- [ ] Evitar duplicados
- [ ] Cancelar asignacion
- [ ] Validar que no se envien recordatorios cancelados
- [ ] Validar modo prueba (TEST_MODE=true redirige a TEST_PHONE)

---

### 24.2 Pruebas en produccion obligatorias

Despues del deploy en Dokploy, probar:

#### Infraestructura

- [ ] Dominio abre correctamente (`https://jw-reminders.duckdns.org`)
- [ ] SSL activo
- [ ] Frontend carga
- [ ] API responde /health
- [ ] API responde /ready
- [ ] API responde /version
- [ ] Base de datos conecta
- [ ] Migraciones aplicadas

#### Auth

- [ ] Login admin funciona

#### WhatsApp

- [ ] WhatsApp service levanta
- [ ] QR se genera
- [ ] WhatsApp queda en estado READY
- [ ] Sesion persiste despues de reiniciar contenedor

#### Worker

- [ ] Worker esta corriendo

#### Funcionales

- [ ] Crear publicador real de prueba
- [ ] Crear semana de prueba
- [ ] Crear asignacion de prueba
- [ ] Enviar mensaje de prueba
- [ ] Ver log del mensaje enviado
- [ ] Confirmar que no hay duplicados

#### Seguridad

- [ ] Confirmar que Sistra no fue tocado

---

### 24.3 Regla de correccion

Si algo falla en local o produccion:

1. **No marcar como terminado.**
2. Registrar el error (que fallo, donde, mensaje de error).
3. Corregir el codigo o configuracion.
4. Crear commit con la correccion (mensaje descriptivo).
5. Redeployar si aplica.
6. Repetir la prueba fallida.
7. Documentar resultado en el reporte.

No se permite ignorar fallos ni dejarlos como "pendientes" si son criticos para el funcionamiento basico.

---

### 24.4 Reporte final

Crear: `docs/REPORTE-FINAL-JW-REMINDERS.md`

#### Tabla de pruebas

| Area | Prueba | Ambiente | Resultado | Evidencia | Observaciones |
|---|---|---|---|---|---|
| Build | Frontend | Local | PASS/FAIL | log/screenshot | ... |
| Build | API | Local | PASS/FAIL | ... | ... |
| Funcional | Crear publicador | Local | PASS/FAIL | ... | ... |
| Funcional | Enviar mensaje | Produccion | PASS/FAIL | ... | ... |
| WhatsApp | Sesion persiste | Produccion | PASS/FAIL | ... | ... |
| ... | ... | ... | ... | ... | ... |

#### Contenido obligatorio del reporte

- Pruebas locales realizadas (con resultado)
- Pruebas en produccion realizadas (con resultado)
- Fallos encontrados
- Correcciones aplicadas
- Commits relevantes
- Servicios en Dokploy
- URLs finales
- Estado de WhatsApp
- Estado de base de datos
- Estado del worker
- Confirmacion de que Sistra no fue modificado
- Pendientes reales, si los hay

---

### 24.5 Criterio final

El proyecto solo se considera **terminado** cuando:

1. Todas las pruebas locales pasaron.
2. Todas las pruebas de produccion pasaron.
3. WhatsApp esta en estado READY.
4. Mensaje de prueba fue enviado y recibido.
5. Logs fueron registrados correctamente.
6. No hay mensajes duplicados.
7. El reporte final fue entregado completo.

Si falta cualquiera de estos 7 puntos, el proyecto **no esta terminado**.
