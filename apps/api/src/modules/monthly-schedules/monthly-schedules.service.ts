import { prisma, ReminderStatus } from "@jw-reminders/database";
import {
  applyAssignmentSnapshots,
  createAutomationEvent,
  createAutomationPlanForAssignment,
  publisherSnapshot,
  regenerateAssignmentAutomation,
} from "../../services/automation.service.js";
import { buildAssignmentProposal, ProposalOptions } from "../../services/assignment-proposal.js";
import { hardDeleteWeekData } from "../meeting-weeks/meeting-weeks.service.js";

// ─── Delivery status buckets ─────────────────────────────
const PENDING_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "SENDING"];
const SENT_STATUSES: ReminderStatus[] = ["SENT"];
const FAILED_STATUSES: ReminderStatus[] = ["FAILED", "DEAD"];
const CANCELLABLE_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "FAILED"];

// Weeks that no longer participate in the active program lifecycle.
const INACTIVE_WEEK_STATUSES = ["ARCHIVED", "CANCELLED"] as const;

interface DeliveryCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped: number;
}

function emptyCounts(): DeliveryCounts {
  return { total: 0, pending: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 };
}

function bucketDelivery(counts: DeliveryCounts, status: ReminderStatus) {
  counts.total += 1;
  if (PENDING_STATUSES.includes(status)) counts.pending += 1;
  else if (SENT_STATUSES.includes(status)) counts.sent += 1;
  else if (FAILED_STATUSES.includes(status)) counts.failed += 1;
  else if (status === "CANCELLED") counts.cancelled += 1;
  else if (status === "SKIPPED") counts.skipped += 1;
}

/**
 * Completion of a single week, mirrored from the web "semanas" view:
 *  1. week exists, 2. has assignments, 3. has automations, 4. nothing pending.
 */
function weekCompletion(assignmentCount: number, counts: DeliveryCounts): number {
  const steps = [
    true,
    assignmentCount > 0,
    counts.total > 0,
    counts.total > 0 && counts.pending === 0,
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

// ─── List with metrics ───────────────────────────────────
export async function listMonthlySchedules() {
  const schedules = await prisma.monthlySchedule.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      weeks: {
        include: {
          _count: { select: { assignments: { where: { status: { not: "PROPOSED" } } } } },
          assignments: {
            where: { status: { not: "PROPOSED" } },
            select: { reminderDeliveries: { select: { status: true } } },
          },
        },
      },
    },
  });

  return schedules.map((schedule) => {
    let assignmentCount = 0;
    const totals = emptyCounts();
    const weekPcts: number[] = [];

    for (const week of schedule.weeks) {
      assignmentCount += week._count.assignments;
      const weekCounts = emptyCounts();
      for (const assignment of week.assignments) {
        for (const delivery of assignment.reminderDeliveries) {
          bucketDelivery(weekCounts, delivery.status);
          bucketDelivery(totals, delivery.status);
        }
      }
      if (!INACTIVE_WEEK_STATUSES.includes(week.status as any)) {
        weekPcts.push(weekCompletion(week._count.assignments, weekCounts));
      }
    }

    const completion = weekPcts.length
      ? Math.round(weekPcts.reduce((sum, value) => sum + value, 0) / weekPcts.length)
      : 0;

    const { weeks, ...data } = schedule;
    return {
      ...data,
      weekCount: weeks.length,
      assignmentCount,
      deliveryCount: totals.total,
      pending: totals.pending,
      sent: totals.sent,
      failed: totals.failed,
      cancelled: totals.cancelled,
      completion,
    };
  });
}

