-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AssignmentSection" AS ENUM ('BIBLE_READING', 'APPLY_YOURSELF');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('BIBLE_READING', 'START_CONVERSATION', 'MAKE_RETURN_VISIT', 'BIBLE_STUDY', 'EXPLAIN_BELIEFS', 'MAKE_DISCIPLES', 'TALK', 'OTHER');

-- CreateEnum
CREATE TYPE "Room" AS ENUM ('MAIN', 'AUXILIARY');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'NOTIFIED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('INITIAL_NOTICE', 'SEVEN_DAYS_BEFORE', 'THREE_DAYS_BEFORE', 'ONE_DAY_BEFORE', 'SAME_DAY', 'CHANGE_NOTICE', 'CANCELLATION_NOTICE');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageLogStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WhatsappSessionStatus" AS ENUM ('STARTING', 'QR_REQUIRED', 'AUTHENTICATED', 'READY', 'DISCONNECTED', 'FAILED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwPublisher" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT,
    "phone" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "gender" "Gender",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canReceiveAssignments" BOOLEAN NOT NULL DEFAULT true,
    "canBeCompanion" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "congregationId" TEXT,
    "email" TEXT,
    "birthDate" TIMESTAMP(3),
    "emergencyContact" TEXT,
    "roleNotes" TEXT,
    "tags" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JwPublisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwMeetingWeek" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "meetingTime" TEXT NOT NULL,
    "congregationName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JwMeetingWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwAssignment" (
    "id" TEXT NOT NULL,
    "meetingWeekId" TEXT NOT NULL,
    "assignmentNumber" INTEGER NOT NULL,
    "section" "AssignmentSection" NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "context" TEXT,
    "reference" TEXT,
    "assignedPublisherId" TEXT NOT NULL,
    "companionPublisherId" TEXT,
    "assignedNameSnapshot" TEXT,
    "assignedPhoneSnapshot" TEXT,
    "companionNameSnapshot" TEXT,
    "companionPhoneSnapshot" TEXT,
    "room" "Room" NOT NULL,
    "notes" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JwAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwAssignmentReminder" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "reminderDay" "ReminderType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JwAssignmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwMessageTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JwMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwMessageLog" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "publisherId" TEXT,
    "phone" TEXT NOT NULL,
    "messageType" TEXT,
    "messageBody" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "MessageLogStatus" NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JwMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwWhatsappSessionLog" (
    "id" TEXT NOT NULL,
    "status" "WhatsappSessionStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JwWhatsappSessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "JwPublisher_phone_key" ON "JwPublisher"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "JwAssignmentReminder_assignmentId_publisherId_reminderDay_key" ON "JwAssignmentReminder"("assignmentId", "publisherId", "reminderDay");

-- CreateIndex
CREATE UNIQUE INDEX "JwMessageTemplate_type_key" ON "JwMessageTemplate"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");

-- AddForeignKey
ALTER TABLE "JwAssignment" ADD CONSTRAINT "JwAssignment_meetingWeekId_fkey" FOREIGN KEY ("meetingWeekId") REFERENCES "JwMeetingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwAssignment" ADD CONSTRAINT "JwAssignment_assignedPublisherId_fkey" FOREIGN KEY ("assignedPublisherId") REFERENCES "JwPublisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwAssignment" ADD CONSTRAINT "JwAssignment_companionPublisherId_fkey" FOREIGN KEY ("companionPublisherId") REFERENCES "JwPublisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwAssignmentReminder" ADD CONSTRAINT "JwAssignmentReminder_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "JwAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwAssignmentReminder" ADD CONSTRAINT "JwAssignmentReminder_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "JwPublisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwMessageLog" ADD CONSTRAINT "JwMessageLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "JwAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwMessageLog" ADD CONSTRAINT "JwMessageLog_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "JwPublisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
