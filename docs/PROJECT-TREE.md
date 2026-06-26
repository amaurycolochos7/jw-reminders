# PROJECT TREE

> Mapa completo del repositorio JW-REMINDERS y proposito de cada carpeta/archivo relevante.

## Arbol (archivos versionados, sin `node_modules`/`.next`/`.gstack`)

```
jw-reminders/
├── apps/
│   ├── api/                         # REST API (Express) — reglas de negocio y motores
│   │   ├── Dockerfile               # Imagen API; CMD: prisma migrate deploy + seed + node
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── server.ts            # Bootstrap Express (helmet, cors, json, /api)
│   │       ├── routes/
│   │       │   └── index.ts         # Monta todos los modulos bajo /api (auth publico)
│   │       ├── middleware/
│   │       │   └── auth.ts          # authMiddleware: verifica JWT Bearer
│   │       ├── modules/             # Un modulo por dominio (routes [+ service])
│   │       │   ├── auth/            # login, emision de JWT
│   │       │   ├── dashboard/       # Centro Operativo (operational-center.service)
│   │       │   ├── config/          # AppConfig (TIMEZONE, TEST_MODE, ...)
│   │       │   ├── publishers/      # CRUD publicadores (soft delete)
│   │       │   ├── meeting-weeks/   # Semanas + generar automatizaciones por semana
│   │       │   ├── monthly-schedules/ # Programas: detalle, semanas, propuestas, bulk
│   │       │   ├── assignments/     # CRUD asignaciones + generar/cancelar/completar
│   │       │   ├── reminders/       # Lectura de recordatorios (legacy/consulta)
│   │       │   ├── automation-center/ # Supervision y acciones de entregas
│   │       │   ├── imports/         # Endpoints de importacion (providers/preview/confirm)
│   │       │   ├── message-templates/ # Plantillas de mensaje
│   │       │   ├── message-logs/    # Historial de mensajes
│   │       │   └── whatsapp/        # Proxy al servicio WhatsApp
│   │       └── services/            # Logica transversal (no atada a HTTP)
│   │           ├── automation.service.ts      # Motor de planes/entregas
│   │           ├── assignment-proposal.ts     # Algoritmo de scoring (puro)
│   │           ├── assignment-proposal.test.ts
│   │           ├── import.service.ts          # parser/validator/normalizer/persist
│   │           ├── import.service.test.ts
│   │           ├── date-utils.ts              # Zona horaria, calculo de scheduledAt
│   │           ├── date-utils.test.ts
│   │           └── providers/                 # Capa desacoplada de Providers
│   │               ├── types.ts               # Interfaz + formas canonicas + presets
│   │               ├── manual.provider.ts
│   │               ├── import.provider.ts
│   │               ├── jw.provider.ts         # Stub documentado (futuro)
│   │               └── registry.ts
│   │
│   ├── web/                          # Panel admin (Next.js App Router)
│   │   ├── Dockerfile                # Imagen web (output standalone en prod)
│   │   ├── next.config.js            # rewrites /api/* -> INTERNAL_API_URL; toggle NEXT_OUTPUT
│   │   ├── tailwind.config.ts        # Paleta Apple (ink/fog/graphite/azure/...)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx        # Layout raiz
│   │       │   ├── page.tsx          # Redireccion a /login o /dashboard
│   │       │   ├── login/page.tsx
│   │       │   └── dashboard/
│   │       │       ├── layout.tsx    # Guard de sesion + Sidebar
│   │       │       ├── page.tsx      # CENTRO OPERATIVO (dashboard principal)
│   │       │       ├── programas/page.tsx
│   │       │       ├── programas/[id]/page.tsx
│   │       │       ├── programas/[id]/propuesta/page.tsx
│   │       │       ├── semanas/page.tsx
│   │       │       ├── semanas/[id]/page.tsx (+ AssignmentForm, AssignmentReminders)
│   │       │       ├── automatizaciones/page.tsx
│   │       │       ├── importar/page.tsx
│   │       │       ├── publicadores/page.tsx
│   │       │       ├── plantillas/page.tsx
│   │       │       ├── historial/page.tsx
│   │       │       ├── whatsapp/page.tsx
│   │       │       └── configuracion/page.tsx
│   │       ├── components/           # UI reutilizable (Button, Card, Badge, ConfirmModal, Sidebar, ...)
│   │       └── lib/
│   │           └── api.ts            # fetch con Bearer + manejo de 401
│   │
│   ├── worker/                       # Cron de envio
│   │   └── src/
│   │       ├── index.ts              # node-cron + graceful shutdown
│   │       ├── jobs/process-reminders.ts   # Selecciona, reclama, valida, envia
│   │       └── services/
│   │           ├── template-renderer.ts    # Renderiza JwMessageTemplate
│   │           └── whatsapp-client.ts      # POST /send al servicio WhatsApp
│   │
│   └── whatsapp/                     # Sesion WhatsApp Web
│       └── src/
│           ├── index.ts              # Express :3010 (/health /status /send /restart ...)
│           ├── client/whatsapp.ts    # whatsapp-web.js + LocalAuth + estado + locks
│           └── services/message-sender.ts  # Validacion + envio
│
├── packages/
│   ├── database/                     # Prisma (esquema + migraciones + cliente)
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Fuente de verdad del modelo de datos
│   │   │   ├── migrations/           # 6 migraciones versionadas
│   │   │   └── seed.ts               # Admin inicial + plantillas + AppConfig
│   │   └── src/client.ts             # Singleton PrismaClient exportado
│   └── shared/                       # Codigo compartido sin dependencias de framework
│       └── src/
│           ├── enums/                # Enums de dominio
│           ├── constants/            # Constantes + mapas de etiquetas en espanol
│           ├── utils/                # renderTemplate, formatDateSpanish
│           └── validators/           # Validaciones compartidas
│
├── docs/                             # Documentacion (esta carpeta)
│   ├── SYSTEM-ARCHITECTURE-v1.md     # (este conjunto P4.6)
│   ├── DATABASE-ARCHITECTURE.md
│   ├── BACKEND-ARCHITECTURE.md
│   ├── FRONTEND-ARCHITECTURE.md
│   ├── WORKER-ARCHITECTURE.md
│   ├── WHATSAPP-ARCHITECTURE.md
│   ├── PROVIDERS-ARCHITECTURE.md
│   ├── PROJECT-TREE.md
│   ├── SCALABILITY.md
│   ├── TECHNICAL-DEBT.md
│   ├── AUTOMATION-MODEL-FIX.md       # Diseno del modelo de automatizaciones (P0)
│   ├── P4-JW-SOURCE-RESEARCH.md      # Investigacion de fuentes JW + decision Providers
│   ├── DEPLOY-DOKPLOY.md             # Deploy + fallback via API de Dokploy
│   ├── REPORTE-FINAL-JW-REMINDERS.md # Bitacora de fases (P0..P4.5)
│   ├── MASTER-PROJECT-DIRECTIVE.md   # Directiva maestra del proyecto
│   ├── DESIGN-SYSTEM-JW-REMINDERS.md
│   ├── WHATSAPP-SESSION.md
│   └── TESTING-CHECKLIST.md
│
├── scripts/                          # Utilidades shell (migrate, seed, backup, healthcheck, deploy)
├── docker-compose.yml                # Stack de produccion
├── docker-compose.local.yml          # Stack local
├── DESIGN.md                         # Guia de diseno (paleta, tipografia, tokens)
├── ARCHITECTURE.md / DEPLOY.md / RELEASE.md / CHANGELOG.md  # Gobierno raiz
├── PLAN-JW-REMINDERS.md / README.md
├── pnpm-workspace.yaml               # Workspaces + allowlist de builds nativos
└── tsconfig.json                     # TS base del monorepo
```

