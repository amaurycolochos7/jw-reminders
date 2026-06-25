# Implementation Plan: Operational Flow Guide

## Overview

This plan implements the operational flow guide feature for JW-REMINDERS, adding a guided workflow block, real-time metrics panel, completion status indicators, and prominent action buttons across the dashboard, semanas, and week detail pages. It also enhances the API, deploys to production, and documents the results.

## Tasks

- [x] 1. Create workflow SVG icons component (`apps/web/src/components/icons/workflow-icons.tsx`) with 8 named exports: PersonIcon, CalendarPlusIcon, ClipboardListIcon, BellAlertIcon, PhoneIcon, InboxIcon, CheckCircleIcon, CircleOutlineIcon. All Heroicons-style outline SVGs (strokeWidth 1.5, viewBox 0 0 24 24, fill none, stroke currentColor). CheckCircleIcon uses fill. Each accepts `className?: string`. No emoji. #requirement-1.4 #requirement-2.8 #requirement-5.6 #requirement-6.2
- [x] 2. Create WorkflowGuide component (`apps/web/src/components/WorkflowGuide.tsx`) rendering "Flujo de trabajo" heading with 6 Step Cards: (1) Registrar publicadores → /dashboard/publicadores, (2) Crear semana → /dashboard/semanas, (3) Agregar asignaciones → /dashboard/semanas, (4) Generar recordatorios → /dashboard/semanas, (5) Verificar WhatsApp → /dashboard/whatsapp, (6) Revisar historial → /dashboard/historial. Grid 3x2 on >=768px, vertical stack on <768px. Cards: bg-white rounded-card p-7, no box-shadow. Each link has aria-label. #requirement-1.1 #requirement-1.2 #requirement-1.3 #requirement-1.5 #requirement-1.6 #requirement-1.7
- [x] 3. Create MetricsPanel component (`apps/web/src/components/MetricsPanel.tsx`) with props: stats (publicadores, activeWeeks, asignacionesPendientes, pendingReminders, messagesSentToday) and whatsappStatus. Renders 6 cards in responsive grid: 2col <640px, 3col 640-1023px, 6col >=1024px. Each card has SVG icon, numeric value (text-3xl font-bold), label (text-sm text-graphite). WhatsApp shows colored dot: green connected, amber waiting_qr, red disconnected. Cards: bg-white rounded-card p-7, no shadow. #requirement-2.1 #requirement-2.7 #requirement-2.8 #requirement-2.9
- [x] 4. Create CompletionStatus component (`apps/web/src/components/CompletionStatus.tsx`) with props: hasAssignments, hasReminders, whatsappConnected. Renders 4 stages horizontally (flex gap-3 flex-wrap): "Semana creada" (always complete), "Asignaciones" (hasAssignments), "Recordatorios" (hasReminders), "WhatsApp" (whatsappConnected). Complete: CheckCircleIcon text-emerald-500 + label text-ink. Incomplete: CircleOutlineIcon text-silver-mist + label text-graphite. Labels 12px, icons 16x16. #requirement-5.1 #requirement-5.2 #requirement-5.3 #requirement-5.4 #requirement-5.5 #requirement-5.6 #requirement-5.7
- [x] 5. Enhance dashboard API (`apps/api/src/modules/dashboard/dashboard.routes.ts`) adding to Promise.all: activeWeeks (jwMeetingWeek count meetingDate >= today UTC), pendingReminders (jwAssignmentReminder count status=PENDING), messagesSentToday (jwMessageLog count status=SENT createdAt today UTC). Return new fields in stats object. Error catch returns 0 for all new fields. #requirement-7.1 #requirement-7.2 #requirement-7.3 #requirement-7.4 #requirement-7.5
- [x] 6. Enhance meeting-weeks API to include totalReminders field per week. Modify list endpoint to include nested assignment reminder counts. Compute totalReminders = sum of all reminder records across all assignments in each week. Return in response alongside existing _count.assignments. #requirement-5.3 #requirement-5.4
- [x] 7. Modify dashboard page (`apps/web/src/app/dashboard/page.tsx`): import WorkflowGuide and MetricsPanel, remove old 4-card stats grid, render WorkflowGuide below title then MetricsPanel below it. Add 30-second polling with setInterval and document.visibilityState check. Clear interval on unmount. Keep existing assignment and system status sections. Map new API fields to MetricsPanel props. #requirement-1.1 #requirement-2.1 #requirement-2.10 #requirement-2.11
- [x] 8. Modify semanas page (`apps/web/src/app/dashboard/semanas/page.tsx`): import CompletionStatus, fetch /api/whatsapp/status on mount, add "Nueva semana" button inside empty state card (styled bg-azure text-white rounded-pill), add CompletionStatus inside each week card between metadata and action buttons. Pass hasAssignments (from _count.assignments > 0), hasReminders (from totalReminders > 0), whatsappConnected (from status fetch). #requirement-3.1 #requirement-3.3 #requirement-3.4 #requirement-5.1
- [x] 9. Modify week detail page (`apps/web/src/app/dashboard/semanas/[id]/page.tsx`): add action bar between week info card and assignments section with 4 buttons. "Agregar asignacion" (primary: bg-azure text-white rounded-pill) opens AssignmentForm. "Generar recordatorios" (secondary: border silver-mist rounded-pill) bulk-generates for PENDING assignments, shows loading state, shows count notification or "no pending" message. "Ver recordatorios" (secondary) opens modal showing all week reminders. "Editar semana" (secondary) opens inline modal pre-populated with week data. Layout: flex-col on <640px, flex-row on >=640px. #requirement-4.1 #requirement-4.2 #requirement-4.3 #requirement-4.4 #requirement-4.5 #requirement-4.6 #requirement-4.7 #requirement-4.8 #requirement-4.9 #requirement-4.10
- [x] 10. Visual validation: review all new/modified files for DESIGN.md compliance. Verify zero emoji characters in UI text. All icons are SVG elements. All cards use rounded-card (28px), all buttons rounded-pill (999px). No shadow-* classes on cards. Colors only: ink, graphite, fog, white, azure, silver-mist, emerald-500, amber-400, red-400. Mobile-first responsive. Hover transitions use transition-opacity or transition-colors. #requirement-6.1 #requirement-6.2 #requirement-6.3 #requirement-6.4 #requirement-6.5 #requirement-6.6 #requirement-6.7 #requirement-6.8
- [x] 11. Local testing: run typecheck (pnpm typecheck or tsc --noEmit) with 0 errors. Run build (pnpm build) for both apps/api and apps/web without errors. Verify dashboard loads with WorkflowGuide and MetricsPanel. Verify metrics show real data not hardcoded. Verify all step links navigate correctly. Verify semanas buttons work. Verify week detail action bar functions. No console errors. No 404 errors.
- [x] 12. Deploy: commit all changes with message "feat: add operational flow guide with workflow steps, metrics panel, and completion status". Push to branch. Trigger redeploy on Dokploy. Wait for build to complete. Verify application accessible at production URL.
- [x] 13. Production testing: verify dashboard shows "Flujo de trabajo" with 6 steps and SVG icons. Verify metrics not hardcoded (values reflect real data). Verify step 1 Publicadores link navigates without 404. Verify "Nueva semana" button visible and functional. Verify "Agregar asignacion" button opens form. Verify "Generar recordatorios" creates reminders. Verify no 404 errors on any navigation. Verify no emoji in any UI element. Verify responsive layout on mobile.
- [x] 14. Update final report: create or update docs/REPORTE-FINAL-JW-REMINDERS.md with feature name, implementation date, files created (4 components), files modified (3 pages + 2 API routes), commits (hash + message), tests performed (local + production E2E), errors encountered and resolved, production URL verification.

## Task Dependency Graph

```json
{
  "waves": [
    {"tasks": [1, 5, 6]},
    {"tasks": [2, 3, 4]},
    {"tasks": [7, 8, 9]},
    {"tasks": [10]},
    {"tasks": [11]},
    {"tasks": [12]},
    {"tasks": [13]},
    {"tasks": [14]}
  ]
}
```

## Notes

- Tasks 1-4 can be developed in parallel (all are new independent components)
- Tasks 5-6 can be developed in parallel (both are API modifications)
- Tasks 7-9 depend on both the components (Tasks 1-4) and the API changes (Tasks 5-6)
- Task 10 is a review gate before testing
- Tasks 11-14 are sequential: local test → deploy → production test → report
- Do NOT mark as complete until production E2E verification passes (Task 13)
- The Dokploy API key for deployment is provided by the user
