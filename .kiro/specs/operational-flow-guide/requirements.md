# Requirements Document

## Introduction

This feature introduces an operational flow guide into the JW-REMINDERS dashboard that enables new administrators to understand and follow the complete meeting automation workflow without external documentation. The guide presents a step-by-step process with direct navigation links, real-time metrics, visual completion status per week, and prominent action buttons throughout the semanas (weeks) pages. All UI elements follow the Apple-style design system defined in DESIGN.md, use SVG icons exclusively, and adopt a mobile-first responsive approach with JW-style branding.

## Glossary

- **Dashboard**: The main control panel page located at `/dashboard` that displays system metrics, workflow guidance, and status information
- **Workflow_Guide**: A visual block component in the Dashboard that displays the sequential operational steps required to create a meeting automation
- **Step_Card**: An individual step within the Workflow_Guide that shows the step number, label, brief description, and a direct navigation link
- **Metrics_Panel**: A section of the Dashboard displaying real-time counts of active publishers, active weeks, pending assignments, pending reminders, messages sent today, and WhatsApp connection status
- **Completion_Status**: A visual indicator within each week card showing the progress of that week through the operational workflow stages
- **Week_Detail_Page**: The page at `/dashboard/semanas/[id]` showing full information and actions for a specific meeting week
- **Semanas_Page**: The page at `/dashboard/semanas` listing all meeting weeks
- **Publisher**: A congregation member registered in the system who can receive meeting assignments
- **Assignment**: A specific meeting task assigned to a publisher for a given week
- **Reminder**: An automated WhatsApp message scheduled to notify a publisher about an upcoming assignment
- **SVG_Icon**: A scalable vector graphic icon rendered inline, used instead of emoji or raster icons throughout the interface

## Requirements

### Requirement 1: Guided Workflow Block in Dashboard

**User Story:** As a new administrator, I want to see a clear step-by-step operational flow in the dashboard, so that I can understand the complete meeting automation process without external documentation.

#### Acceptance Criteria

1. WHEN the Dashboard loads, THE Workflow_Guide SHALL display a titled block with the heading "Flujo de trabajo" containing exactly six sequential steps: (1) Registrar publicadores, (2) Crear semana de reunion, (3) Agregar asignaciones, (4) Generar recordatorios, (5) Verificar conexion WhatsApp, (6) Revisar historial de mensajes
2. THE Workflow_Guide SHALL render each step as a Step_Card containing a numeric indicator (1–6), the step's descriptive label as defined in criterion 1, and a navigation button labeled with actionable text (e.g., "Ir" or "Ver") that links to the corresponding application page
3. WHEN the user activates a Step_Card navigation button, THE Dashboard SHALL navigate to the target page: step 1 to `/dashboard/publicadores`, step 2 to `/dashboard/semanas`, step 3 to `/dashboard/semanas`, step 4 to `/dashboard/semanas`, step 5 to `/dashboard/whatsapp`, step 6 to `/dashboard/historial`
4. THE Workflow_Guide SHALL render each Step_Card with a distinct SVG icon per step, where each icon depicts the primary object of the step action (e.g., a person icon for "Registrar publicadores", a calendar icon for "Crear semana de reunion")
5. THE Workflow_Guide SHALL use a horizontal layout on viewports 768px wide or wider and a vertical stacked layout on viewports narrower than 768px
6. THE Workflow_Guide SHALL use only colors, border-radius values, and typography defined in DESIGN.md (card background `#ffffff`, text `#1d1d1f`, secondary text `#707070`, card radius 28px, CTA color `#0071e3`)
7. THE Workflow_Guide SHALL ensure each Step_Card navigation button is accessible via keyboard focus and includes an accessible label that identifies the target page (e.g., aria-label "Ir a Registrar publicadores")

### Requirement 2: Dashboard Real-Time Metrics

**User Story:** As an administrator, I want to see real-time operational metrics on the dashboard, so that I can monitor the current status of the meeting automation system at a glance.

#### Acceptance Criteria

