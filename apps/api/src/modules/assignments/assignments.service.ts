import { prisma } from "@jw-reminders/database";
import {
  validateAssignmentGenders,
  requiredCapabilityForType,
  getAssignmentTypeRule,
  type EligibilityPublisher,
} from "@jw-reminders/shared";
import {
  applyAssignmentSnapshots,
  archiveAssignmentAutomation,
  cancelAssignmentAutomation,
  createAutomationEvent,
  createAutomationPlanForAssignment,
  hasAssignmentAutomation,
  publisherSnapshot,
  regenerateAssignmentAutomation,
} from "../../services/automation.service.js";

/**
 * Valida que el publicador asignado tenga la capacidad requerida por el tipo de
 * parte (Fase 3). Devuelve un mensaje de error en español o null si es válido.
 * Conservador: si la capacidad viene `undefined` (dato legacy) no se bloquea;
 * solo bloquea cuando está explícitamente en `false`, igual que la elegibilidad.
 */
function validateAssignmentCapability(
  assignmentType: string,
  assigned: EligibilityPublisher,
): string | null {
  const capField = requiredCapabilityForType(assignmentType);
  if (!capField) return null;
  if (assigned[capField] === false) {
    const label = getAssignmentTypeRule(assignmentType).label;
    return `El publicador no tiene la capacidad requerida para "${label}".`;
  }
  return null;
}

const RELEVANT_FIELDS = [
  "assignmentNumber",
  "section",
  "assignmentType",
  "title",
  "durationMinutes",
  "context",
  "reference",
  "assignedPublisherId",
  "companionPublisherId",
  "room",
  "notes",
];

export async function listAssignments(meetingWeekId?: string) {
  return prisma.jwAssignment.findMany({
    where: meetingWeekId ? { meetingWeekId } : undefined,
    include: { assigned: true, companion: true, meetingWeek: true, reminderDeliveries: true },
    orderBy: { assignmentNumber: "asc" },
  });
}

export async function getAssignment(id: string) {
  const assignment = await prisma.jwAssignment.findUniqueOrThrow({
    where: { id },
    include: {
      assigned: true,
      companion: true,
      meetingWeek: true,
      reminderDeliveries: { include: { publisher: true }, orderBy: { scheduledAt: "asc" } },
    },
  });

  return {
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
  };
}

