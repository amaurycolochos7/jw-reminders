import { prisma } from "@jw-reminders/database";
import { renderTemplate, ASSIGNMENT_TYPE_LABELS, ROOM_LABELS, formatDateSpanish, formatMeetingTime } from "@jw-reminders/shared";

/**
 * Elige el cuerpo de la plantilla: si tiene variantes, toma una al azar
 * (incluyendo el body principal). Anti-ban: cada mensaje es diferente.
 */
function pickTemplateBody(template: { body: string; variants?: unknown }): string {
  const variants = Array.isArray(template.variants) ? template.variants.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  if (variants.length === 0) return template.body;
  // Pool: body principal + variantes
  const pool = [template.body, ...variants];
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function renderReminderMessage(reminder: any): Promise<string> {
  const { assignment, publisher } = reminder;
  const isCompanion = publisher.id === assignment.companionPublisherId;
  const reminderType = reminder.reminderType || reminder.reminderDay;

  // Determine template type
  let templateType = reminderType;
  if (reminderType === "INITIAL_NOTICE") {
    templateType = isCompanion ? "INITIAL_NOTICE_COMPANION" : "INITIAL_NOTICE_ASSIGNED";
  }

  const template = await prisma.jwMessageTemplate.findUnique({
    where: { type: templateType },
  });

  if (!template) {
    return `Recordatorio: ${assignment.title} - ${formatDateSpanish(assignment.meetingWeek.meetingDate)}`;
  }

  const variables: Record<string, string> = {
    assignedName: assignment.assigned?.displayName || assignment.assigned?.fullName || "",
    companionName: assignment.companion?.displayName || assignment.companion?.fullName || "",
    assignmentTitle: assignment.title,
    assignmentNumber: String(assignment.assignmentNumber),
    assignmentType: ASSIGNMENT_TYPE_LABELS[assignment.assignmentType] || assignment.assignmentType,
    meetingDate: formatDateSpanish(assignment.meetingWeek.meetingDate),
    meetingTime: formatMeetingTime(assignment.meetingWeek.meetingTime) || assignment.meetingWeek.meetingTime,
    room: ROOM_LABELS[assignment.room] || assignment.room,
    context: assignment.context || "",
    reference: assignment.reference || "",
    duration: assignment.durationMinutes ? `${assignment.durationMinutes} min` : "",
    congregationName: assignment.meetingWeek.congregationName || "",
    notes: assignment.notes || "",
  };

  // Elegir variante al azar y renderizar
  return renderTemplate(pickTemplateBody(template), variables);
}
