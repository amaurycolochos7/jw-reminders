-- CreateEnum
CREATE TYPE "WeekImportStatus" AS ENUM ('EMPTY', 'IMPORTING', 'READY', 'NEEDS_REVIEW', 'IMPORT_FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FIRST_ASSIGNMENT', 'REMINDER');

-- AlterTable
ALTER TABLE "JwMeetingWeek"
    ADD COLUMN "isoYear" INTEGER,
    ADD COLUMN "isoWeekNumber" INTEGER,
    ADD COLUMN "wolMeetingsUrl" TEXT,
    ADD COLUMN "wolProgramUrl" TEXT,
    ADD COLUMN "importStatus" "WeekImportStatus" NOT NULL DEFAULT 'EMPTY',
    ADD COLUMN "importedAt" TIMESTAMP(3),
    ADD COLUMN "importError" TEXT;

-- AlterTable
ALTER TABLE "JwAssignment" ADD COLUMN "programItemId" TEXT;

-- CreateTable
CREATE TABLE "MeetingProgramItem" (
    "id" TEXT NOT NULL,
    "meetingWeekId" TEXT NOT NULL,
    "itemNumber" INTEGER,
    "section" TEXT,
    "title" TEXT NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL DEFAULT 'OTHER',
    "durationMinutes" INTEGER,
    "context" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "lesson" TEXT,
    "requiresAssistant" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingProgramItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "recipientPersonId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "status" "MessageLogStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JwMeetingWeek_importStatus_idx" ON "JwMeetingWeek"("importStatus");

-- CreateIndex
CREATE INDEX "JwAssignment_programItemId_idx" ON "JwAssignment"("programItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingProgramItem_meetingWeekId_sortOrder_key" ON "MeetingProgramItem"("meetingWeekId", "sortOrder");

-- CreateIndex
CREATE INDEX "MeetingProgramItem_meetingWeekId_idx" ON "MeetingProgramItem"("meetingWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_assignmentId_recipientPersonId_notificationKey_key" ON "NotificationLog"("assignmentId", "recipientPersonId", "notificationKey");

-- CreateIndex
CREATE INDEX "NotificationLog_assignmentId_idx" ON "NotificationLog"("assignmentId");

-- CreateIndex
CREATE INDEX "NotificationLog_recipientPersonId_idx" ON "NotificationLog"("recipientPersonId");

-- AddForeignKey
ALTER TABLE "JwAssignment" ADD CONSTRAINT "JwAssignment_programItemId_fkey" FOREIGN KEY ("programItemId") REFERENCES "MeetingProgramItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingProgramItem" ADD CONSTRAINT "MeetingProgramItem_meetingWeekId_fkey" FOREIGN KEY ("meetingWeekId") REFERENCES "JwMeetingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "JwAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_recipientPersonId_fkey" FOREIGN KEY ("recipientPersonId") REFERENCES "JwPublisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