## Convenciones

- **Modulo** (`apps/api/src/modules/<dominio>`): expone `*.routes.ts` (capa HTTP) y, cuando hay logica compleja, `*.service.ts`. Algunos modulos solo tienen rutas porque delegan en `services/` transversales.
- **Service transversal** (`apps/api/src/services`): logica reutilizada por varios modulos (automatizaciones, propuestas, importacion, fechas). No conoce Express.
- **packages/**: codigo sin estado de framework. `database` es la unica fuente del modelo; `shared` no debe importar Prisma ni Express.
- **docs/**: toda decision arquitectonica y de fase queda documentada aqui.

## Donde mirar primero segun la tarea

| Necesito... | Ir a |
|---|---|
| Entender el modelo de datos | `packages/database/prisma/schema.prisma` + `DATABASE-ARCHITECTURE.md` |
| Tocar reglas de envio | `apps/worker/src/jobs/process-reminders.ts` + `WORKER-ARCHITECTURE.md` |
| Cambiar como se generan recordatorios | `apps/api/src/services/automation.service.ts` |
| Cambiar el algoritmo de propuestas | `apps/api/src/services/assignment-proposal.ts` |
| Agregar una fuente de programas | `apps/api/src/services/providers/` + `PROVIDERS-ARCHITECTURE.md` |
| Ajustar el dashboard | `apps/web/src/app/dashboard/page.tsx` + `operational-center.service.ts` |
| Sesion / QR de WhatsApp | `apps/whatsapp/src/client/whatsapp.ts` + `WHATSAPP-ARCHITECTURE.md` |
