-- P0 automation model: monthly schedules, automation plans, reminder deliveries,
-- immutable automation events, and safer state machines.

-- New enums
CREATE TYPE "MonthlyScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'CANCELLED');
CREATE TYPE "MeetingWeekStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'CANCELLED');
CREATE TYPE "AutomationPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "ReminderRecipientRole" AS ENUM ('ASSIGNED', 'COMPANION');

-- AssignmentStatus state machine replacement.
ALTER TYPE "AssignmentStatus" RENAME TO "AssignmentStatus_old";
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "JwAssignment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "JwAssignment"
  ALTER COLUMN "status" TYPE "AssignmentStatus"
  USING (
    CASE
      WHEN "status"::text IN ('PENDING', 'NOTIFIED') THEN 'SCHEDULED'
      WHEN "status"::text = 'COMPLETED' THEN 'COMPLETED'
      WHEN "status"::text = 'CANCELLED' THEN 'CANCELLED'
      ELSE 'DRAFT'
    END
  )::"AssignmentStatus";
ALTER TABLE "JwAssignment" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "AssignmentStatus_old";

-- ReminderStatus extended state machine.
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'DEAD';

-- Monthly schedules.
CREATE TABLE "MonthlySchedule" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" "MonthlyScheduleStatus" NOT NULL DEFAULT 'DRAFT',
  "archivedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlySchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlySchedule_year_month_key" ON "MonthlySchedule"("year", "month");

-- Meeting week state and monthly schedule link.
ALTER TABLE "JwMeetingWeek"
  ADD COLUMN "monthlyScheduleId" TEXT,
  ADD COLUMN "weekStartDateLocal" TEXT,
  ADD COLUMN "meetingDateLocal" TEXT,
  ADD COLUMN "status" "MeetingWeekStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "JwMeetingWeek"
SET
  "weekStartDateLocal" = to_char("weekStartDate", 'YYYY-MM-DD'),
  "meetingDateLocal" = to_char("meetingDate", 'YYYY-MM-DD'),
  "status" = CASE
    WHEN "meetingDate" < CURRENT_TIMESTAMP THEN 'COMPLETED'::"MeetingWeekStatus"
    ELSE 'ACTIVE'::"MeetingWeekStatus"
  END;

INSERT INTO "MonthlySchedule" ("id", "year", "month", "name", "status", "updatedAt")
SELECT
  'ms_' || md5(parts."year"::text || '-' || parts."month"::text),
  parts."year",
  parts."month",
  'Programa ' || parts."year" || '-' || lpad(parts."month"::text, 2, '0'),
  'ACTIVE'::"MonthlyScheduleStatus",
  CURRENT_TIMESTAMP
FROM (
  SELECT
    EXTRACT(YEAR FROM "meetingDate")::int AS "year",
    EXTRACT(MONTH FROM "meetingDate")::int AS "month"
  FROM "JwMeetingWeek"
  GROUP BY 1, 2
) parts
ON CONFLICT ("year", "month") DO NOTHING;

UPDATE "JwMeetingWeek" w
SET "monthlyScheduleId" = ms."id"
FROM "MonthlySchedule" ms
WHERE ms."year" = EXTRACT(YEAR FROM w."meetingDate")::int
  AND ms."month" = EXTRACT(MONTH FROM w."meetingDate")::int;

CREATE INDEX "JwMeetingWeek_monthlyScheduleId_idx" ON "JwMeetingWeek"("monthlyScheduleId");
CREATE INDEX "JwMeetingWeek_status_idx" ON "JwMeetingWeek"("status");

ALTER TABLE "JwMeetingWeek"
  ADD CONSTRAINT "JwMeetingWeek_monthlyScheduleId_fkey"
  FOREIGN KEY ("monthlyScheduleId") REFERENCES "MonthlySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Assignment metadata.
ALTER TABLE "JwAssignment"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

UPDATE "JwAssignment" a
SET
  "assignedNameSnapshot" = COALESCE(
    a."assignedNameSnapshot",
    (SELECT COALESCE(ap."displayName", ap."fullName") FROM "JwPublisher" ap WHERE ap."id" = a."assignedPublisherId")
  ),
  "assignedPhoneSnapshot" = COALESCE(
    a."assignedPhoneSnapshot",
    (SELECT COALESCE(ap."whatsappPhone", ap."phone") FROM "JwPublisher" ap WHERE ap."id" = a."assignedPublisherId")
  ),
  "companionNameSnapshot" = COALESCE(
    a."companionNameSnapshot",
    (SELECT COALESCE(cp."displayName", cp."fullName") FROM "JwPublisher" cp WHERE cp."id" = a."companionPublisherId")
  ),
  "companionPhoneSnapshot" = COALESCE(
    a."companionPhoneSnapshot",
    (SELECT COALESCE(cp."whatsappPhone", cp."phone") FROM "JwPublisher" cp WHERE cp."id" = a."companionPublisherId")
  ),
  "completedAt" = CASE WHEN a."status" = 'COMPLETED' THEN a."updatedAt" ELSE NULL END,
  "cancelledAt" = CASE WHEN a."status" = 'CANCELLED' THEN a."updatedAt" ELSE NULL END;

