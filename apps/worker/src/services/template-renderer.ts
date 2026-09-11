import { prisma } from "@jw-reminders/database";
import {
  renderMessage,
  parseSpintax,
  assembleMessageVariables,
  buildReminderAssignmentsList,
  buildInitialAssignmentsList,
  ASSIGNMENT_TYPE_LABELS,
  formatDateSpanish,
  typeNeedsCompanion,
  type MessagePart,
  type TemplateTypeKey,
} from "@jw-reminders/shared";

/**
 * Render de RESPALDO del worker (cuando una entrega no tiene snapshot congelado).
 *
 * IMPORTANTE: usa EXACTAMENTE el mismo motor que el snapshot congelado
 * (renderFrozenForGroup): plantilla ACTIVA + assembleMessageVariables +
 * renderMessage + spintax. Así el mensaje enviado usa tus plantillas y variables
 * ({{nombre}}, {{listaAsignaciones}}, {{mes}}, {{fecha}}, {{hora}}) igual que el
 * preview y el flujo de snapshots. Antes usaba variables con otros nombres
 * (assignedName, assignmentTitle…) que NO existían en las plantillas, por lo que
 * salían literales sin resolver.
 */

const MESES_ES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Tipos de mensaje que se renderizan desde plantilla (igual que el snapshot).
const TEMPLATABLE_TYPES = new Set([
  "INITIAL_NOTICE", "SEVEN_DAYS_BEFORE", "THREE_DAYS_BEFORE", "ONE_DAY_BEFORE", "CHANGE_NOTICE",
]);

function personName(p?: { displayName: string | null; fullName: string } | null): string {
  return p ? (p.displayName || p.fullName) : "";
}

/** Cuerpo de la versión ACTIVA de la plantilla (fallback al body base). null si no hay plantilla activa. */
async function getActiveTemplateBody(type: string): Promise<string | null> {
  const tpl = await prisma.jwMessageTemplate.findFirst({ where: { type, isActive: true } });
  if (!tpl) return null;
  const active = await prisma.messageTemplateVersion
    .findUnique({ where: { templateId_version: { templateId: tpl.id, version: tpl.activeVersion } } })
    .catch(() => null);
  const version = active ?? (await prisma.messageTemplateVersion.findFirst({ where: { templateId: tpl.id }, orderBy: { version: "desc" } }));
  return version?.body ?? tpl.body;
}

function toPart(a: any, recipientRole: string): MessagePart {
  return {
    sortOrder: a.programItem?.sortOrder ?? a.assignmentNumber,
    pointNumber: a.programItem?.itemNumber ?? null,
    sectionLabel: ASSIGNMENT_TYPE_LABELS[a.assignmentType as keyof typeof ASSIGNMENT_TYPE_LABELS] || a.assignmentType,
    title: a.title,
    durationMinutes: a.durationMinutes,
    isApplyYourself: a.section === "APPLY_YOURSELF" && typeNeedsCompanion(a.assignmentType),
    recipientRole: recipientRole as MessagePart["recipientRole"],
    companionName: personName(a.companion) || null,
    assignedName: personName(a.assigned) || null,
  };
}

/**
 * Renderiza el mensaje final de un grupo de entregas hermanas (misma persona +
 * semana/mes + tipo) DESDE LA PLANTILLA ACTIVA. Devuelve null si el tipo no es
 * plantillable o no hay plantilla activa (el caller cae a su render hardcodeado).
 */
export async function renderFromTemplate(group: any[]): Promise<string | null> {
  if (!group || group.length === 0) return null;
  const first = group[0];
  const type = (first.reminderType || first.reminderDay) as string;
  if (!TEMPLATABLE_TYPES.has(type)) return null;

  const body = await getActiveTemplateBody(type);
  if (!body) return null;

  const week = first.assignment.meetingWeek;
  const person = personName(first.publisher);
  const congregation = week.congregationName || "";

  let variables: Record<string, string>;
  if (type === "INITIAL_NOTICE") {
    const items = group.map((d) => ({
      ...toPart(d.assignment, d.recipientRole),
      meetingDateText: formatDateSpanish(d.assignment.meetingWeek.meetingDate),
      sortDate: d.assignment.meetingWeek.meetingDateLocal || d.assignment.meetingWeek.meetingDate.toISOString().slice(0, 10),
    }));
    const idx = week.meetingDateLocal ? Number(week.meetingDateLocal.slice(5, 7)) - 1 : week.meetingDate.getUTCMonth();
    const lista = buildInitialAssignmentsList(items, { showDuration: false });
    variables = assembleMessageVariables({ personName: person, congregationName: congregation, listaAsignaciones: lista, monthName: MESES_ES_LOWER[idx] });
  } else {
    const parts = group.map((d) => toPart(d.assignment, d.recipientRole));
    const lista = buildReminderAssignmentsList({
      meetingDateText: formatDateSpanish(week.meetingDate),
      meetingTimeText: week.meetingTime,
      parts,
      showTime: false,
      showDuration: false,
    });
    variables = assembleMessageVariables({
      personName: person,
      congregationName: congregation,
      listaAsignaciones: lista,
      meetingDateText: formatDateSpanish(week.meetingDate),
      meetingTimeText: week.meetingTime,
    });
  }

  const r = renderMessage(body, variables, { templateType: type as TemplateTypeKey });
  // Resolver spintax ahora (cada envío único). El worker envía el texto tal cual.
  return parseSpintax(r.renderedMessage);
}

/**
 * Render de una sola entrega (avisos especiales / grupos de 1 parte). Usa la
 * plantilla; si no hay plantilla para el tipo, cae a un texto mínimo.
 */
export async function renderReminderMessage(reminder: any): Promise<string> {
  const fromTemplate = await renderFromTemplate([reminder]);
  if (fromTemplate) return fromTemplate;
  const { assignment } = reminder;
  return `Recordatorio: ${assignment.title} - ${formatDateSpanish(assignment.meetingWeek.meetingDate)}`;
}