// ─── Detail with rich per-week + program metrics ─────────
export async function getMonthlyScheduleDetail(id: string) {
  const schedule = await prisma.monthlySchedule.findUniqueOrThrow({
    where: { id },
    include: {
      weeks: {
        orderBy: { weekStartDate: "asc" },
        include: {
          _count: { select: { assignments: { where: { status: { not: "PROPOSED" } } } } },
          assignments: {
            where: { status: { not: "PROPOSED" } },
            select: {
              id: true,
              status: true,
              reminderDeliveries: { select: { status: true } },
              automationPlans: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  const totals = emptyCounts();
  let totalAssignments = 0;
  let automationPlanCount = 0;
  let activeWeeks = 0;
  const weekPcts: number[] = [];

  const weeks = schedule.weeks.map((week) => {
    const weekCounts = emptyCounts();
    let weekPlans = 0;
    for (const assignment of week.assignments) {
      weekPlans += assignment.automationPlans.length;
      for (const delivery of assignment.reminderDeliveries) {
        bucketDelivery(weekCounts, delivery.status);
        bucketDelivery(totals, delivery.status);
      }
    }
    totalAssignments += week._count.assignments;
    automationPlanCount += weekPlans;

    const isActive = !INACTIVE_WEEK_STATUSES.includes(week.status as any);
    if (isActive) activeWeeks += 1;
    const completion = weekCompletion(week._count.assignments, weekCounts);
    if (isActive) weekPcts.push(completion);

    return {
      id: week.id,
      weekStartDate: week.weekStartDate,
      weekStartDateLocal: week.weekStartDateLocal,
      meetingDate: week.meetingDate,
      meetingDateLocal: week.meetingDateLocal,
      meetingTime: week.meetingTime,
      congregationName: week.congregationName,
      status: week.status,
      assignmentCount: week._count.assignments,
      automationPlanCount: weekPlans,
      total: weekCounts.total,
      pending: weekCounts.pending,
      sent: weekCounts.sent,
      failed: weekCounts.failed,
      cancelled: weekCounts.cancelled,
      skipped: weekCounts.skipped,
      completion,
    };
  });

  const completion = weekPcts.length
    ? Math.round(weekPcts.reduce((sum, value) => sum + value, 0) / weekPcts.length)
    : 0;

  const { weeks: _weeks, ...data } = schedule;
  return {
    ...data,
    metrics: {
      totalWeeks: weeks.length,
      activeWeeks,
      totalAssignments,
      totalAutomations: totals.total,
      automationPlanCount,
      pending: totals.pending,
      sent: totals.sent,
      failed: totals.failed,
      cancelled: totals.cancelled,
      skipped: totals.skipped,
      completion,
    },
    weeks,
  };
}

// ─── Bulk: generate automations for all active weeks ─────
export async function generateProgramAutomations(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: {
          weeks: {
            where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
            include: { assignments: { select: { id: true, status: true } } },
          },
        },
      });

      let created = 0;
      let plans = 0;
      let skipped = 0;

      for (const week of schedule.weeks) {
        let weekCreated = 0;
        for (const assignment of week.assignments) {
          if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED" || assignment.status === "PROPOSED") continue;
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
            reason: "program_bulk_generate",
            actorType: "admin",
          });
          created += result.created;
          plans += 1;
          weekCreated += result.created;
        }
        if (weekCreated > 0) {
          await tx.jwMeetingWeek.update({ where: { id: week.id }, data: { status: "ACTIVE" } });
        }
      }

      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_GENERATED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { created, plans, skipped },
      });

      return { created, plans, skipped };
    },
    { timeout: 30000 },
  );
}

// ─── Bulk: regenerate plans that already exist ───────────
export async function regenerateProgramPending(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: {
          weeks: {
            where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
            include: { assignments: { select: { id: true, status: true } } },
          },
        },
      });

      let created = 0;
      let superseded = 0;

      for (const week of schedule.weeks) {
        for (const assignment of week.assignments) {
          if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED" || assignment.status === "PROPOSED") continue;
          const result = await regenerateAssignmentAutomation(tx, assignment.id, "program_regenerate");
          created += result.created;
          superseded += result.superseded;
        }
      }

      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_REGENERATED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { created, superseded },
      });

      return { created, superseded };
    },
    { timeout: 30000 },
  );
}

// ─── Bulk: cancel pending deliveries across the program ──
export async function cancelProgramPending(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.monthlySchedule.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const assignments = await tx.jwAssignment.findMany({
      where: { meetingWeek: { monthlyScheduleId: id } },
      select: { id: true },
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    if (assignmentIds.length === 0) return { cancelled: 0 };

    const result = await tx.reminderDelivery.updateMany({
      where: { assignmentId: { in: assignmentIds }, status: { in: CANCELLABLE_STATUSES } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "program_cancel_pending" },
    });

    if (result.count > 0) {
      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_CANCELLED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { cancelled: result.count },
      });
    }

    return { cancelled: result.count };
  });
}

