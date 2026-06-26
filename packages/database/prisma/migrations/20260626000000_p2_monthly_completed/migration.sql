-- AlterEnum
ALTER TYPE "MonthlyScheduleStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "MonthlySchedule" ADD COLUMN "completedAt" TIMESTAMP(3);
