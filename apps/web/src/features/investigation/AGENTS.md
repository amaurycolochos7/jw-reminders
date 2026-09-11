# Chat de Investigación - Guía para Agentes

## Estructura del Módulo Frontend

El módulo de investigación ha sido refactorizado en una estructura modular dentro de `apps/web/src/features/investigation/`.

```
features/investigation/
├── components/           # Componentes React reutilizables
│   ├── AssistantCard.tsx
│   ├── EmptyState.tsx
│   ├── HighlightedText.tsx
│   ├── Icons.tsx
│   ├── LoadingIndicator.tsx
│   ├── SourceCard.tsx
│   ├── SidebarPanel.tsx
│   ├── UserBubble.tsx
│   └── index.ts          # Exporta todos los componentes
├── hooks/
│   ├── useResearchChat.ts    # Hook principal que maneja el estado y la lógica
│   └── index.ts
├── services/
│   ├── api.ts            # Llamadas API centralizadas
│   └── index.ts
├── types/
│   └── index.ts          # Interfaces TypeScript compartidas
├── utils/
│   ├── constants.ts      # Constantes (labels, mensajes)
│   ├── helpers.ts        # Funciones auxiliares
│   └── index.ts
├── ResearchChatClient.tsx    # Componente cliente principal
└── AGENTS.md             # Esta documentación
```

## Puntos de Entrada

- **Página:** `apps/web/src/app/dashboard/investigacion/page.tsx`
  - Entry point de Next.js que simplemente renderiza `<ResearchChatClient />`

- **Componente Cliente:** `apps/web/src/features/investigation/ResearchChatClient.tsx`
  - Componente principal que utiliza el hook `useResearchChat()`
  - Orquesta la interfaz completa (sidebar, header, messages, composer)

## Responsabilidades por Carpeta

### `components/`
Cada componente es responsable de una parte visual específica:

- **AssistantCard.tsx**: Renderiza respuestas del asistente con tabs de comentarios, fuentes verificadas, referencias sugeridas, etc.
- **SourceCard.tsx**: Detalle de una fuente individual (Biblia, publicación WOL, texto usuario) con expandir/contraer y recarga de contenido.
- **EmptyState.tsx**: Pantalla inicial con sugerencias de preguntas de ejemplo.
- **UserBubble.tsx**: Burbuja de mensaje del usuario.
- **HighlightedText.tsx**: Renderiza texto con partes resaltadas (usado en SourceCard).
- **LoadingIndicator.tsx**: Indicador de carga con dots animados y texto rolling.
- **SidebarPanel.tsx**: Contiene `SidebarPanelContents` (boton nuevo chat, buscador, listado) y `ConversationList` (cada item de conversación).
- **Icons.tsx**: SVG inline para Sidebar, Search, Plus, Close (familia Heroicons).

### `hooks/useResearchChat.ts`
Hook principal que encapsula:
- **Estado**: `sessions`, `currentSessionId`, `messages`, `input`, `loadingStep`, `error`, `sidebar*`, `search*`, `options*`, `outputType`, `level`, `duration`
- **Refs**: `messagesEndRef`, `textareaRef`, `searchInputRef`
- **Funciones**:
  - `loadSessions()`: Obtiene historial
  - `loadSession(id)`: Carga una conversación específica
  - `startNewChat()`: Inicia chat nuevo (limpia estado)
  - `deleteSessionData(id)`: Borra una sesión
  - `sendMessage(e)`: Envía pregunta, simula estados de carga, procesa respuesta
  - `handleQuickAction(instruction)`: Regenera comentarios
  - `handleKeyDown()`: Enter para enviar (Shift+Enter para salto de línea)

### `services/api.ts`
Centraliza todas las llamadas HTTP:
- `fetchSessions()`: GET `/api/research-chat/sessions`
- `fetchSession(id)`: GET `/api/research-chat/sessions/{id}`
- `deleteSession(id)`: DELETE `/api/research-chat/sessions/{id}`
- `sendMessage(payload)`: POST `/api/research-chat/messages`
- `regenerateComment(payload)`: POST `/api/research-chat/regenerate`
- `resolveSource(reference)`: GET `/api/research-chat/sources/resolve`

