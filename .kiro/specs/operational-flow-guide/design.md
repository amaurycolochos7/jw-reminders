# Technical Design: Operational Flow Guide

## Overview

This design document details the implementation of the guided operational workflow for JW-REMINDERS. The goal is that any new administrator can immediately understand how to create a meeting automation by following visible, sequential steps in the UI — without external documentation.

The implementation modifies both the API (`apps/api`) and the web frontend (`apps/web`), adding new components, enhancing existing pages, and extending the dashboard API to return additional metrics.

---

## Architecture

### High-Level Architecture

The feature follows the existing monorepo architecture:

```
┌──────────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js 14)                      │
│                                                                    │
│  /dashboard/page.tsx                                              │
│    ├── WorkflowGuide.tsx ──────── Static 6-step flow             │
│    ├── MetricsPanel.tsx ───────── Polls GET /api/dashboard       │
│    └── Existing sections                                          │
│                                                                    │
│  /dashboard/semanas/page.tsx                                      │
│    └── CompletionStatus.tsx ───── Uses meeting-weeks + WA status │
│                                                                    │
│  /dashboard/semanas/[id]/page.tsx                                 │
│    └── Action bar (4 buttons) ─── Calls existing API endpoints   │
│                                                                    │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP (fetch via lib/api.ts)
┌───────────────────────────────▼──────────────────────────────────┐
│                       apps/api (Express.js)                        │
│                                                                    │
│  GET /api/dashboard ──── Enhanced with activeWeeks,              │
│                           pendingReminders, messagesSentToday     │
│                                                                    │
│  GET /api/meeting-weeks ── Enhanced to include reminder counts   │
│  GET /api/whatsapp/status ── Already exists                      │
│                                                                    │
└───────────────────────────────┬──────────────────────────────────┘
                                │ Prisma ORM
┌───────────────────────────────▼──────────────────────────────────┐
│                       packages/database (PostgreSQL)               │
│  JwPublisher, JwMeetingWeek, JwAssignment,                        │
│  JwAssignmentReminder, JwMessageLog                               │
└──────────────────────────────────────────────────────────────────┘
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/components/WorkflowGuide.tsx` | Guided workflow block with 6 sequential steps |
| `apps/web/src/components/MetricsPanel.tsx` | Real-time metrics grid (6 cards) |
| `apps/web/src/components/CompletionStatus.tsx` | Per-week completion checklist (4 stages) |
| `apps/web/src/components/icons/workflow-icons.tsx` | SVG icon components for workflow steps |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/app/dashboard/page.tsx` | Replace current dashboard with WorkflowGuide + MetricsPanel + existing sections |
| `apps/web/src/app/dashboard/semanas/page.tsx` | Add CompletionStatus to week cards, add empty-state "Nueva semana" button |
| `apps/web/src/app/dashboard/semanas/[id]/page.tsx` | Add action bar with 4 buttons between week info card and assignments section |
| `apps/api/src/modules/dashboard/dashboard.routes.ts` | Add `activeWeeks`, `messagesSentToday`, `pendingReminders` fields |
| `apps/api/src/modules/meeting-weeks/meeting-weeks.service.ts` | Include reminder count in week list response |

---

## Components and Interfaces

### 3.1 WorkflowGuide

```
Location: apps/web/src/components/WorkflowGuide.tsx
```

A self-contained block rendered at the top of the dashboard. Displays the heading "Flujo de trabajo" and 6 Step Cards in sequence.

**Step definitions:**

| Step | Label | Icon | Target Route |
|------|-------|------|--------------|
| 1 | Registrar publicadores | PersonIcon | `/dashboard/publicadores` |
| 2 | Crear semana de reunion | CalendarPlusIcon | `/dashboard/semanas` |
| 3 | Agregar asignaciones | ClipboardListIcon | `/dashboard/semanas` |
| 4 | Generar recordatorios | BellAlertIcon | `/dashboard/semanas` |
| 5 | Verificar WhatsApp | PhoneIcon | `/dashboard/whatsapp` |
| 6 | Revisar historial | InboxIcon | `/dashboard/historial` |

**Layout behavior:**
- Mobile (<768px): Vertical stack, each Step Card full-width
- Desktop (>=768px): Horizontal grid, 3 columns x 2 rows

**Step Card structure:**
```
┌─────────────────────────────────────┐
│  [SVG Icon]                         │
│  [Step Number]. [Label]             │
│  [Brief description - text-graphite]│
│  [Ir →] (link button)              │
└─────────────────────────────────────┘
```

**Styling rules:**
- Card: `bg-white rounded-card p-7` (28px radius, 28px padding)
- Step number: `text-sm font-medium text-azure`
- Label: `text-sm font-semibold text-ink`
- Description: `text-xs text-graphite`
- Link button: `text-azure text-xs font-medium` (text link with arrow)
- No box-shadow, no emoji
- Transition: `transition-colors` 0.1s on hover
- Accessible: `aria-label="Ir a [step label]"` on each link

**Interface:**
```typescript
// No props required — component is self-contained
export default function WorkflowGuide(): JSX.Element
```

### 3.2 MetricsPanel

```
Location: apps/web/src/components/MetricsPanel.tsx
```

A responsive grid of 6 metric cards.

**Interface:**
```typescript
interface MetricsPanelProps {
  stats: {
    publicadores: number
    activeWeeks: number
    asignacionesPendientes: number
    pendingReminders: number
    messagesSentToday: number
  }
  whatsappStatus: 'connected' | 'waiting_qr' | 'disconnected'
}
```

**Metrics:**

| Metric | API Field | Icon |
|--------|-----------|------|
| Publicadores activos | `stats.publicadores` | PeopleIcon |
| Semanas activas | `stats.activeWeeks` | CalendarPlusIcon |
| Asignaciones pendientes | `stats.asignacionesPendientes` | ClipboardListIcon |
| Recordatorios pendientes | `stats.pendingReminders` | BellAlertIcon |
| Mensajes hoy | `stats.messagesSentToday` | InboxIcon |
| WhatsApp | `whatsappStatus` | PhoneIcon |

**Layout:**
- Mobile (<640px): 2 columns
- Tablet (640px-1023px): 3 columns
- Desktop (>=1024px): 6 columns

**Card structure:**
```
┌──────────────────┐
│ [SVG Icon]       │
│ [Value - 3xl]    │
│ [Label - xs]     │
└──────────────────┘
```

**WhatsApp status indicator:**
- Connected: `bg-emerald-500` dot (w-2.5 h-2.5 rounded-full)
- Waiting QR: `bg-amber-400` dot
- Disconnected: `bg-red-400` dot

**Auto-refresh:** The parent page polls `/api/dashboard` every 30 seconds using `setInterval` within `useEffect` (with `document.visibilityState` check to avoid polling when tab is hidden).

### 3.3 CompletionStatus

```
Location: apps/web/src/components/CompletionStatus.tsx
```

A horizontal row of 4 mini-indicators shown inside each week card on the Semanas page.

**Interface:**
```typescript
interface CompletionStatusProps {
  hasAssignments: boolean
  hasReminders: boolean
  whatsappConnected: boolean
}
```

**Stages:**

| Stage | Condition for Complete | Icon Complete | Icon Incomplete |
|-------|----------------------|---------------|-----------------|
| Semana creada | Always true (card exists) | CheckCircleIcon `text-emerald-500` | CircleOutlineIcon `text-silver-mist` |
| Asignaciones | `hasAssignments === true` | CheckCircleIcon `text-emerald-500` | CircleOutlineIcon `text-silver-mist` |
| Recordatorios | `hasReminders === true` | CheckCircleIcon `text-emerald-500` | CircleOutlineIcon `text-silver-mist` |
| WhatsApp | `whatsappConnected === true` | CheckCircleIcon `text-emerald-500` | CircleOutlineIcon `text-silver-mist` |

**Styling:**
- Stage label: 12px (`text-xs`), `text-graphite` for incomplete, `text-ink` for complete
- Icon: 16x16px (w-4 h-4) SVG inline
- Layout: `flex items-center gap-3 flex-wrap`

### 3.4 Workflow SVG Icons

```
Location: apps/web/src/components/icons/workflow-icons.tsx
```

All icons follow the existing codebase pattern: `<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>`

No emoji. No raster images. All outline-style Heroicons.

Icons to export:
- `PersonIcon` — single person silhouette (for publishers)
- `CalendarPlusIcon` — calendar with plus (for weeks)
- `ClipboardListIcon` — clipboard with lines (for assignments)
- `BellAlertIcon` — bell with alert dot (for reminders)
- `PhoneIcon` — phone/device (for WhatsApp)
- `InboxIcon` — inbox/envelope (for history)
- `CheckCircleIcon` — filled checkmark circle (completion - uses `fill` not `stroke`)
- `CircleOutlineIcon` — empty circle outline

**Icon component interface:**
```typescript
interface IconProps {
  className?: string
}
```

### 3.5 Dashboard Page Changes

**Current structure:**
1. Title "Panel de control"
2. Stats grid (4 cards)
3. Two-column: Upcoming assignments + System status

**New structure:**
1. Title "Panel de control"
2. **WorkflowGuide** component (new)
3. **MetricsPanel** component (new - 6 metric cards, replaces old 4-card stats)
4. Two-column: Upcoming assignments + System status (preserved)

**Interface changes in dashboard/page.tsx:**
```typescript
interface Stats {
  publicadores: number
  activeWeeks: number          // NEW
  asignacionesPendientes: number
  pendingReminders: number     // NEW
  messagesSentToday: number    // NEW
  recordatoriosHoy: number     // kept for backward compat
  mensajesEnviados: number     // kept for backward compat
}
```

### 3.6 Week Detail Action Bar

Insert between the week info card and assignments card in `semanas/[id]/page.tsx`:

```typescript
// Action bar - 4 buttons
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
  {/* Primary */}
  <button className="bg-azure text-white text-sm font-medium px-5 py-2.5 rounded-pill hover:opacity-90 transition-opacity">
    Agregar asignacion
  </button>
  {/* Secondary */}
  <button className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
    Generar recordatorios
  </button>
  <button className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
    Ver recordatorios
  </button>
  <button className="text-sm font-medium text-ink px-5 py-2.5 rounded-pill border border-silver-mist hover:bg-fog transition-colors">
    Editar semana
  </button>