1. WHEN the Dashboard page loads, THE Metrics_Panel SHALL display the following six metrics: active publishers count, active weeks count, pending assignments count, pending reminders count, messages sent today count, and WhatsApp connection status
2. WHEN the API returns the dashboard data, THE Metrics_Panel SHALL render the active publishers count as the number of publishers with `isActive` equal to true
3. WHEN the API returns the dashboard data, THE Metrics_Panel SHALL render the active weeks count as the number of meeting weeks with a `meetingDate` equal to or later than the current date
4. WHEN the API returns the dashboard data, THE Metrics_Panel SHALL render the pending assignments count as the number of assignments with status `PENDING`
5. WHEN the API returns the dashboard data, THE Metrics_Panel SHALL render the pending reminders count as the number of reminders with status `PENDING`
6. WHEN the API returns the dashboard data, THE Metrics_Panel SHALL render the messages sent today count as the number of message logs with status `SENT` and `createdAt` within the current calendar day using the server's configured timezone
7. WHEN the API returns the WhatsApp status, THE Metrics_Panel SHALL display a connection indicator using a colored dot: green for connected, amber for waiting QR, and red for disconnected
8. THE Metrics_Panel SHALL render each metric inside a card component containing an SVG icon, a numeric value, and a descriptive label
9. THE Metrics_Panel SHALL use a responsive grid layout: 2 columns on viewports below 640px, 3 columns on viewports between 640px and 1023px, and 6 columns on viewports 1024px and above
10. IF the dashboard API request fails or returns a non-success response, THEN THE Metrics_Panel SHALL display all numeric metric values as 0 and the WhatsApp status as disconnected
11. WHILE the Dashboard page is active, THE Metrics_Panel SHALL automatically refresh metrics data by polling the API every 30 seconds

### Requirement 3: Prominent "Nueva semana" Button on Semanas Page

**User Story:** As an administrator, I want a clearly visible button to create a new meeting week, so that I can quickly initiate the week creation process without searching the interface.

#### Acceptance Criteria

1. WHEN the Semanas_Page loads, THE Semanas_Page SHALL display a "Nueva semana" button in the page header area, positioned to the right of the page title within the same flex row
2. THE Semanas_Page SHALL style the "Nueva semana" button as a primary CTA with background `#0071e3`, text `#ffffff`, border-radius 999px, font weight 500, and horizontal padding of at least 16px
3. IF no meeting weeks exist, THEN THE Semanas_Page SHALL display an additional "Nueva semana" button within the empty state area, styled identically to the header button
4. WHEN the user activates any "Nueva semana" button (header or empty state), THE Semanas_Page SHALL open the week creation form in a modal dialog overlaying the current page
5. IF the week creation modal is open, THEN THE Semanas_Page SHALL display the modal title as "Nueva semana" to distinguish it from the edit form

### Requirement 4: Week Detail Page Action Buttons

**User Story:** As an administrator, I want clearly visible action buttons on each week's detail page, so that I can quickly perform common operations without searching for actions.

#### Acceptance Criteria

1. WHEN the Week_Detail_Page loads successfully with week data, THE Week_Detail_Page SHALL display an action bar containing exactly four buttons labeled "Agregar asignacion", "Generar recordatorios", "Ver recordatorios", and "Editar semana", positioned between the week info card and the assignments section.
2. THE Week_Detail_Page SHALL style the "Agregar asignacion" button as a primary action with a visually distinct filled background and the remaining three buttons as secondary actions with a transparent background and a visible border.
3. WHEN the user activates the "Agregar asignacion" button, THE Week_Detail_Page SHALL open the assignment creation form as a modal dialog with all fields empty.
4. WHEN the user activates the "Generar recordatorios" button, THE Week_Detail_Page SHALL send a reminder generation request for each assignment in the current week that has status "PENDING" and display a summary notification indicating how many reminders were created.
5. IF the current week has no assignments with status "PENDING" when the user activates the "Generar recordatorios" button, THEN THE Week_Detail_Page SHALL display a notification indicating that there are no pending assignments to generate reminders for, and SHALL NOT send any generation requests.
6. WHEN the user activates the "Ver recordatorios" button, THE Week_Detail_Page SHALL display a view listing all reminders associated with assignments in the current week, grouped or identified by assignment.
7. WHEN the user activates the "Editar semana" button, THE Week_Detail_Page SHALL open the week editing form pre-populated with the current week's weekStartDate, meetingDate, meetingTime, congregationName, and notes values.
8. THE Week_Detail_Page SHALL arrange the four action buttons in a single horizontal row on viewports 640px wide or greater, and SHALL stack them vertically in a single column on viewports narrower than 640px.
9. WHILE the "Generar recordatorios" operation is in progress, THE Week_Detail_Page SHALL disable the "Generar recordatorios" button and display a loading indicator within or adjacent to the button until all requests complete or fail.
10. IF any reminder generation request fails during the "Generar recordatorios" operation, THEN THE Week_Detail_Page SHALL display an error notification indicating which assignments failed, and SHALL preserve the current page state without navigating away.