// ─── Delete or archive a whole program ───────────────────
export async function deleteMonthlySchedule(id: string, mode: "delete" | "archive") {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: { weeks: { select: { id: true } } },
      });

      if (mode === "archive") {
        const updated = await tx.monthlySchedule.update({
          where: { id },
          data: { status: "ARCHIVED", archivedAt: new Date() },
        });
        await createAutomationEvent(tx, {
          eventType: "MONTHLY_PROGRAM_ARCHIVED",
          entityType: "MonthlySchedule",
          entityId: id,
          actorType: "admin",
          metadata: { reason: "archive_requested" },
        });
        return updated;
      }

      // Hard delete: remove every week (and all its content) then the program.
      const weekIds = schedule.weeks.map((week) => week.id);
      await hardDeleteWeekData(tx, weekIds);
      await tx.monthlySchedule.delete({ where: { id } });
      await createAutomationEvent(tx, {
        eventType: "MONTHLY_PROGRAM_DELETED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { reason: "hard_delete_requested", weeks: weekIds.length },
      });
      return { deleted: true, id };
    },
    { timeout: 30000 },
  );
}

// ─── Assignment proposal (P3) ────────────────────────────

const PROPOSAL_HISTORY_STATUSES = ["DRAFT", "SCHEDULED", "COMPLETED"] as const;

function needsCompanionFor(assignmentType: string): boolean {
  return assignmentType !== "BIBLE_READING" && assignmentType !== "TALK";
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function loadProposalHistory(tx: any) {
  const rows = await tx.jwAssignment.findMany({
    where: { status: { in: [...PROPOSAL_HISTORY_STATUSES] } },
    select: { assignedPublisherId: true, companionPublisherId: true },
  });
  const assignedCount: Record<string, number> = {};
  const pairCount: Record<string, number> = {};
  for (const row of rows) {
    assignedCount[row.assignedPublisherId] = (assignedCount[row.assignedPublisherId] || 0) + 1;
    if (row.companionPublisherId) {
      assignedCount[row.companionPublisherId] = (assignedCount[row.companionPublisherId] || 0) + 1;
      const key = pairKey(row.assignedPublisherId, row.companionPublisherId);
      pairCount[key] = (pairCount[key] || 0) + 1;
    }
  }
  return { assignedCount, pairCount };
}

export async function generateProposal(id: string, options: ProposalOptions = {}) {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: {
          weeks: {
            where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
            orderBy: { weekStartDate: "asc" },
            include: {
              assignments: {
                select: { assignmentNumber: true, assignedPublisherId: true, companionPublisherId: true, status: true },
              },
              assignmentTemplates: {
                orderBy: { order: "asc" },
                select: { assignmentNumber: true, section: true, assignmentType: true, title: true, durationMinutes: true, needsCompanion: true, room: true },
              },
            },
          },
        },
      });

      if (schedule.weeks.length === 0) {
        throw new Error("El programa no tiene semanas activas. Genera las semanas antes de proponer asignaciones.");
      }

      const publishers = await tx.jwPublisher.findMany({
        where: { deletedAt: null },
        select: {
          id: true, fullName: true, displayName: true, phone: true, whatsappPhone: true,
          isActive: true, deletedAt: true, canReceiveAssignments: true, canBeCompanion: true, gender: true,
        },
      });

      const history = await loadProposalHistory(tx);

      const weeksInput = schedule.weeks.map((week) => ({
        weekId: week.id,
        existingNumbers: week.assignments.map((a) => a.assignmentNumber),
        existingPublisherIds: week.assignments
          .filter((a) => a.status !== "PROPOSED")
          .flatMap((a) => [a.assignedPublisherId, a.companionPublisherId].filter(Boolean) as string[]),
        slots: week.assignmentTemplates.length > 0
          ? week.assignmentTemplates.map((t) => ({
              assignmentNumber: t.assignmentNumber,
              section: t.section as any,
              assignmentType: t.assignmentType as string,
              title: t.title,
              durationMinutes: t.durationMinutes ?? undefined,
              room: t.room as any,
              needsCompanion: t.needsCompanion,
            }))
          : undefined,
      }));

      const { assignments, warnings } = buildAssignmentProposal({ weeks: weeksInput, publishers, history, options });

      const pubMap = new Map(publishers.map((p) => [p.id, p]));
      let created = 0;
      for (const a of assignments) {
        const assignedSnap = publisherSnapshot(pubMap.get(a.assignedPublisherId));
        const companionSnap = publisherSnapshot(a.companionPublisherId ? pubMap.get(a.companionPublisherId) : null);
        await tx.jwAssignment.create({
          data: {
            meetingWeekId: a.weekId,
            assignmentNumber: a.assignmentNumber,
            section: a.section,
            assignmentType: a.assignmentType as any,
            title: a.title,
            durationMinutes: a.durationMinutes,
            assignedPublisherId: a.assignedPublisherId,
            companionPublisherId: a.companionPublisherId,
            assignedNameSnapshot: assignedSnap.name,
            assignedPhoneSnapshot: assignedSnap.phone,
            companionNameSnapshot: companionSnap.name,
            companionPhoneSnapshot: companionSnap.phone,
            room: a.room,
            status: "PROPOSED",
          },
        });
        created += 1;
      }

      await createAutomationEvent(tx, {
        eventType: "MONTHLY_PROPOSAL_GENERATED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { created, warnings },
      });

      return { created, warnings };
    },
    { timeout: 30000 },
  );
}