Cada función retorna `null` si falla (no lanza excepciones a nivel de componente).

### `types/index.ts`
Define interfaces compartidas:
- `LoadingStep`: estados de carga ('idle', 'reading', 'detecting', 'resolving', 'generating', 'done')
- `Session`, `ChatMessage`: historial y conversaciones
- `AssistantResponse`, `GeneratedComment`, `UsedSource`, etc.: respuesta del backend
- Preserva estructura de backend (no customizar estos tipos)

### `utils/constants.ts`
Mapeos UI que raramente cambian:
- `LOADING_MESSAGES`: mensajes por LoadingStep
- `COMMENT_LABELS`: tipos de comentario (directo, natural, razonado, profundo)
- `QUESTION_TYPE_LABELS`, `MODE_LABELS`: etiquetas para badges
- Fácil de localizar y actualizar si la UI cambia de texto

### `utils/helpers.ts`
Funciones puras:
- `delay(ms)`: espera para simular estados
- `getCommentType()`, `getCommentSources()`: mapeos seguros con fallbacks
- `isDesktopViewport()`: chequea si pantalla > 1024px (para sidebar collapsible)

## Flujo de Datos

```
ResearchChatClient (orquestador)
  ├─ useResearchChat() (state + logic)
  │  ├─ api.ts (HTTP calls)
  │  ├─ types/ (interfaces)
  │  └─ utils/ (helpers)
  │
  └─ Componentes visuales
     ├─ Header (sidebar toggle, search toggle)
     ├─ Sidebar (SidebarPanelContents + ConversationList)
     ├─ Messages (UserBubble + AssistantCard)
     │   └─ AssistantCard
     │       └─ SourceCard
     │           └─ HighlightedText
     ├─ Composer (textarea, options, botón enviar)
     └─ LoadingIndicator (en transición de estados)
```

## Modificaciones Comunes

### Cambiar UI del Header
Editar: `ResearchChatClient.tsx` (líneas ~60-80)
- Botones, títulos, spacing

### Añadir nueva opción en Composer
Editar:
- `ResearchChatClient.tsx` (forma del composer)
- `useResearchChat.ts` (estado y lógica)
- `services/api.ts` (payload al backend)

### Cambiar estilos de tarjeta de comentario
Editar: `components/AssistantCard.tsx` (líneas ~138+)

### Cambiar mensajes de carga
Editar: `utils/constants.ts` (LOADING_MESSAGES)

### Agregar nuevo tipo de respuesta  
Editar:
- `types/index.ts` (tipos)
- `components/AssistantCard.tsx` (renderizado)

## Pruebas Importantes

Al hacer cambios, verificar:

1. **Conversación nueva**: clic "Nuevo chat" → lista vacía → enviar pregunta
2. **Seleccionar chat**: clic en item de historial → se carga la conversación
3. **Buscador**: clic lupa → escribir → filtra por título sin cambiar historial real
4. **Sidebar móvil**: resize a <1024px → debe ser panel overlay
5. **Textarea**: autoajustable, Enter=enviar, Shift+Enter=nueva línea
6. **Respuesta**: badges, comentarios con tabs, fuentes expandibles, referencias sugeridas
7. **SourceCard**: botón "Ver" expande/contrae, links funcionan
8. **Console**: sin errores TS ni errores de runtime

## Referencias al Backend

El módulo espera que el backend en `apps/api/src/modules/research-chat/` proporcione:

- **Rutas**: `/api/research-chat/sessions`, `/api/research-chat/messages`, etc.
- **Respuestas**: AssistantResponse con estructura específica (ver tipos)
- **Errores**: HTTP status codes normales; el frontend maneja `null` como fallo

No personalizar tipos ni rutas esperadas sin coordinar con backend.

## Notas Arquitectónicas

- **Sin Redux/Context**: useResearchChat es self-contained, pasable a múltiples componentes si necesario
- **Sin suspense**: carga manual con states, no React.lazy (TBD si necesario)
- **Imports**: todo relativo a features/investigation, no imports del resto de app
- **Estilos**: Tailwind inline, colores gpt-* desde tailwind.config.ts
- **A11y**: botones tienen `aria-*`, inputs accesibles, focus-visible, ARIA labels
