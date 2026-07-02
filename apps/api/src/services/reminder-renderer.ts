import { prisma } from "@jw-reminders/database";
import {
  renderTemplate,
  ASSIGNMENT_TYPE_LABELS,
  ROOM_LABELS,
  formatDateSpanish,
  formatMeetingTime,
  buildGroupedPersonMessage,
  buildMonthlyInitialMessage,
  type MessagePart,
} from "@jw-reminders/shared";

const MESES_ES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function personDisplayName(p?: { displayName?: string | null; fullName?: string | null } | null): string {
  return p ? (p.displayName || p.fullName || "") : "";
}

/** Mapea una asignación (con su rol de destinatario) a la parte rica del mensaje. */
function assignmentToMessagePart(assignment: any, recipientRole: "ASSIGNED" | "COMPANION"): MessagePart {
  return {
    sortOrder: assignment.programItem?.sortOrder ?? assignment.assignmentNumber,
    pointNumber: assignment.programItem?.itemNumber ?? null,
    sectionLabel: ASSIGNMENT_TYPE_LABELS[assignment.assignmentType] || assignment.assignmentType,
    title: assignment.title,
    durationMinutes: assignment.durationMinutes,
    isApplyYourself: assignment.section === "APPLY_YOURSELF",
    recipientRole,
    companionName: personDisplayName(assignment.companion) || null,
    assignedName: personDisplayName(assignment.assigned) || null,
  };
}

/**
 * Renderiza el texto de un recordatorio para el PREVIEW del panel.
 *
 * Refleja exactamente lo que enviaría el worker para los cuatro mensajes activos
 * (aviso inicial, 7/3/1 días) usando el generador rico y uniforme. Los avisos
 * especiales (cambio/cancelación) conservan su plantilla editable.
 *
 * Nota: el aviso inicial real agrupa TODO el mes; en el preview de una sola
 * entrega se muestra su fecha (una sección), con idéntico formato.
 */
export async function renderReminderMessage(reminder: any): Promise<string> {
  const { assignment, publisher } = reminder;
  const reminderType = reminder.reminderType || reminder.reminderDay;
  const recipientRole: "ASSIGNED" | "COMPANION" =
    reminder.recipientRole || (publisher?.id === assignment?.companionPublisherId ? "COMPANION" : "ASSIGNED");

  const personName = personDisplayName(publisher) || personDisplayName(assignment?.assigned);
  const meetingDate: Date = assignment.meetingWeek.meetingDate;

  // Avisos especiales: conservan la plantilla editable en base de datos.
  if (reminderType === "CHANGE_NOTICE" || reminderType === "CANCELLATION_NOTICE") {
    const template = await prisma.jwMessageTemplate.findUnique({ where: { type: reminderType } });
    if (!template) {
      return `Recordatorio: ${assignment.title} - ${formatDateSpanish(meetingDate)}`;
    }
    const variables: Record<string, string> = {
      assignedName: personDisplayName(assignment.assigned),
      companionName: personDisplayName(assignment.companion),
      assignmentTitle: assignment.title,
      assignmentNumber: String(assignment.assignmentNumber),
      assignmentType: ASSIGNMENT_TYPE_LABELS[assignment.assignmentType] || assignment.assignmentType,
      meetingDate: formatDateSpanish(meetingDate),
      meetingTime: formatMeetingTime(assignment.meetingWeek.meetingTime) || assignment.meetingWeek.meetingTime,
      room: ROOM_LABELS[assignment.room] || assignment.room,
      context: assignment.context || "",
      reference: assignment.reference || "",
      duration: assignment.durationMinutes ? `${assignment.durationMinutes} min` : "",
      congregationName: assignment.meetingWeek.congregationName || "",
      notes: assignment.notes || "",
    };
    return renderTemplate(template.body, variables);
  }

  const part = assignmentToMessagePart(assignment, recipientRole);

  // Aviso inicial (SIN hora).
  if (reminderType === "INITIAL_NOTICE") {
    const local: string | null = assignment.meetingWeek.meetingDateLocal;
    const monthIndex = local ? Number(local.slice(5, 7)) - 1 : meetingDate.getUTCMonth();
    return buildMonthlyInitialMessage({
      personName,
      monthName: MESES_ES_LOWER[monthIndex] ?? MESES_ES_LOWER[meetingDate.getUTCMonth()],
      items: [
        {
          ...part,
          meetingDateText: formatDateSpanish(meetingDate),
          sortDate: local || meetingDate.toISOString().slice(0, 10),
        },
      ],
    });
  }

  // Recordatorios 7/3/1 días. El de 7 días omite hora y duración.
  const isSevenDay = reminderType === "SEVEN_DAYS_BEFORE";
  return buildGroupedPersonMessage({
    personName,
    meetingDateText: formatDateSpanish(meetingDate),
    meetingTimeText: assignment.meetingWeek.meetingTime,
    parts: [part],
    showTime: !isSevenDay,
    showDuration: !isSevenDay,
  });
}