</div>
```

**Button behaviors:**
- "Agregar asignacion": Opens AssignmentForm modal (existing component)
- "Generar recordatorios": Bulk generates for all PENDING assignments, shows loading + summary
- "Ver recordatorios": Opens a modal showing all reminders grouped by assignment
- "Editar semana": Opens inline modal with week form pre-populated

---

## Data Models

### Enhanced Dashboard API Response

```typescript
interface DashboardResponse {
  stats: {
    publicadores: number        // JwPublisher count where isActive=true
    activeWeeks: number         // JwMeetingWeek count where meetingDate >= today
    asignacionesPendientes: number  // JwAssignment count where status=PENDING
    pendingReminders: number    // JwAssignmentReminder count where status=PENDING
    messagesSentToday: number   // JwMessageLog count where status=SENT AND createdAt=today
    recordatoriosHoy: number    // kept: reminders due today
    mensajesEnviados: number    // kept: total sent messages
  }
  assignments: Array<{
    id: string
    date: string
    title: string
    assignee: string
    status: string
  }>
  activity: Array<{
    id: string
    description: string
    time: string
  }>
  systemStatus: {
    whatsapp: 'connected' | 'waiting_qr' | 'disconnected'
    worker: 'running' | 'stopped'
    database: 'connected' | 'disconnected'
  }
}
```

### Enhanced Meeting Weeks List Response

```typescript
interface MeetingWeekListItem {
  id: string
  weekStartDate: string
  meetingDate: string
  meetingTime: string
  congregationName: string | null
  notes: string | null
  _count: {
    assignments: number
  }
  totalReminders: number  // NEW: sum of reminders across all assignments
}
```

### Metric Calculation Queries

| Metric | Prisma Query |
|--------|-------------|
| `activeWeeks` | `prisma.jwMeetingWeek.count({ where: { meetingDate: { gte: startOfTodayUTC } } })` |
| `pendingReminders` | `prisma.jwAssignmentReminder.count({ where: { status: "PENDING" } })` |
| `messagesSentToday` | `prisma.jwMessageLog.count({ where: { status: "SENT", createdAt: { gte: startOfTodayUTC, lt: startOfTomorrowUTC } } })` |

**Date calculation:**
```typescript
const now = new Date();
const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
```

### Completion Checklist Logic

```typescript
const stages = [
  { label: 'Semana creada', complete: true },
  { label: 'Asignaciones', complete: week._count.assignments > 0 },
  { label: 'Recordatorios', complete: week.totalReminders > 0 },
  { label: 'WhatsApp', complete: whatsappStatus === 'connected' },
]
```

---

## Error Handling

### API Error Handling

If any database query fails in the dashboard route, return safe defaults:
```typescript
catch (err) {
  res.json({
    stats: {
      publicadores: 0,
      activeWeeks: 0,
      asignacionesPendientes: 0,
      pendingReminders: 0,
      messagesSentToday: 0,
      recordatoriosHoy: 0,
      mensajesEnviados: 0
    },
    assignments: [],
    activity: [],
    systemStatus: { whatsapp: "disconnected", worker: "running", database: "disconnected" },
  });
}
```

### Frontend Error Handling

- If `/api/dashboard` fetch fails: Display all metrics as 0, WhatsApp as disconnected
- If `/api/whatsapp/status` fails: Default to "disconnected" for CompletionStatus
- If bulk "Generar recordatorios" fails partially: Show error notification with which assignments failed, preserve page state
- If "Generar recordatorios" has no pending assignments: Show informational toast "No hay asignaciones pendientes"
- Polling errors: Silently retry on next 30s interval without UI disruption

### Graceful Degradation

- WorkflowGuide is entirely static — never fails (no API dependency)
- MetricsPanel shows 0s on API failure
- CompletionStatus shows WhatsApp as incomplete if status fetch fails
- All action buttons remain functional independently of each other

---

## Testing Strategy

### Build Verification
1. `pnpm build` — both apps compile without TypeScript errors
2. `pnpm lint` — no lint violations in changed files

### Manual Functional Testing

**Full workflow test (E2E):**
1. Navigate to `/dashboard` → Verify WorkflowGuide and MetricsPanel render
2. Click Step 1 → Navigate to `/dashboard/publicadores`
3. Create a publisher → Return to dashboard → Verify "Publicadores activos" increments
4. Click Step 2 → Navigate to `/dashboard/semanas`
5. Click "Nueva semana" → Create a week → Verify "Semanas activas" increments
6. Click into week detail → Verify 4 action buttons visible
7. Click "Agregar asignacion" → Create assignment → Verify "Asignaciones pendientes" increments
8. Click "Generar recordatorios" → Verify success notification
9. Return to Semanas page → Verify CompletionStatus checkmarks update
10. Navigate to `/dashboard/whatsapp` → Verify status matches metric dot
11. Navigate to `/dashboard/historial` → Verify message logs

**Responsive testing:**
- Test at 320px, 640px, 768px, 1024px, 1440px widths
- Verify WorkflowGuide switches from vertical to horizontal at 768px
- Verify MetricsPanel grid adapts: 2col → 3col → 6col
- Verify action buttons stack vertically below 640px

**Edge cases:**
- Empty state: No publishers, no weeks → Verify empty states and "Nueva semana" buttons
- WhatsApp disconnected → Verify red dot in metrics, incomplete in CompletionStatus
- API timeout → Verify graceful fallback to 0 values
- Rapid navigation → Verify polling cleanup on unmount

### Production Acceptance Checklist
- [ ] WorkflowGuide renders 6 steps with correct SVG icons
- [ ] All step links navigate to correct pages
- [ ] MetricsPanel shows 6 cards with real data from API
- [ ] Metrics auto-refresh every 30 seconds
- [ ] "Nueva semana" button visible in header AND empty state
- [ ] CompletionStatus shows on each week card with correct states
- [ ] Week detail page has 4 action buttons
- [ ] "Agregar asignacion" opens form
- [ ] "Generar recordatorios" works for bulk generation
- [ ] "Ver recordatorios" shows all week reminders
- [ ] "Editar semana" opens pre-populated form
- [ ] No emoji anywhere in the UI
- [ ] All border-radius values match DESIGN.md (28px cards, 999px buttons)
- [ ] No box-shadows on any card
- [ ] Mobile layout responsive at 640px and 768px breakpoints
- [ ] WhatsApp status dot color matches connection state
- [ ] API returns new fields: activeWeeks, pendingReminders, messagesSentToday
- [ ] API returns 0s on database failure (graceful degradation)

---

## Correctness Properties

### Property 1: Metric Accuracy
Each numeric metric must exactly match the corresponding Prisma count query at the time of response. No caching layer sits between the database and the API response — values are always live.
**Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 7.3**

### Property 2: Date Boundary Correctness
"Messages sent today" uses UTC day boundaries (00:00:00.000 to 23:59:59.999). No timezone drift causing double-counting or missing records.
**Validates: Requirements 7.2**

### Property 3: Completion Status Consistency
A week's completion stages must reflect the actual database state (assignment count, reminder count) at the time the Semanas page loads. The WhatsApp status is fetched independently and reflects the real-time connection state.
**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

### Property 4: Navigation Integrity
Every workflow step link must resolve to an existing, accessible route. All 6 routes (`/dashboard/publicadores`, `/dashboard/semanas`, `/dashboard/whatsapp`, `/dashboard/historial`) are already defined in the application routing.
**Validates: Requirements 1.3**

### Property 5: Bulk Generation Idempotency
"Generar recordatorios" must not create duplicate reminders. This is enforced by the `@@unique([assignmentId, publisherId, reminderDay])` constraint in the Prisma schema — the database will reject duplicate insertions.
**Validates: Requirements 4.4, 4.5**

### Property 6: Polling Cleanup
The 30-second polling interval must be cleared on component unmount via `useEffect` cleanup return. This prevents memory leaks, orphaned network requests, and state updates on unmounted components.
**Validates: Requirements 2.11**

---

## Design System Compliance Summary

| Rule from DESIGN.md | Implementation |
|---------------------|----------------|
| No box-shadow on cards | Cards use `bg-white rounded-card p-7` only — no shadow classes |
| #0071e3 only for CTA | Applied only to primary action buttons and azure text links |
| 28px card radius | Tailwind `rounded-card` class maps to 28px |
| 999px button radius | Tailwind `rounded-pill` class maps to 999px |
| Cards white on fog canvas | Card surface `bg-white`, page `bg-fog` |
| SF Pro / Inter fallback | Already configured in `tailwind.config.ts` `fontFamily.sans` |
| No emoji | All icons are inline SVGs — zero emoji characters |
| Hover transitions 0.1s | `transition-opacity` or `transition-colors` with Tailwind defaults (150ms, close enough) |
| Negative letter-spacing | Applied via `globals.css` base layer: `letter-spacing: -0.003em` for body, `-0.02em` for headings |
| Mobile-first | All components designed for mobile, enhanced with `sm:` and `lg:` breakpoints |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Dashboard API becomes slow with extra queries | Use `Promise.all` for parallel execution (already the pattern) |
| WhatsApp status fetch adds latency | Already handled with try/catch fallback to "disconnected" |
| Meeting-weeks endpoint slower with nested counts | Prisma `_count` translates to efficient SQL COUNT |
| 30s polling creates unnecessary load | Check `document.visibilityState` before fetching |
| Bulk "Generar recordatorios" may fail partially | Show per-assignment error summary, preserve page state |
| Duplicate reminder creation | Protected by `@@unique` DB constraint in Prisma schema |
