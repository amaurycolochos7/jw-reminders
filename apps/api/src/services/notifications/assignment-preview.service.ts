import { prisma } from "@jw-reminders/database";
import { requiresAssistant } from "@jw-reminders/shared";
import { addDaysToLocalDate, dateToLocalDateString } from "../date-utils.js";
import { buildAssignmentMessages, formatWeekLabel } from "./assignment-message.js";

export interface AssignmentMessagePreview {
  primaryMessage: string | null;
  assistantMessage: string | null;
  reminderMessage: string | null;
  warnings: string[];
}

/**
 * Vista previa de los mensajes de una asignación usando EXACTAMENTE el mismo
 * renderer que enviará el worker (FASE 2). Única fuente de verdad: si cambia la
 * plantilla, cambia el preview y el envío por igual.
 *
 * Los datos de la parte se toman del MeetingProgramItem real de WOL cuando la
 * asignación está enlazada (programItemId); si no, se usan los campos de la
 * propia asignación (compatibilidad con datos legacy).
 */
export async function getAssignmentMessagePreview(assignmentId: string): Promise<AssignmentMessagePreview> {
  const assignment = await prisma.jwAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      meetingWeek: true,
      assigned: true,
      companion: true,
      programItem: true,
    },
  });

  const week = assignment.meetingWeek;
  const startLocal = week.weekStartDateLocal || dateToLocalDateString(week.weekStartDate);
  const endLocal = addDaysToLocalDate(startLocal, 6);
  const weekLabel = formatWeekLabel(startLocal, endLocal);

  const item = assignment.programItem;

  const primaryName = assignment.assigned?.displayName || assignment.assigned?.fullName || null;
  const assistantName = assignment.companion?.displayName || assignment.companion?.fullName || null;

  const title = item?.title ?? assignment.title;

  const messages = buildAssignmentMessages({
    itemNumber: item?.itemNumber ?? assignment.assignmentNumber ?? null,
    title,
    durationMinutes: item?.durationMinutes ?? assignment.durationMinutes ?? null,
    context: item?.context ?? assignment.context ?? null,
    description: item?.description ?? null,
    reference: item?.reference ?? assignment.reference ?? null,
    lesson: item?.lesson ?? null,
    requiresAssistant: item?.requiresAssistant ?? requiresAssistant(title),
    weekLabel,
    primaryName,
    assistantName,
  });

  return {
    primaryMessage: messages.primaryFirstNotice,
    assistantMessage: messages.companionFirstNotice,
    reminderMessage: messages.reminder,
    warnings: messages.warnings,
  };
}
