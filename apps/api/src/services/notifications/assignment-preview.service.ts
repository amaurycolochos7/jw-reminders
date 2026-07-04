import { prisma } from "@jw-reminders/database";
import {
  renderMessage,
  assembleMessageVariables,
  buildInitialAssignmentsList,
  buildReminderAssignmentsList,
  ASSIGNMENT_TYPE_LABELS,
  formatDateSpanish,
  type MessagePart,
} from "@jw-reminders/shared";

export interface AssignmentMessagePreview {
  primaryMessage: string | null;
  assistantMessage: string | null;
  reminderMessage: string | null;
  warnings: string[];
}

const MESES_ES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function personName(p?: { displayName: string | null; fullName: string } | null): string {
  return p ? (p.displayName || p.fullName) : "";
}

async function activeBody(type: string): Promise<string | null> {
  const t = await prisma.jwMessageTemplate.findFirst({ where: { type, isActive: true } });
  if (!t) return null;
  const v = await prisma.messageTemplateVersion.findUnique({ where: { templateId_version: { templateId: t.id, version: t.activeVersion } } });
  return v?.body ?? t.body;
}

/**
 * Vista previa de mensajes de una asignación usando el RENDER ÚNICO (misma
 * fuente que el envío real). Reemplaza al renderizador emoji obsoleto: ya NO hay
 * dos formatos distintos. Es un preview aproximado por-asignación; el mensaje
 * REAL agrupado y congelado se revisa en "Mensajes generados".
 */
export async function getAssignmentMessagePreview(assignmentId: string): Promise<AssignmentMessagePreview> {
  const a = await prisma.jwAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { meetingWeek: true, assigned: true, companion: true, programItem: true },
  });
  const week = a.meetingWeek;
  const congregationName = (await prisma.appConfig.findUnique({ where: { key: "CONGREGATION_NAME" } }))?.value || "";
  const meetingDateText = formatDateSpanish(week.meetingDate);
  const local = week.meetingDateLocal;
  const monthIndex = local ? Number(local.slice(5, 7)) - 1 : week.meetingDate.getUTCMonth();
  const monthName = MESES_ES_LOWER[monthIndex] ?? MESES_ES_LOWER[week.meetingDate.getUTCMonth()];

  const basePart = (role: "ASSIGNED" | "COMPANION"): MessagePart => ({
    sortOrder: a.programItem?.sortOrder ?? a.assignmentNumber,
    pointNumber: a.programItem?.itemNumber ?? null,
    sectionLabel: ASSIGNMENT_TYPE_LABELS[a.assignmentType] || a.assignmentType,
    title: a.title,
    durationMinutes: a.durationMinutes,
    isApplyYourself: a.section === "APPLY_YOURSELF",
    recipientRole: role,
    companionName: personName(a.companion) || null,
    assignedName: personName(a.assigned) || null,
  });

  const warnings: string[] = [];
  const initialBody = await activeBody("INITIAL_NOTICE");
  const reminderBody = await activeBody("SEVEN_DAYS_BEFORE");
  if (!initialBody || !reminderBody) warnings.push("Falta plantilla activa (INITIAL_NOTICE / SEVEN_DAYS_BEFORE).");

  const renderInitial = (part: MessagePart, name: string) => {
    if (!initialBody || !name) return null;
    const lista = buildInitialAssignmentsList([{ ...part, meetingDateText, sortDate: local || week.meetingDate.toISOString().slice(0, 10) }], { showDuration: false });
    return renderMessage(initialBody, assembleMessageVariables({ personName: name, congregationName, listaAsignaciones: lista, monthName }), { templateType: "INITIAL_NOTICE" }).renderedMessage;
  };

  const primaryName = personName(a.assigned);
  const companionNameStr = personName(a.companion);

  const primaryMessage = renderInitial(basePart("ASSIGNED"), primaryName);
  const assistantMessage = companionNameStr ? renderInitial(basePart("COMPANION"), companionNameStr) : null;

  const reminderMessage = reminderBody && primaryName
    ? renderMessage(
        reminderBody,
        assembleMessageVariables({
          personName: primaryName,
          congregationName,
          listaAsignaciones: buildReminderAssignmentsList({ meetingDateText, meetingTimeText: week.meetingTime, parts: [basePart("ASSIGNED")], showTime: false, showDuration: false }),
          meetingDateText,
          meetingTimeText: week.meetingTime,
        }),
        { templateType: "SEVEN_DAYS_BEFORE" },
      ).renderedMessage
    : null;

  if (!primaryName) warnings.push("La asignación no tiene participante principal.");

  return { primaryMessage, assistantMessage, reminderMessage, warnings };
}
