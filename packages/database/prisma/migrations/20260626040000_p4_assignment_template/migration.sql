-- CreateTable
CREATE TABLE "AssignmentTemplate" (
    "id" TEXT NOT NULL,
    "meetingWeekId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "assignmentNumber" INTEGER NOT NULL,
    "section" "AssignmentSection" NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "needsCompanion" BOOLEAN NOT NULL DEFAULT false,
    "room" "Room" NOT NULL DEFAULT 'MAIN',
    "reference" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentTemplate_meetingWeekId_assignmentNumber_key" ON "AssignmentTemplate"("meetingWeekId", "assignmentNumber");

-- CreateIndex
CREATE INDEX "AssignmentTemplate_meetingWeekId_idx" ON "AssignmentTemplate"("meetingWeekId");

-- AddForeignKey
ALTER TABLE "AssignmentTemplate" ADD CONSTRAINT "AssignmentTemplate_meetingWeekId_fkey" FOREIGN KEY ("meetingWeekId") REFERENCES "JwMeetingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