export async function createAssignment(data: any) {
  return prisma.$transaction(async (tx) => {
    const [assigned, companion] = await Promise.all([
      tx.jwPublisher.findUniqueOrThrow({ where: { id: data.assignedPublisherId } }),
      data.companionPublisherId ? tx.jwPublisher.findUnique({ where: { id: data.companionPublisherId } }) : null,
    ]);

    const genderError = validateAssignmentGenders({
      assignmentType: data.assignmentType,
      assignedGender: assigned.gender,
      companionGender: companion?.gender ?? null,
    });
    if (genderError) throw new Error(genderError);

    const capabilityError = validateAssignmentCapability(data.assignmentType, assigned);
    if (capabilityError) throw new Error(capabilityError);

    // No permitir dos asignaciones para la MISMA parte real de la semana
    // (salvo canceladas o propuestas). Si ya existe, se debe editar, no duplicar.
    if (data.programItemId) {
      const existing = await tx.jwAssignment.findFirst({
        where: {
          programItemId: data.programItemId,
          status: { notIn: ["PROPOSED", "CANCELLED"] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error(
          "Ya existe una asignación para esta parte de la semana. Edítala en lugar de crear una nueva.",
        );
      }
    }

    const assignedSnapshot = publisherSnapshot(assigned);
    const companionSnapshot = publisherSnapshot(companion);
    const assignment = await tx.jwAssignment.create({
      data: {
        ...data,
        status: "DRAFT",
        assignedNameSnapshot: assignedSnapshot.name,
        assignedPhoneSnapshot: assignedSnapshot.phone,
        companionNameSnapshot: companionSnapshot.name,
        companionPhoneSnapshot: companionSnapshot.phone,
      },
    });

    await createAutomationEvent(tx, {
      eventType: "ASSIGNMENT_CREATED",
      entityType: "JwAssignment",
      entityId: assignment.id,
      metadata: { meetingWeekId: assignment.meetingWeekId },
    });

    return assignment;
  });
}

function changedRelevantFields(before: any, data: any) {
  return RELEVANT_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(data, field) && data[field] !== before[field]);
}

export async function updateAssignment(id: string, data: any) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.jwAssignment.findUniqueOrThrow({ where: { id } });

    // Resolve effective values (incoming data overrides current) to validate gender rules.
    const effectiveType = data.assignmentType ?? before.assignmentType;
    const effectiveAssignedId = data.assignedPublisherId ?? before.assignedPublisherId;
    const effectiveCompanionId =
      "companionPublisherId" in data ? data.companionPublisherId : before.companionPublisherId;

    const [effectiveAssigned, effectiveCompanion] = await Promise.all([
      tx.jwPublisher.findUniqueOrThrow({ where: { id: effectiveAssignedId } }),
      effectiveCompanionId ? tx.jwPublisher.findUnique({ where: { id: effectiveCompanionId } }) : null,
    ]);

    const genderError = validateAssignmentGenders({
      assignmentType: effectiveType,
      assignedGender: effectiveAssigned.gender,
      companionGender: effectiveCompanion?.gender ?? null,
    });
    if (genderError) throw new Error(genderError);

    const capabilityError = validateAssignmentCapability(effectiveType, effectiveAssigned);
    if (capabilityError) throw new Error(capabilityError);

    // Si se cambia/asigna la parte real, no permitir que colisione con otra
    // asignación (distinta de esta) para la misma parte.
    const effectiveProgramItemId =
      "programItemId" in data ? data.programItemId : before.programItemId;
    if (effectiveProgramItemId) {
      const clash = await tx.jwAssignment.findFirst({
        where: {
          programItemId: effectiveProgramItemId,
          status: { notIn: ["PROPOSED", "CANCELLED"] },
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new Error(
          "Ya existe otra asignación para esta parte de la semana.",
        );
      }
    }

    const changedFields = changedRelevantFields(before, data);
    const assignment = await tx.jwAssignment.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
    await applyAssignmentSnapshots(tx, id);

    await createAutomationEvent(tx, {
      eventType: "ASSIGNMENT_UPDATED",
      entityType: "JwAssignment",
      entityId: id,
      metadata: { changedFields },
    });

    if (changedFields.length > 0 && (await hasAssignmentAutomation(tx, id))) {
      await regenerateAssignmentAutomation(tx, id, "assignment_changed");
    }

    return assignment;
  });
}

export async function cancelAssignment(id: string) {
  return prisma.$transaction(async (tx) => {
    await cancelAssignmentAutomation(tx, id, "assignment_cancelled");
    const assignment = await tx.jwAssignment.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } },
    });
    await createAutomationEvent(tx, {
      eventType: "ASSIGNMENT_CANCELLED",
      entityType: "JwAssignment",
      entityId: id,
      metadata: {},
    });
    return assignment;
  });
}

export async function completeAssignment(id: string) {
  return prisma.$transaction(async (tx) => {
    await archiveAssignmentAutomation(tx, id, "assignment_completed");
    const assignment = await tx.jwAssignment.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date(), version: { increment: 1 } },
    });
    await createAutomationEvent(tx, {
      eventType: "ASSIGNMENT_COMPLETED",
      entityType: "JwAssignment",
      entityId: id,
      metadata: {},
    });
    return assignment;
  });
}

export async function generateReminders(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.jwAssignment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (current.status === "PROPOSED") {
      throw new Error("Esta asignacion es una propuesta. Aprueba la propuesta antes de generar automatizaciones.");
    }
    await applyAssignmentSnapshots(tx, id);
    const existingActive = await tx.automationPlan.findFirst({
      where: { assignmentId: id, status: "ACTIVE" },
    });
    if (existingActive) {
      return { count: 0, planId: existingActive.id };
    }

    const result = await createAutomationPlanForAssignment(tx, id, {
      includeInitial: true,
      includeNormal: true,
      reason: "manual_generate",
      actorType: "admin",
    });

    const assignment = await tx.jwAssignment.findUniqueOrThrow({
      where: { id },
      select: { meetingWeekId: true },
    });
    await tx.jwMeetingWeek.update({
      where: { id: assignment.meetingWeekId },
      data: { status: "ACTIVE" },
    });

    return { count: result.created, planId: result.plan.id };
  });
}