CREATE INDEX "JwAssignment_meetingWeekId_status_idx" ON "JwAssignment"("meetingWeekId", "status");
CREATE INDEX "JwAssignment_assignedPublisherId_idx" ON "JwAssignment"("assignedPublisherId");
CREATE INDEX "JwAssignment_companionPublisherId_idx" ON "JwAssignment"("companionPublisherId");

-- Automation plans.
CREATE TABLE "AutomationPlan" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "status" "AutomationPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "timezone" TEXT NOT NULL,
  "sendHour" INTEGER NOT NULL,
  "meetingDateLocal" TEXT NOT NULL,
  "meetingTimeLocal" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "AutomationPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationPlan_assignmentId_version_key" ON "AutomationPlan"("assignmentId", "version");
CREATE INDEX "AutomationPlan_assignmentId_status_idx" ON "AutomationPlan"("assignmentId", "status");

ALTER TABLE "AutomationPlan"
  ADD CONSTRAINT "AutomationPlan_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "JwAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reminder deliveries.
CREATE TABLE "ReminderDelivery" (
  "id" TEXT NOT NULL,
  "automationPlanId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "publisherId" TEXT NOT NULL,
  "recipientRole" "ReminderRecipientRole" NOT NULL,
  "reminderType" "ReminderType" NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRetryAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "deadAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderDelivery_automationPlanId_publisherId_reminderType_key" ON "ReminderDelivery"("automationPlanId", "publisherId", "reminderType");
CREATE INDEX "ReminderDelivery_status_scheduledAt_idx" ON "ReminderDelivery"("status", "scheduledAt");
CREATE INDEX "ReminderDelivery_assignmentId_status_idx" ON "ReminderDelivery"("assignmentId", "status");
CREATE INDEX "ReminderDelivery_publisherId_status_idx" ON "ReminderDelivery"("publisherId", "status");
CREATE INDEX "ReminderDelivery_automationPlanId_status_idx" ON "ReminderDelivery"("automationPlanId", "status");

ALTER TABLE "ReminderDelivery"
  ADD CONSTRAINT "ReminderDelivery_automationPlanId_fkey"
  FOREIGN KEY ("automationPlanId") REFERENCES "AutomationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReminderDelivery"
  ADD CONSTRAINT "ReminderDelivery_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "JwAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReminderDelivery"
  ADD CONSTRAINT "ReminderDelivery_publisherId_fkey"
  FOREIGN KEY ("publisherId") REFERENCES "JwPublisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy reminders get compatibility columns.
ALTER TABLE "JwAssignmentReminder"
  ADD COLUMN "automationPlanId" TEXT,
  ADD COLUMN "recipientRole" "ReminderRecipientRole",
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "generationKey" TEXT;

CREATE INDEX "JwAssignmentReminder_automationPlanId_status_idx" ON "JwAssignmentReminder"("automationPlanId", "status");
CREATE INDEX "JwAssignmentReminder_status_scheduledAt_idx" ON "JwAssignmentReminder"("status", "scheduledAt");

-- Backfill one historical/active automation plan per assignment that already has legacy reminders.
INSERT INTO "AutomationPlan" (
  "id",
  "assignmentId",
  "status",
  "version",
  "timezone",
  "sendHour",
  "meetingDateLocal",
  "meetingTimeLocal",
  "rules",
  "createdAt",
  "updatedAt",
  "cancelledAt",
  "archivedAt"
)
SELECT
  'ap_' || md5(a."id"),
  a."id",
  CASE
    WHEN a."status" = 'CANCELLED' THEN 'CANCELLED'::"AutomationPlanStatus"
    WHEN a."status" = 'COMPLETED' THEN 'ARCHIVED'::"AutomationPlanStatus"
    ELSE 'ACTIVE'::"AutomationPlanStatus"
  END,
  1,
  COALESCE((SELECT "value" FROM "AppConfig" WHERE "key" = 'TIMEZONE' LIMIT 1), 'America/Mexico_City'),
  COALESCE(NULLIF((SELECT "value" FROM "AppConfig" WHERE "key" = 'REMINDER_SEND_HOUR' LIMIT 1), '')::int, 9),
  COALESCE(w."meetingDateLocal", to_char(w."meetingDate", 'YYYY-MM-DD')),
  w."meetingTime",
  '{"assigned":["INITIAL_NOTICE","SEVEN_DAYS_BEFORE","THREE_DAYS_BEFORE","ONE_DAY_BEFORE","SAME_DAY"],"companion":["INITIAL_NOTICE","THREE_DAYS_BEFORE","ONE_DAY_BEFORE","SAME_DAY"]}'::jsonb,
  MIN(r."createdAt"),
  CURRENT_TIMESTAMP,
  CASE WHEN a."status" = 'CANCELLED' THEN a."cancelledAt" ELSE NULL END,
  CASE WHEN a."status" = 'COMPLETED' THEN a."completedAt" ELSE NULL END
FROM "JwAssignment" a
JOIN "JwMeetingWeek" w ON w."id" = a."meetingWeekId"
JOIN "JwAssignmentReminder" r ON r."assignmentId" = a."id"
GROUP BY a."id", a."status", a."cancelledAt", a."completedAt", w."meetingDateLocal", w."meetingDate", w."meetingTime"
ON CONFLICT ("assignmentId", "version") DO NOTHING;

UPDATE "JwAssignmentReminder" r
SET
  "automationPlanId" = 'ap_' || md5(r."assignmentId"),
  "recipientRole" = CASE
    WHEN a."companionPublisherId" IS NOT NULL AND r."publisherId" = a."companionPublisherId" THEN 'COMPANION'::"ReminderRecipientRole"
    ELSE 'ASSIGNED'::"ReminderRecipientRole"
  END,
  "generationKey" = 'legacy'
FROM "JwAssignment" a
WHERE a."id" = r."assignmentId";

INSERT INTO "ReminderDelivery" (
  "id",
  "automationPlanId",
  "assignmentId",
  "publisherId",
  "recipientRole",
  "reminderType",
  "scheduledAt",
  "sentAt",
  "status",
  "attemptCount",
  "lastAttemptAt",
  "deadAt",
  "errorMessage",
  "cancelledAt",
  "cancelReason",
  "createdAt",
  "updatedAt"
)
SELECT
  'rd_' || md5(r."id"),
  r."automationPlanId",
  r."assignmentId",
  r."publisherId",
  COALESCE(r."recipientRole", 'ASSIGNED'::"ReminderRecipientRole"),
  r."reminderDay",
  r."scheduledAt",
  r."sentAt",
  r."status",
  CASE WHEN r."status" = 'FAILED' THEN 1 ELSE 0 END,
  CASE WHEN r."status" IN ('FAILED', 'SENT') THEN COALESCE(r."sentAt", r."updatedAt") ELSE NULL END,
  NULL,
  r."errorMessage",
  CASE WHEN r."status" = 'CANCELLED' THEN r."updatedAt" ELSE NULL END,
  CASE WHEN r."status" = 'CANCELLED' THEN 'legacy_cancelled' ELSE NULL END,
  r."createdAt",
  r."updatedAt"
FROM "JwAssignmentReminder" r
WHERE r."automationPlanId" IS NOT NULL
ON CONFLICT ("automationPlanId", "publisherId", "reminderType") DO NOTHING;

-- Message log links.
ALTER TABLE "JwMessageLog"
  ADD COLUMN "automationPlanId" TEXT,
  ADD COLUMN "reminderDeliveryId" TEXT;

UPDATE "JwMessageLog" ml
SET
  "automationPlanId" = rd."automationPlanId",
  "reminderDeliveryId" = rd."id"
FROM "ReminderDelivery" rd
WHERE ml."assignmentId" = rd."assignmentId"
  AND ml."publisherId" = rd."publisherId"
  AND ml."messageType" = rd."reminderType"::text;

CREATE INDEX "JwMessageLog_automationPlanId_idx" ON "JwMessageLog"("automationPlanId");
CREATE INDEX "JwMessageLog_reminderDeliveryId_idx" ON "JwMessageLog"("reminderDeliveryId");

ALTER TABLE "JwMessageLog"
  ADD CONSTRAINT "JwMessageLog_automationPlanId_fkey"
  FOREIGN KEY ("automationPlanId") REFERENCES "AutomationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JwMessageLog"
  ADD CONSTRAINT "JwMessageLog_reminderDeliveryId_fkey"
  FOREIGN KEY ("reminderDeliveryId") REFERENCES "ReminderDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Automation events.
CREATE TABLE "JwAutomationEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorType" TEXT,
  "actorId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JwAutomationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JwAutomationEvent_eventType_idx" ON "JwAutomationEvent"("eventType");
CREATE INDEX "JwAutomationEvent_entityType_entityId_idx" ON "JwAutomationEvent"("entityType", "entityId");
CREATE INDEX "JwAutomationEvent_createdAt_idx" ON "JwAutomationEvent"("createdAt");

INSERT INTO "JwAutomationEvent" ("id", "eventType", "entityType", "entityId", "actorType", "metadata")
SELECT
  'evt_' || md5('monthly_' || "id"),
  'MONTHLY_PROGRAM_CREATED',
  'MonthlySchedule',
  "id",
  'migration',
  jsonb_build_object('source', 'backfill')
FROM "MonthlySchedule";

INSERT INTO "JwAutomationEvent" ("id", "eventType", "entityType", "entityId", "actorType", "metadata")
SELECT
  'evt_' || md5('plan_' || "id"),
  'AUTOMATION_PLAN_CREATED',
  'AutomationPlan',
  "id",
  'migration',
  jsonb_build_object('source', 'legacy_reminders_backfill')
FROM "AutomationPlan";