export async function discardProposal(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.monthlySchedule.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const proposed = await tx.jwAssignment.findMany({
      where: { status: "PROPOSED", meetingWeek: { monthlyScheduleId: id } },
      select: { id: true },
    });
    const ids = proposed.map((p) => p.id);
    if (ids.length === 0) return { discarded: 0 };

    // PROPOSED assignments never have automation plans or deliveries, so deletion is safe.
    await tx.jwAssignment.deleteMany({ where: { id: { in: ids } } });
    await createAutomationEvent(tx, {
      eventType: "MONTHLY_PROPOSAL_DISCARDED",
      entityType: "MonthlySchedule",
      entityId: id,
      actorType: "admin",
      metadata: { discarded: ids.length },
    });
    return { discarded: ids.length };
  });
}

export async function regenerateProposal(id: string, options: ProposalOptions = {}) {
  const discarded = await discardProposal(id);
  // Fresh random seed each time so the new distribution differs from the previous one.
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const generated = await generateProposal(id, { ...options, seed });
  return { discarded: discarded.discarded, created: generated.created, warnings: generated.warnings };
}

export async function approveProposal(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.monthlySchedule.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const proposed = await tx.jwAssignment.findMany({
      where: { status: "PROPOSED", meetingWeek: { monthlyScheduleId: id } },
      select: { id: true },
    });
    const ids = proposed.map((p) => p.id);
    if (ids.length === 0) return { approved: 0 };

    // Approving only turns proposals into real DRAFT assignments; no automations are created.
    await tx.jwAssignment.updateMany({ where: { id: { in: ids } }, data: { status: "DRAFT" } });
    await createAutomationEvent(tx, {
      eventType: "MONTHLY_PROPOSAL_APPROVED",
      entityType: "MonthlySchedule",
      entityId: id,
      actorType: "admin",
      metadata: { approved: ids.length },
    });
    return { approved: ids.length };
  });
}

export async function getProposal(id: string) {
  const schedule = await prisma.monthlySchedule.findUniqueOrThrow({
    where: { id },
    include: {
      weeks: {
        where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
        orderBy: { weekStartDate: "asc" },
        include: {
          assignments: {
            where: { status: "PROPOSED" },
            orderBy: { assignmentNumber: "asc" },
            include: { assigned: true, companion: true },
          },
        },
      },
    },
  });

  const publishers = await prisma.jwPublisher.findMany({
    where: { deletedAt: null, isActive: true, canReceiveAssignments: true },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, displayName: true, canBeCompanion: true },
  });

  let proposedCount = 0;
  const weeks = schedule.weeks.map((week) => {
    proposedCount += week.assignments.length;
    return {
      id: week.id,
      weekStartDate: week.weekStartDate,
      meetingDate: week.meetingDate,
      meetingTime: week.meetingTime,
      status: week.status,
      assignments: week.assignments.map((a) => ({
        id: a.id,
        assignmentNumber: a.assignmentNumber,
        title: a.title,
        section: a.section,
        assignmentType: a.assignmentType,
        needsCompanion: needsCompanionFor(a.assignmentType),
        assigned: a.assigned ? { id: a.assigned.id, name: a.assigned.displayName || a.assigned.fullName } : null,
        companion: a.companion ? { id: a.companion.id, name: a.companion.displayName || a.companion.fullName } : null,
      })),
    };
  });

  return {
    programId: schedule.id,
    name: schedule.name,
    status: schedule.status,
    hasProposal: proposedCount > 0,
    proposedCount,
    weeks,
    publishers: publishers.map((p) => ({ id: p.id, name: p.displayName || p.fullName, canBeCompanion: p.canBeCompanion })),
  };
}

