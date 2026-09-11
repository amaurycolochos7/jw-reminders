## Objetivo

Completar todas las fases pendientes de la reorganización del módulo **Chat de investigación** dentro de `jw-reminders`, partiendo del estado actual real del repositorio.

El frontend ya tuvo una primera refactorización. No debes deshacerla ni comenzar nuevamente desde cero.

El resultado final debe dejar organizado y documentado:

- Frontend de Investigación.
- Backend de Investigación.
- Servicios especializados.
- Contratos y tipos compartidos.
- Pruebas.
- Documentación para futuros agentes.

Debe conservarse exactamente el diseño, comportamiento, rutas públicas, respuestas de API, prompts, fuentes, persistencia y resultados actuales.

Esta tarea es una refactorización estructural. No es una reescritura ni una tarea para agregar funciones.

---

## Estado actual conocido

Antes de comenzar, verifica este estado contra el código real:

### Frontend

La ruta:

`apps/web/src/app/dashboard/investigacion/page.tsx`

ya fue reducida de aproximadamente 1125 líneas a un punto de entrada pequeño.

La implementación actual se encuentra en:

`apps/web/src/features/investigation/`

Con una estructura similar a:

```text
apps/web/src/features/investigation/
├── components/
│   ├── AssistantCard.tsx
│   ├── SourceCard.tsx
│   ├── EmptyState.tsx
│   ├── UserBubble.tsx
│   ├── LoadingIndicator.tsx
│   ├── HighlightedText.tsx
│   ├── SidebarPanel.tsx
│   ├── Icons.tsx
│   └── index.ts
├── hooks/
│   └── useResearchChat.ts
├── services/
│   ├── api.ts
│   └── index.ts
├── types/
│   └── index.ts
├── utils/
│   ├── constants.ts
│   ├── helpers.ts
│   └── index.ts
├── ResearchChatClient.tsx
├── index.ts
└── AGENTS.md
Backend

El archivo principal sigue siendo monolítico:

apps/api/src/modules/research-chat/research-chat.routes.ts

Tiene aproximadamente 1044 líneas.

Existen servicios especializados en:

apps/api/src/services/research-chat/

Incluyendo servicios como:

Bible resolver.
WOL resolver.
Topic search.
OpenAI.
Resolución de referencias.
Preguntas compuestas.
Fallbacks y verificación.
Tipos compartidos

Ya existen tipos o utilidades relacionadas en:

packages/shared/src/research-references/

No crees un paquete nuevo de contratos sin comprobar primero si esta área ya cumple esa responsabilidad.

Regla de ejecución

Realiza todas las fases de este prompt.

No te detengas después de revisar o ajustar el frontend.

Debes completar:

Auditoría inicial.
Revisión final del frontend.
Refactorización del backend.
Organización de contratos y tipos.
Documentación.
Pruebas técnicas.
Validación funcional.
Revisión del diff.
Informe final completo.

Solo detente si existe un bloqueo real relacionado con:

pérdida de datos;
producción;
migraciones;
secretos;
cambios incompatibles en API;
cambios fuera del alcance que no puedan aislarse.

En caso de bloqueo, informa exactamente qué encontraste y no improvises.

Fase 1 — Auditoría inicial

Antes de mover o modificar archivos:

Ejecuta y revisa:
git status
git diff
rama actual
cambios previos ajenos a esta tarea
Audita:
apps/web/src/app/dashboard/investigacion/
apps/web/src/features/investigation/
apps/api/src/modules/research-chat/
apps/api/src/services/research-chat/
packages/shared/src/research-references/
Localiza también:
registro principal de rutas de la API;
cliente HTTP del frontend;
acceso a Prisma;
modelos utilizados por sesiones, mensajes y fuentes;
pruebas relacionadas;
archivos de configuración;
imports desde otros módulos.
Identifica en research-chat.routes.ts:
endpoints existentes;
validaciones;
lógica de sesiones;
lógica de mensajes;
consultas a base de datos;
eliminación de sesiones;
recuperación de historial;
generación de respuestas;
fuentes;
manejo de errores;
llamadas a servicios especializados;
transformaciones de respuesta.
Identifica:
tipos duplicados;
funciones duplicadas;
imports circulares;
nombres genéricos;
código muerto;
responsabilidades mezcladas;
código que ya se encuentra correctamente separado y no debe moverse.
Detecta los scripts reales disponibles para:
build;
type-check;
tests;
lint;
ejecución local.

No inventes comandos ni nombres de archivos.

Después de esta auditoría, continúa directamente con las demás fases.

Fase 2 — Revisión final del frontend

El frontend ya fue refactorizado. No lo reconstruyas desde cero ni cambies su diseño.

Mantén:

apps/web/src/app/dashboard/investigacion/page.tsx

como un punto de entrada pequeño.

La implementación debe permanecer en:

apps/web/src/features/investigation/
Revisión obligatoria
ResearchChatClient.tsx

Confirma que sea principalmente un orquestador de componentes.

No debe volver a concentrar:

toda la UI;
todas las peticiones;
todos los efectos;
todos los tipos;
toda la lógica de sesiones;
toda la lógica de mensajes.

Extrae algo únicamente cuando exista una responsabilidad clara.

useResearchChat.ts

Audita su contenido.

Si sus aproximadamente 200 líneas forman una responsabilidad coherente, mantenlo.

Si mezcla demasiadas áreas independientes, separa de forma razonable, por ejemplo:

sesiones;
conversación activa;
envío de mensajes;
búsqueda local;
estado del sidebar.

No crees hooks para cada variable de estado.

No fragmentes únicamente por cantidad de líneas.

Servicios

Confirma que todas las llamadas a:

/api/research-chat/*

estén centralizadas en:

features/investigation/services/

Los componentes no deben:

conocer URLs;
construir peticiones grandes;
repetir fetch;
transformar respuestas complejas.
Tipos

Mantén en el frontend solamente tipos exclusivos de presentación o estado local.

Los contratos públicos de API deben reutilizar tipos compartidos cuando sea seguro.

Utilidades

Revisa:

utils/helpers.ts

Si contiene funciones con una responsabilidad común, renómbralo con un nombre descriptivo.

Si mezcla funciones sin relación, sepáralas razonablemente.

Evita nombres genéricos como:

helpers.ts
functions.ts
common.ts

No crees múltiples archivos diminutos sin necesidad.

Estilos

Revisa:

apps/web/src/app/globals.css

Si .gpt-scrollbar solo se usa en Investigación:

muévela al módulo de Investigación;
renómbrala a un nombre neutral, por ejemplo scrollbar-subtle;
actualiza sus referencias.

Si se usa realmente en varias áreas, mantenla global y renómbrala de manera neutral.

No cambies el diseño visual aprobado.

Fase 3 — Refactorización completa del backend

Refactoriza:

apps/api/src/modules/research-chat/research-chat.routes.ts

El objetivo es que deje de concentrar aproximadamente 1044 líneas con múltiples responsabilidades.

Conserva exactamente:

prefijo /api/research-chat;
nombres de endpoints;
métodos HTTP;
parámetros;
cuerpos de solicitud;
respuestas;
códigos HTTP;
permisos;
autenticación;
comportamiento;
prompts;
fuentes;
persistencia;
mensajes de error públicos.
Estructura orientativa

Adapta la estructura a las convenciones reales del backend:

apps/api/src/modules/research-chat/
├── http/
│   ├── research-chat.routes.ts
│   ├── research-chat.controller.ts
│   └── research-chat.schemas.ts
├── application/
│   ├── conversations/
│   │   ├── list-conversations.ts
│   │   ├── create-conversation.ts
│   │   ├── get-conversation.ts
│   │   └── delete-conversation.ts
│   ├── messages/
│   │   └── send-research-message.ts
│   └── sources/
│       └── get-message-sources.ts
├── persistence/
├── mappers/
├── validators/
├── errors/
├── index.ts
└── AGENTS.md

No es obligatorio utilizar esos nombres exactos.

No crees carpetas vacías ni capas sin código real.

Separación obligatoria
Rutas

Las rutas deben limitarse a:

registrar endpoints;
aplicar middleware;
recibir parámetros;
delegar;
devolver la respuesta HTTP.

No deben contener consultas largas, generación de respuestas o lógica completa de negocio.

Controladores

Los controladores deben:

interpretar la solicitud;
invocar una operación o caso de uso;
convertir errores conocidos en respuestas HTTP.

No deben implementar el motor de investigación.

Operaciones o casos de uso

Separa las operaciones existentes, como:

listar conversaciones;
crear conversación;
obtener conversación;
eliminar conversación;
enviar mensaje;
recuperar fuentes.

No inventes operaciones que no existan.

Persistencia

Extrae las consultas largas de Prisma fuera de las rutas cuando sea razonable.

Puede utilizarse:

repositorio;
gateway;
archivo de queries;
servicio de persistencia;

según la convención ya utilizada por el proyecto.

No agregues una arquitectura artificial.

Servicios de investigación

Los servicios existentes en:

apps/api/src/services/research-chat/

no deben moverse solo por cumplir una estructura.

Si ya tienen una responsabilidad clara, mantenlos.

Documenta cómo se conectan con el módulo HTTP.

No cambies funcionalmente:

bible-resolver;
wol-resolver;
búsqueda temática;
análisis de preguntas compuestas;
referencias explícitas;
selección de fuentes;
OpenAI;
prompts;
fallback manual;
verificación de respuestas.
Registro de rutas

Actualiza correctamente el archivo donde se registra el módulo.

Confirma que las rutas finales sigan respondiendo bajo:

/api/research-chat/*

No deben existir rutas duplicadas ni imports al archivo anterior.

Fase 4 — Contratos y tipos compartidos

Audita:

apps/web/src/features/investigation/types/
apps/api/src/modules/research-chat/
apps/api/src/services/research-chat/
packages/shared/src/research-references/
Objetivo

Centralizar solamente los contratos realmente compartidos entre frontend y backend.

Por ejemplo:

DTO de conversación;
DTO de mensaje;
DTO de fuente;
referencias;
estados públicos;
request de envío;
response del envío;
enums enviados a través de API.
Reglas
Prioriza reutilizar:
packages/shared/src/research-references/

si ya es la ubicación establecida.

No crees:
packages/investigation-contracts/

salvo que exista una razón real y packages/shared no sea apropiado.

No compartas:
tipos de Prisma;
tipos internos de OpenAI;
entidades internas;
tipos exclusivos de infraestructura;
objetos internos de prompts;
estados exclusivos de React.
No cambies los contratos existentes.
No renombres propiedades públicas sin necesidad.
Elimina tipos duplicados únicamente cuando la compatibilidad sea verificable mediante TypeScript y pruebas.
Asegúrate de que frontend y backend importen los contratos desde una fuente clara.
Fase 5 — Documentación completa para agentes
AGENTS.md raíz

Crea o actualiza:

AGENTS.md

Debe contener un mapa breve del repositorio:

Frontend de Investigación:
apps/web/src/features/investigation/

Ruta:
apps/web/src/app/dashboard/investigacion/

Backend HTTP:
apps/api/src/modules/research-chat/

Servicios especializados:
apps/api/src/services/research-chat/

Contratos compartidos:
packages/shared/src/research-references/

Documentación:
docs/modules/investigation.md

También debe incluir reglas breves:

no colocar lógica de negocio en page.tsx;
no acceder a Prisma desde frontend;
no mezclar Investigación con Avisos;
no cambiar contratos sin verificar frontend y backend;
no modificar resolvedores sin ejecutar pruebas;
no tocar migraciones sin autorización.

No conviertas el archivo raíz en un manual extenso.

Documento del módulo

Crea:

docs/modules/investigation.md

Debe explicar:

propósito del módulo;
ruta pública;
estructura del frontend;
estructura del backend;
servicios especializados;
contratos compartidos;
flujo completo de una pregunta;
flujo de sesiones;
flujo de mensajes;
fuentes;
preguntas múltiples;
referencias bíblicas;
referencias de publicaciones;
persistencia;
pruebas obligatorias;
áreas sensibles.

Incluye un árbol resumido y rutas reales.

Guía del frontend

Actualiza:

apps/web/src/features/investigation/AGENTS.md

Debe indicar dónde modificar:

layout;
sidebar;
conversaciones;
mensajes;
fuentes;
composer;
estado;
servicios HTTP;
tipos;
estilos.
Guía del backend

Crea:

apps/api/src/modules/research-chat/AGENTS.md

Debe indicar dónde modificar:

rutas;
controladores;
sesiones;
mensajes;
persistencia;
orquestación;
resolvedor bíblico;
WOL;
preguntas compuestas;
referencias explícitas;
fuentes;
errores.

Debe mencionar que los servicios especializados se encuentran en:

apps/api/src/services/research-chat/

La documentación debe ayudar a futuros agentes a localizar el código sin explorar todo el repositorio.

Fase 6 — Pruebas técnicas

Ejecuta los comandos reales disponibles.

Como mínimo, verifica:

Type-check del frontend.
Build del frontend.
Type-check o build de la API.
Tests generales de research-chat.
Tests del resolvedor bíblico.
Tests de referencias explícitas.
Tests de preguntas múltiples.
Tests de fallback manual.
Tests de fuentes o verificación.
Lint, únicamente si existe.

Busca pruebas con nombres similares a:

_test_manual_fallback
_test_bible_local_resolver
research-chat
compound-question
explicit-reference
source-verifier
wol-resolver

Usa los nombres reales encontrados.

No inventes resultados.

No elimines pruebas para hacer que el build pase.

No desactives validaciones.

No agregues @ts-ignore, @ts-nocheck ni any para ocultar errores.

Si una prueba falla:

Determina si el fallo fue causado por la refactorización.
Corrige imports, mocks o dependencias si corresponde.
No cambies las expectativas funcionales para forzar el éxito.
Documenta el fallo si era previo.
Fase 7 — Validación funcional

Usa el entorno local o Docker disponible.

Valida realmente:

apertura de /dashboard/investigacion;
respuesta HTTP correcta;
listado de conversaciones;
selección de conversación;
carga de historial;
creación de conversación;
eliminación de conversación, si existe;
búsqueda en sidebar;
colapsar y expandir sidebar;
envío de una pregunta;
estado de carga;
visualización de la respuesta;
visualización de fuentes;
apertura del detalle de fuente;
acciones de copiar o ajustar;
pregunta con dos interrogantes;
pregunta con texto bíblico explícito;
pregunta con publicación explícita;
manejo de respuesta sin fuentes;
manejo de error;
vista móvil;
navegación con teclado;
consola sin errores.

No afirmes que una función fue probada únicamente porque el build pasó.

Diferencia claramente:

probado mediante test;
probado manualmente;
no probado por falta de datos o credenciales.

No uses usuarios reales ni datos de producción.

Fase 8 — Revisión final

Antes de entregar:

Ejecuta git status.
Revisa el git diff completo.
Separa cambios de esta tarea y cambios anteriores.
Confirma que no se modificaron accidentalmente:
Avisos;
Publicadores;
Asignaciones;
Reuniones;
Programas;
Plantillas;
WhatsApp;
esquema de Prisma;
migraciones;
producción.
Busca:
imports rotos;
imports sin uso;
exports duplicados;
rutas duplicadas;
archivos huérfanos;
código muerto;
tipos duplicados;
nombres inconsistentes entre investigation y research-chat.
No cambies nombres públicos únicamente para hacer coincidir ambos idiomas.
Documenta que:
investigation es el nombre del feature frontend;
research-chat es el nombre del módulo y API backend;
si decides conservar ambos.
Restricciones
No cambiar el diseño aprobado.
No cambiar comportamiento visible.
No cambiar /dashboard/investigacion.
No cambiar /api/research-chat/*.
No cambiar requests ni responses públicos.
No cambiar autenticación ni permisos.
No modificar prompts.
No modificar reglas de generación.
No modificar resultados de búsqueda intencionalmente.
No modificar resolvedores funcionalmente.
No modificar base de datos.
No cambiar schema.prisma.
No crear migraciones.
No ejecutar db push.
No modificar datos.
No agregar dependencias.
No usar any.
No usar @ts-ignore.
No desactivar TypeScript.
No eliminar pruebas.
No modificar otros módulos salvo imports imprescindibles.
No desplegar.
No hacer push.
No tocar producción.
No crear capas vacías.
No crear sobrearquitectura.
No fragmentar archivos solamente por número de líneas.
No duplicar lógica.
No dejar fases incompletas sin informarlo.
Criterios de aceptación

La tarea se considera completa únicamente cuando:

page.tsx sigue siendo un punto de entrada pequeño.
El frontend mantiene la estructura modular.
El frontend conserva el diseño y comportamiento actual.
Las llamadas API están centralizadas.
Los nombres genéricos pendientes fueron revisados.
Los estilos exclusivos del módulo no contaminan innecesariamente estilos globales.
research-chat.routes.ts dejó de contener toda la lógica.
Las rutas delegan en controladores, operaciones o servicios claros.
Las consultas largas no permanecen mezcladas con el registro HTTP.
Los servicios especializados continúan funcionando.
Las rutas públicas no cambiaron.
Los contratos compartidos tienen una fuente clara.
No existen duplicaciones innecesarias entre frontend y backend.
Existe documentación raíz.
Existe documentación del módulo.
Existe guía del frontend.
Existe guía del backend.
Los builds pasan.
Los tests existentes relacionados pasan o sus fallos previos están demostrados.
Los flujos funcionales principales fueron comprobados.
No hay cambios fuera del alcance.
Entrega final obligatoria

Entrega un solo informe completo con las siguientes secciones.

1. Resumen ejecutivo

Explica en pocas líneas:

qué se reorganizó;
qué se conservó;
resultado general;
estado de frontend y backend.
2. Estado inicial

Incluye:

estructura encontrada;
tamaño aproximado de archivos monolíticos;
responsabilidades mezcladas;
tipos duplicados;
deuda técnica detectada;
cambios previos ajenos a la tarea.
3. Fases completadas

Reporta una por una:

Fase	Estado	Resultado
Auditoría	Completada/Pendiente/Bloqueada	Resumen
Frontend	Completada/Pendiente/Bloqueada	Resumen
Backend	Completada/Pendiente/Bloqueada	Resumen
Contratos	Completada/Pendiente/Bloqueada	Resumen
Documentación	Completada/Pendiente/Bloqueada	Resumen
Pruebas	Completada/Pendiente/Bloqueada	Resumen
Validación funcional	Completada/Pendiente/Bloqueada	Resumen
Revisión final	Completada/Pendiente/Bloqueada	Resumen

No marques una fase como completada cuando solo fue revisada.

4. Estructura final

Incluye un árbol resumido y real de:

frontend;
backend;
servicios;
contratos;
documentación;
pruebas relevantes.
5. Archivos

Separa en listas:

Creados
Movidos
Modificados
Eliminados
Cambios previos ajenos a esta tarea

No digas “contenido movido” si no hubo realmente un movimiento de archivo.

6. Responsabilidades finales

Indica exactamente dónde quedó:

entrada de página;
layout;
sidebar;
sesiones;
mensajes;
fuentes;
composer;
llamadas HTTP;
rutas backend;
controladores;
operaciones;
persistencia;
preguntas múltiples;
referencias bíblicas;
referencias WOL;
OpenAI;
fallback;
verificación.
7. Contratos y tipos

Indica:

tipos centralizados;
ubicación final;
tipos que permanecieron locales;
duplicaciones eliminadas;
duplicaciones deliberadamente conservadas;
compatibilidad entre frontend y backend.
8. Documentación creada

Incluye:

archivos creados o actualizados;
propósito de cada archivo;
rutas principales documentadas.
9. Comandos ejecutados

Presenta una tabla:

Comando	Resultado	Observaciones

Incluye los comandos exactos.

No uses únicamente “build correcto”.

10. Pruebas

Reporta por separado:

pruebas ejecutadas;
cantidad de pruebas;
pruebas exitosas;
pruebas fallidas;
pruebas inexistentes;
fallos previos;
fallos causados por esta refactorización;
correcciones realizadas.
11. Validación funcional

Para cada flujo indica:

Flujo	Probado	Método	Resultado

Diferencia entre:

prueba automática;
prueba manual;
inspección estática;
no probado.
12. Limitaciones y deuda técnica

Indica:

lo que no pudo probarse;
razones;
deuda técnica restante;
riesgos futuros;
áreas que se decidió no modificar.
13. Confirmación final

Confirma explícitamente:

sin cambios intencionales de diseño;
sin cambios intencionales de comportamiento;
sin cambios de rutas públicas;
sin cambios de contratos públicos;
sin migraciones;
sin cambios de base de datos;
sin dependencias nuevas;
sin deploy;
sin push;
sin cambios en producción;
sin modificaciones a otros módulos salvo imports estrictamente necesarios.

No hagas deploy ni push