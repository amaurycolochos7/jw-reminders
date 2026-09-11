# Guía de Arquitectura para Agentes

## Módulos Principales del Proyecto

### 1. **Chat de Investigación** (`apps/web/src/features/investigation/`)
Módulo refactorizado de forma modular para mejorar mantenibilidad y navegación.

**Ubicaciones clave:**
- **Entry point**: `apps/web/src/app/dashboard/investigacion/page.tsx` (solo 5 líneas, renderiza ResearchChatClient)
- **Componente cliente**: `apps/web/src/features/investigation/ResearchChatClient.tsx`
- **Documentación detallada**: `apps/web/src/features/investigation/AGENTS.md`

**Estructura interna:**
```
features/investigation/
├── components/         # Componentes visuales (AssistantCard, SourceCard, UserBubble, etc.)
├── hooks/              # useResearchChat() - estado y lógica principal
├── services/           # API calls centralizadas
├── types/              # Interfaces TypeScript compartidas
├── utils/              # Constantes y helpers
├── ResearchChatClient.tsx  # Componente orquestador
├── index.ts            # Exporta todos los módulos
└── AGENTS.md           # Guía detallada para agentes
```

**Responsabilidades:**
- **components/**: UI pura. Cada componente maneja su propio estado interno (tabs, expansiones).
- **hooks/useResearchChat**: Encapsula todo el estado global y efectos.
- **services/api.ts**: Centraliza HTTP hacia `/api/research-chat/*`.
- **types/**: Define interfaces de backend (AssistantResponse, Session, ChatMessage, etc.) — NO customizar sin coordinar con backend.
- **utils/constants**: Mapeos UI (COMMENT_LABELS, LOADING_MESSAGES, etc.).
- **utils/helpers**: Funciones puras (delay, getCommentType, isDesktopViewport).

**Modificaciones comunes:**
- Cambiar UI del header → Editar `ResearchChatClient.tsx` líneas ~60-80.
- Cambiar mensajes de carga → Editar `utils/constants.ts`.
- Añadir nuevo tipo de respuesta → Editar `types/index.ts` + `components/AssistantCard.tsx`.
- Cambiar estilos → Editar archivos component específicos o agregar clases Tailwind en `tailwind.config.ts`.

---

## Estructura General del Proyecto

### Frontend
```
apps/web/
├── src/
│   ├── app/dashboard/investigacion/    # Entry point
│   ├── features/investigation/         # Feature module (NUEVO)
│   ├── components/                     # Shared components (no está aquí; usamos features/)
│   ├── app/                           # Next.js app dir
│   └── globals.css                    # Tailwind + animations (`.gpt-scrollbar` agregado)
└── tailwind.config.ts                 # Config (tokens gpt-*)
```

### Backend
```
apps/api/
├── src/
│   ├── modules/research-chat/         # Rutas HTTP
│   ├── services/research-chat/        # Servicios (bible-resolver, wol-resolver, etc.)
│   ├── routes/                        # Enrutador
│   └── middleware/                    # Auth, CORS, etc.
└── package.json
```

### Tipos Compartidos
```
packages/shared/
├── src/
│   ├── research-references/           # Tipos de investigación (ResearchSource, etc.)
│   ├── index.ts                       # Exporta todo
│   └── ...
```

---

## Flujo de Datos (Chat de Investigación)

1. **Usuario abre página** → `page.tsx` → `ResearchChatClient` + `useResearchChat()`
2. **Usuario escribe pregunta** → `handleKeyDown` → `sendMessage()`
3. **sendMessage() simula estados** → `reading` → `detecting` → `resolving` → `generating`
4. **API call** → `api.sendMessage()` → `POST /api/research-chat/messages`
5. **Backend responde** con `AssistantResponse`
6. **Renderizar**:
   - `AssistantCard` → muestra resumen + tabs de comentarios
   - `SourceCard` → detalle de cada fuente (expandible)
   - `UserBubble` → burbuja del usuario

---

## Cambios Realizados (Refactorización)

### ✅ Frontend
- **Creada carpeta estructura**: `features/investigation/components|hooks|services|types|utils`
- **Creados archivos modulares:**
  - `components/AssistantCard.tsx` - lógica de comentarios y fuentes
  - `components/SourceCard.tsx` - detalle de fuentes
  - `components/EmptyState.tsx` - pantalla inicial
  - `components/UserBubble.tsx` - burbuja usuario
  - `components/LoadingIndicator.tsx` - indicador de carga
  - `components/HighlightedText.tsx` - texto con highlight
  - `components/SidebarPanel.tsx` - sidebar y búsqueda
  - `components/Icons.tsx` - SVGs inline
  - `components/index.ts` - exporta componentes
  - `hooks/useResearchChat.ts` - hook principal (estado + lógica)
  - `services/api.ts` - llamadas HTTP centralizadas
  - `types/index.ts` - interfaces TypeScript
  - `utils/constants.ts` - mapeos UI
  - `utils/helpers.ts` - funciones puras
  - `ResearchChatClient.tsx` - orquestador principal
  - `index.ts` - exporta módulo completo
  - `AGENTS.md` - documentación para agentes

- **Actualizado**: `apps/web/src/app/dashboard/investigacion/page.tsx` - ahora es entry point simple (5 líneas)
- **Actualizado**: `apps/web/src/app/globals.css` - añadido `.gpt-scrollbar` (scrollbar discreto)
- **Sin cambios**: Rutas públicas, comportamiento, estilos finales

### ❌ Backend
No se tocó. El módulo de investigación en `apps/api/src/modules/research-chat/` y `apps/api/src/services/research-chat/` siguen intactos. Las rutas API no cambiaron.

### ❌ Tipos compartidos
No se creó paquete de contratos separado (existe overlap mínimo). Los tipos viven en:
- Frontend: `features/investigation/types/`
- Compartidos: `packages/shared/src/research-references/` (para referencias bíblicas)

---

## Verificación

- ✅ **Build**: `pnpm --filter @jw-reminders/web build` → exitoso, 10.4 kB para página `/dashboard/investigacion`
- ✅ **Funcionalidad**: UI intacta, sin cambios en flujo o comportamiento
- ✅ **Tipos**: TypeScript compila sin errores
- ✅ **Estructura**: Modular, separación clara de responsabilidades

---

## Próximos Pasos (Opcionales)

1. **Backend refactorización similar** (si se desea): Organizar `apps/api/src/modules/research-chat/` con carpetas `controllers|services|types|repositories`.
2. **Tipos compartidos centralizados**: Mover interfaces de API a `packages/shared/src/contracts/research-chat/`.
3. **Tests**: Agregar `__tests__` en cada carpeta de feature.
4. **Documentación adicional**: Per-feature AGENTS.md en otros módulos.

---

## Contacto/Dudas

- **Estructura dudosa?** Revisar `features/investigation/AGENTS.md`
- **¿Dónde está X?** Buscar en la estructura arriba o usar Grep del IDE
- **Cambiar API?** Actualizar `features/investigation/services/api.ts` + `features/investigation/types/index.ts`
