import { prisma } from "@jw-reminders/database";
import {
  applyAssignmentSnapshots,
  createAutomationEvent,
  createAutomationPlanForAssignment,
  ensureMonthlyScheduleForDate,
  regenerateAssignmentAutomation,
} from "../../services/automation.service.js";
import { dateToLocalDateString } from "../../services/date-utils.js";

export async function listMeetingWeeks() {
  const weeks = await prisma.jwMeetingWeek.findMany({
    orderBy: { weekStartDate: "desc" },
    include: {
      monthlySchedule: true,
      _count: { select: { assignments: true } },
      assignments: {
        select: {
          reminderDeliveries: { select: { status: true } },
        },
      },
    },
  });

  return weeks.map((week) => {
    const deliveries = week.assignments.flatMap((assignment) => assignment.reminderDeliveries);
    const totalReminders = deliveries.length;
    const pendingReminders = deliveries.filter((d) => ["PENDING", "QUEUED", "SENDING"].includes(d.status)).length;
    const sentReminders = deliveries.filter((d) => d.status === "SENT").length;
    const failedReminders = deliveries.filter((d) => ["FAILED", "DEAD"].includes(d.status)).length;
    const { assignments, ...weekData } = week;
    return { ...weekData, totalReminders, pendingReminders, sentReminders, failedReminders };
  });
}

export async function getMeetingWeek(id: string) {
  const week = await prisma.jwMeetingWeek.findUniqueOrThrow({
    where: { id },
    include: {
      monthlySchedule: true,
      assignments: {
        include: {
          assigned: true,
          companion: true,
          reminderDeliveries: { include: { publisher: true }, orderBy: { scheduledAt: "asc" } },
        },
        orderBy: { assignmentNumber: "asc" },
      },
    },
  });

  return {
    ...week,
    assignments: week.assignments.map((assignment) => ({
      ...assignment,
      reminders: assignment.reminderDeliveries.map((delivery) => ({
        id: delivery.id,
        publisherId: delivery.publisherId,
        reminderDay: delivery.reminderType,
        scheduledAt: delivery.scheduledAt,
        sentAt: delivery.sentAt,
        status: delivery.status,
        errorMessage: delivery.errorMessage,
        publisher: delivery.publisher,
      })),
    })),
  };
}

export async function createMeetingWeek(data: any) {
  return prisma.$transaction(async (tx) => {
    const meetingDateLocal = data.meetingDateLocal || dateToLocalDateString(data.meetingDate);
    const weekStartDateLocal = data.weekStartDateLocal || dateToLocalDateString(data.weekStartDate);
    const monthlySchedule = await ensureMonthlyScheduleForDate(tx, meetingDateLocal);
    const week = await tx.jwMeetingWeek.create({
      data: {
        ...data,
        meetingDateLocal,
        weekStartDateLocal,
        monthlyScheduleId: monthlySchedule.id,
        status: "DRAFT",
      },
    });

    await createAutomationEvent(tx, {
      eventType: "WEEK_CREATED",
      entityType: "JwMeetingWeek",
      entityId: week.id,
      metadata: { monthlyScheduleId: monthlySchedule.id },
    });

    return week;
  });
}

export async function updateMeetingWeek(id: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.jwMeetingWeek.findUniqueOrThrow({
      where: { id },
      include: { assignments: true },
    });

    const currentMeetingDateLocal = before.meetingDateLocal || dateToLocalDateString(before.meetingDate);
    const nextMeetingDateLocal = data.meetingDate ? dateToLocalDateString(data.meetingDate) : currentMeetingDateLocal;
    const nextWeekStartDateLocal = data.weekStartDate
      ? dateToLocalDateString(data.weekStartDate)
      : before.weekStartDateLocal || dateToLocalDateString(before.weekStartDate);
    const monthlySchedule = await ensureMonthlyScheduleForDate(tx, nextMeetingDateLocal);
    const meetingChanged = Boolean(
      (data.meetingDate && nextMeetingDateLocal !== currentMeetingDateLocal) ||
      (data.meetingTime && data.meetingTime !== before.meetingTime),
    );

    const week = await tx.jwMeetingWeek.update({
      where: { id },
      data: {
        ...data,
        meetingDateLocal: nextMeetingDateLocal,
        weekStartDateLocal: nextWeekStartDateLocal,
        monthlyScheduleId: monthlySchedule.id,
        status: before.status === "DRAFT" ? "READY" : before.status,
      },
    });

    await createAutomationEvent(tx, {
      eventType: "WEEK_UPDATED",
      entityType: "JwMeetingWeek",
      entityId: week.id,
      metadata: { meetingChanged, monthlyScheduleId: monthlySchedule.id },
    });

    if (meetingChanged) {
      for (const assignment of before.assignments.filter((item) => item.status === "SCHEDULED")) {
        await regenerateAssignmentAutomation(tx, assignment.id, "meeting_week_changed");
      }
    }

    return week;
  });
}
export async function generateWeekAutomations(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const week = await tx.jwMeetingWeek.findUniqueOrThrow({
        where: { id },
        include: { assignments: { select: { id: true, status: true } } },
      });

      if (week.status === "ARCHIVED" || week.status === "CANCELLED") {
        throw new Error("No se pueden generar automatizaciones en una semana archivada o cancelada");
      }

      let created = 0;
      let plans = 0;
      let skipped = 0;

      for (const assignment of week.assignments) {
        if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED") continue;
        const active = await tx.automationPlan.findFirst({
          where: { assignmentId: assignment.id, status: "ACTIVE" },
          select: { id: true },
        });
        if (active) {
          skipped += 1;
          continue;
        }
        await applyAssignmentSnapshots(tx, assignment.id);
        const result = await createAutomationPlanForAssignment(tx, assignment.id, {
          includeInitial: true,
          includeNormal: true,
          reason: "week_bulk_generate",
          actorType: "admin",
        });
        created += result.created;
        plans += 1;
      }

      if (plans > 0) {
        await tx.jwMeetingWeek.update({ where: { id }, data: { status: "ACTIVE" } });
      }

      await createAutomationEvent(tx, {
        eventType: "WEEK_AUTOMATIONS_GENERATED",
        entityType: "JwMeetingWeek",
        entityId: id,
        actorType: "admin",
        metadata: { created, plans, skipped },
      });

      return { created, plans, skipped };
    },
    { timeout: 30000 },
  );
}



export async function deleteMeetingWeek(id: string) {
  return prisma.$transaction(async (tx) => {
    const assignments = await tx.jwAssignment.findMany({
      where: { meetingWeekId: id },
      select: { id: true },
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const [deliveryCount, logCount, legacyReminderCount] = await Promise.all([
      tx.reminderDelivery.count({ where: { assignmentId: { in: assignmentIds } } }),
      tx.jwMessageLog.count({ where: { assignmentId: { in: assignmentIds } } }),
      tx.jwAssignmentReminder.count({ where: { assignmentId: { in: assignmentIds } } }),
    ]);

    if (assignmentIds.length > 0 || deliveryCount > 0 || logCount > 0 || legacyReminderCount > 0) {
      const week = await tx.jwMeetingWeek.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await createAutomationEvent(tx, {
        eventType: "WEEK_ARCHIVED",
        entityType: "JwMeetingWeek",
        entityId: id,
        metadata: {
          reason: "delete_requested_with_history",
          assignmentCount: assignmentIds.length,
          deliveryCount,
          logCount,
        },
      });
      return week;
    }

    return tx.jwMeetingWeek.delete({ where: { id } });
  });
}

