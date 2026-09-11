# Módulo: Chat de Investigación Bíblica

## Ubicación
- **Frontend**: `apps/web/src/features/investigation/`
- **Backend**: `apps/api/src/modules/research-chat/`
- **Documentación**: `AGENTS.md` (en cada ubicación)

## Propósito
Orquestar investigaciones bíblicas interactivas: recibir preguntas, resolver referencias (Biblia, WOL, precursores), enriquecer con búsqueda temática, generar respuestas via OpenAI, y entregar resultados con fuentes validadas.

## Arquitectura

### Frontend
```
ResearchChatClient (orquestador)
├── useResearchChat (state)
├── SidebarPanel (sesiones)
├── MessageList (historial)
├── SourceCard (fuentes)
├── ComposerBox (entrada)
└── ResponseDisplay (respuesta)
```

**Servicios**:
- `api.ts` (120 líneas): Llamadas centralizadas a backend

**Tipos**:
- `packages/shared/src/research-references/` (compartidos con backend)

### Backend
```
http/research-chat.routes.ts (entrada, delegación)
└── application/
    ├── conversations/ (CRUD sesiones)
    ├── messages/ (orquestación: resolver → buscar → IA → guardar)
    ├── sources/ (resolución on-demand)
    └── prompts/ (gestión de prompts)
```

**Servicios especializados** (sin cambios):
- `wol-resolver.service.ts`: JW.org API
- `openai.service.ts`: Integración OpenAI
- `bible-local-resolver.service.ts`: Biblia local
- `topic-search.service.ts`: Búsqueda temática
- `source-validator.service.ts`: Validación de URLs
- Otros: precursor-matcher, compound-questions, source-integrity

## Cómo Modificar

### Cambiar UI
Edita `apps/web/src/features/investigation/components/`.

### Cambiar comportamiento (frontend)
Edita `apps/web/src/features/investigation/hooks/useResearchChat.ts`.

### Cambiar lógica de respuesta (backend)
Edita `apps/api/src/modules/research-chat/application/messages/send-research-message.ts` (450+ líneas, orquestación compleja).

### Cambiar resolución de referencias
Edita `apps/api/src/services/research-chat/wol-resolver.service.ts` (especializado).

### Agregar endpoint
1. Crea operación en `application/*/`
2. Regístralo en `http/research-chat.routes.ts`
3. Mantén ruta en `/api/research-chat/*`

## Rutas Públicas
- `GET /api/research-chat/sessions` — Listar sesiones
- `POST /api/research-chat/sessions` — Crear sesión
- `GET /api/research-chat/sessions/:id` — Obtener historial
- `DELETE /api/research-chat/sessions/:id` — Borrar sesión
- `POST /api/research-chat/messages` — Enviar pregunta + recibir respuesta
- `POST /api/research-chat/resolve-references` — Resolver referencias en texto
- `GET /api/research-chat/sources/resolve?reference=...` — Resolver una fuente
- `POST /api/research-chat/regenerate` — Regenerar comentario con instrucción
- `GET /api/research-chat/prompt-rules` — Listar prompts (admin)
- `POST /api/research-chat/prompt-rules` — Crear prompt (admin)

## Flujos Principales

### Enviar Pregunta
1. Frontend: `POST /messages { sessionId, message, options }`
2. Backend:
   - Crear/validar sesión
   - Guardar mensaje usuario
   - Parsear referencias (WOL, Biblia, precursor)
   - Búsqueda temática
   - Detección: ¿Tenemos contenido para IA?
   - Llamar OpenAI con contexto
   - Validar highlights en fuentes
   - Guardar respuesta
3. Frontend: Mostrar respuesta + fuentes

### Preguntas Múltiples
La lógica de `parseCompoundQuestion` detecta "¿Qué?" + "¿Cómo?" y estructura el contexto para que IA responda cada parte.

### Fallback Gateado
Si no hay referencias explícitas ni coincidencias temáticas: respuesta controlada sin contenido especulativo.

## Pruebas
- `source-integrity.test.ts` — Separación verified/AI-suggested
- `compound-questions.test.ts` — Parsing de preguntas
- `source-gating.test.ts` — Lógica de gateado

Ejecutar: `cd apps/api && npm test`

## Debugging

Agregar logs en `send-research-message.ts`:
```javascript
console.log("References resolved:", resolvedRefs.length);
console.log("Topic search:", topicSearchResults?.totalResults);
console.log("AI Response:", aiResponse.summary?.slice(0, 100));
```

## Consulta Rápida
- **¿Dónde está la lógica de envío?** → `application/messages/send-research-message.ts`
- **¿Dónde están las sesiones?** → Prisma model `ChatSession`, CRUD en `application/conversations/`
- **¿Cómo resuelve referencias?** → `wol-resolver.service.ts` + `bible-local-resolver.service.ts`
- **¿Cómo filtra fuentes?** → `source-validator.service.ts` + lógica en `send-research-message.ts`
- **¿Cómo sabe qué responder?** → Sistema prompt en BD (`researchPromptRule`), cargado en `routes.ts`

---

Para detalles completos, ver `INVESTIGATION_REFACTOR_REPORT.md` y `AGENTS.md` en cada módulo.
