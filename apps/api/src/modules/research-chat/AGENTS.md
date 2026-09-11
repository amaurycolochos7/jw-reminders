# Guía de Arquitectura - Módulo Research Chat Backend

## Propósito

Orquestar la investigación bíblica mediante:
- Resolución de referencias bíblicas y WOL
- Búsqueda temática
- Generación de respuestas via OpenAI
- Validación de fuentes
- Persistencia en Prisma

## Estructura

```
apps/api/src/modules/research-chat/
├── http/                          # Capa HTTP
│   ├── research-chat.routes.ts    # Registro de endpoints, delegación
│   └── index.ts
├── application/                   # Casos de uso
│   ├── conversations/             # Gestión de sesiones
│   │   ├── list-conversations.ts
│   │   ├── create-conversation.ts
│   │   ├── get-conversation.ts
│   │   ├── delete-conversation.ts
│   │   └── index.ts
│   ├── messages/                  # Procesamiento de mensajes
│   │   ├── send-research-message.ts  (620+ líneas de lógica orquestada)
│   │   ├── regenerate-comment.ts
│   │   └── index.ts
│   ├── sources/                   # Resolución de fuentes
│   │   ├── resolve-references.ts
│   │   ├── resolve-source.ts
│   │   └── index.ts
│   ├── prompts/                   # Gestión de prompts (admin)
│   │   ├── list-prompt-rules.ts
│   │   ├── create-prompt-rule.ts
│   │   └── index.ts
│   └── index.ts                   # Exporta todo
├── index.ts                       # Exporta módulo
└── AGENTS.md                      # Esta guía
```

## Responsabilidades por Carpeta

### http/
- **Tarea**: Registrar endpoints HTTP y delegar
- **No debe**: Contener lógica de negocio
- **Sí debe**: Validar parámetros, traducir errores a respuestas HTTP

### application/conversations/
- **Tarea**: Operaciones CRUD sobre sesiones
- **Funciones**:
  - `listConversations(userId)` - GET /sessions
  - `createConversation(userId, title?)` - POST /sessions
  - `getConversation(sessionId, userId)` - GET /sessions/:id
  - `deleteConversation(sessionId, userId)` - DELETE /sessions/:id

### application/messages/
- **Tarea**: Procesar preguntas y generar respuestas
- **Funciones**:
  - `sendResearchMessage(input)` - POST /messages
    - Resuelve referencias
    - Búsqueda temática
    - Source-gating
    - Llamada a OpenAI
    - Validación de respuesta
    - Persistencia
  - `regenerateComment(input)` - POST /regenerate

### application/sources/
- **Tarea**: Resolver referencias bajo demanda
- **Funciones**:
  - `resolveTextReferences(text)` - POST /resolve-references
  - `resolveSource(reference)` - GET /sources/resolve

### application/prompts/
- **Tarea**: Gestionar reglas de prompts (admin)
- **Funciones**:
  - `listPromptRules()` - GET /prompt-rules
  - `createPromptRule(name, content, userId)` - POST /prompt-rules

## Servicios Especializados

No están en este módulo, sino en `../../services/research-chat/`:

| Servicio | Responsabilidad |
|----------|---|
| `wol-resolver.service.ts` | Resuelve referencias WOL/Bible via JW.org |
| `openai.service.ts` | Genera respuestas via OpenAI |
| `precursor-matcher.service.ts` | Detecta coincidencias con libro de precursores |
| `topic-search.service.ts` | Búsqueda temática local |
| `bible-local-resolver.service.ts` | Resuelve citas bíblicas desde JSON local |
| `source-validator.service.ts` | Valida que las fuentes tengan URLs válidas |
| `source-integrity.service.ts` | Separa fuentes verificadas vs sugerencias IA |
| `compound-questions.service.ts` | Detecta y estructura preguntas múltiples |

## Flujo: POST /messages

```
1. Recibir { sessionId, message, options }
2. Validar mensaje
3. Crear o recuperar sesión
4. Guardar mensaje del usuario
5. Parsear referencias (parseAllReferences)
6. Parsear estructura de preguntas (parseCompoundQuestion)
7. Intentar detectar contexto del libro de precursores
8. Resolver referencias (resolveReferences → wol-resolver)
9. Guardar referencias en BD
10. Detectar modo EXPLICIT_REFERENCE_ONLY
11. Si no hay refs explícitas: topic search (searchByTopic)
12. Source-gating: ¿Tenemos suficiente contenido para llamar a IA?
13. Si modo EXPLICIT_REFERENCE_ONLY y no hay refs resueltas: Respuesta bloqueada
14. Si no hay contenido usable: Respuesta de gating
15. Obtener prompt system de BD
16. Recuperar historial anterior (últimos 10 mensajes)
17. Generar mensaje enriquecido para IA (incluir contexto)
18. Llamar a OpenAI (generateResearchResponse)
19. Validar highlights en las fuentes
20. Enriquecer fuentes con highlights validados
21. Integridad: separar verified sources vs AI suggestions
22. Modo EXPLICIT_REFERENCE_ONLY: filtrar referencias no presentes en fuentes
23. Validación de fuentes: verificar URLs
24. Guardar respuesta en BD (sin contenido completo WOL, solo preview)
25. Guardar metadata de ejecución IA
26. Calcular estado de verificación de fuentes
27. Validar cobertura de respuesta vs sub-preguntas
28. Retornar respuesta al frontend
```

## Cómo Modificar

### Cambiar sistema prompt

El prompt se carga desde BD (`researchPromptRule.findFirst({ name: "system_prompt" })`).
Usa el endpoint `POST /prompt-rules` para actualizar.

### Cambiar comportamiento de resolución de referencias

Edita `../../services/research-chat/wol-resolver.service.ts`.
Asegúrate de que devuelva el formato esperado por `send-research-message.ts`.

### Cambiar búsqueda temática

Edita `../../services/research-chat/topic-search.service.ts`.
Verifica que el output tiene `.bibleResults` y `.precursorResults`.

### Cambiar validación de fuentes

Edita `../../services/research-chat/source-validator.service.ts`.
Debe devolver `{ validSources, invalidSources }`.

### Agregar nuevo endpoint

1. Crea operación en `application/*/`
2. Registra ruta en `http/research-chat.routes.ts`
3. Mantén la ruta en `/research-chat/*`

### Cambiar estructura de sesiones/mensajes

Edita modelos en `packages/database/prisma/schema.prisma`.
NO cambies la forma en que se guardan sin coordinar con frontend.

## Áreas Sensibles

⚠️ **CRITICAL**: No modifiques sin coordinación:
- `send-research-message.ts` — Orquestación compleja, muchos efectos secundarios
- Validación de highlights — Impacta la exactitud de citas
- Integridad de fuentes — Protege contra inyección de IA
- Modo EXPLICIT_REFERENCE_ONLY — Impacta confiabilidad

## Tests

Busca tests relacionados:
- `source-integrity.test.ts`
- `compound-questions.test.ts`
- `source-gating.test.ts`

Ejecuta con: `npm test` en `apps/api`

## Debugging

Agrega logs en `send-research-message.ts`:
- `console.log("References resolved:", resolvedRefs.length)`
- `console.log("Topic search results:", topicSearchResults?.totalResults)`
- `console.log("AI Response:", aiResponse.summary?.slice(0, 100))`