### Requirement 5: Visual Completion Status per Week

**User Story:** As an administrator, I want to see a visual completion checklist for each week, so that I can quickly identify which operational steps have been completed and which are pending.

#### Acceptance Criteria

1. WHEN the Semanas_Page renders a week card, THE Semanas_Page SHALL display a Completion_Status indicator showing four stages: "Semana creada", "Asignaciones creadas", "Recordatorios generados", and "WhatsApp listo"
2. THE Completion_Status SHALL mark "Semana creada" as complete (checkmark icon) for all displayed week cards since their existence confirms creation
3. WHEN a week has one or more assignments, THE Completion_Status SHALL mark "Asignaciones creadas" as complete
4. WHEN a week has one or more reminders generated for any assignment, THE Completion_Status SHALL mark "Recordatorios generados" as complete
5. WHEN the WhatsApp service status is "connected", THE Completion_Status SHALL mark "WhatsApp listo" as complete
6. THE Completion_Status SHALL display incomplete stages using a circle outline icon (16x16px) in `#e8e8ed` color and complete stages using a checkmark icon (16x16px) in `#10b981` color
7. THE Completion_Status SHALL render stage labels using DESIGN.md caption typography (12px, color `#707070` for incomplete, `#1d1d1f` for complete)
8. THE Completion_Status SHALL arrange the four stages in a horizontal row within the week card on all viewport sizes, wrapping to a second row if the card width is less than 280px

### Requirement 6: Design System Compliance

**User Story:** As an administrator, I want the interface to follow a consistent Apple-style aesthetic with JW branding, so that the application feels professional and cohesive.

#### Acceptance Criteria

1. THE Dashboard SHALL use only the color tokens defined in DESIGN.md for all UI elements (backgrounds, text, borders, and interactive elements)
2. THE Dashboard SHALL use SVG_Icon elements for all iconography and exclude emoji characters from all visible interface text
3. THE Dashboard SHALL apply the border-radius values defined in DESIGN.md: 28px for cards and feature links, 999px for primary buttons and pill buttons, 980px for nav items, 36px for rounded buttons, and 10px for small buttons
4. THE Dashboard SHALL render all text using the SF Pro font family stack defined in DESIGN.md (`'SF Pro Display'` for headings, `'SF Pro Text'` for body) with the fallback sequence `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
5. THE Dashboard SHALL implement a mobile-first responsive layout where components are designed for viewports below 768px and progressively enhanced at breakpoints of 768px (tablet) and 1024px (desktop), with a maximum content width of 1200px centered on the canvas
6. THE Dashboard SHALL apply zero box-shadow to all card elements, expressing elevation through background color contrast only (cards `#ffffff` on canvas `#f5f5f7`)
7. THE Dashboard SHALL use the motion system defined in DESIGN.md for hover state transitions (0.1s duration, ease timing function) and component reveals (0.344s duration, ease timing function)
8. THE Dashboard SHALL apply the letter-spacing values defined in the DESIGN.md type scale for each text size (ranging from -2.11px at 96px display to -0.04px at 14px body-sm)

### Requirement 7: Dashboard API Enhancements

**User Story:** As the web application, I want the dashboard API to return all necessary metrics including active weeks and messages sent today, so that the Metrics_Panel can display accurate real-time data.

#### Acceptance Criteria

1. WHEN the Dashboard API endpoint receives a GET request, THE API SHALL return an `activeWeeks` field containing the count of `JwMeetingWeek` records whose `meetingDate` is on or after the start of the current UTC calendar day (00:00:00 UTC)
2. WHEN the Dashboard API endpoint receives a GET request, THE API SHALL return a `messagesSentToday` field containing the count of `JwMessageLog` records with status `SENT` and `createdAt` between the start (00:00:00 UTC) and end (23:59:59.999 UTC) of the current UTC calendar day
3. WHEN the Dashboard API endpoint receives a GET request, THE API SHALL return a `pendingReminders` field containing the count of `JwAssignmentReminder` records with status `PENDING`
4. IF the database connection fails during metric retrieval, THEN THE API SHALL return a JSON response with `0` for `activeWeeks`, `messagesSentToday`, and `pendingReminders`, and `"disconnected"` for the WhatsApp status field, with HTTP status code 200
5. WHEN the Dashboard API endpoint receives a GET request, THE API SHALL return the response within 2 seconds under normal database connectivity conditions
