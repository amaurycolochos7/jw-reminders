import { prisma, Prisma } from "@jw-reminders/database";
import {
  renderMessage,
  assembleMessageVariables,
  buildInitialAssignmentsList,
  buildReminderAssignmentsList,
  groupDeliveries,
  ASSIGNMENT_TYPE_LABELS,
  formatDateSpanish,
  type MessagePart,
  type TemplateTypeKey,
} from "@jw-reminders/shared";

/**
 * SNAPSHOT congelado (Fase 4). Genera el mensaje final por persona a partir de
 * la PLANTILLA activa + el bloque {{listaAsignaciones}} generado, usando el
 * render único. Lo guarda en las entregas (renderedMessage) para que el worker
 * lo envíe tal cual. Preview y snapshot usan estas MISMAS funciones ⇒ paridad.
 */

const MESES_ES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Tipos de mensaje ACTIVOS que se congelan desde plantilla.
const SNAPSHOTTABLE_TYPES = new Set(["INITIAL_NOTICE", "SEVEN_DAYS_BEFORE", "THREE_DAYS_BEFORE", "ONE_DAY_BEFORE", "CHANGE_NOTICE"]);

export const SNAPSHOT_INCLUDE = {
  automationPlan: true,
  assignment: { include: { meetingWeek: { include: { monthlySchedule: true } }, assigned: true, companion: true, programItem: true } },
  publisher: true,
} satisfies Prisma.ReminderDeliveryInclude;

export type FullDelivery = Prisma.ReminderDeliveryGetPayload<{ include: typeof SNAPSHOT_INCLUDE }>;

function personDisplayName(p?: { displayName: string | null; fullName: string } | null): string {
  return p ? (p.displayName || p.fullName) : "";
}

function deliveryToMessagePart(d: FullDelivery): MessagePart {
  const a = d.assignment;
  return {
    sortOrder: a.programItem?.sortOrder ?? a.assignmentNumber,
    pointNumber: a.programItem?.itemNumber ?? null,
    sectionLabel: ASSIGNMENT_TYPE_LABELS[a.assignmentType] || a.assignmentType,
    title: a.title,
    durationMinutes: a.durationMinutes,
    isApplyYourself: a.section === "APPLY_YOURSELF",
    recipientRole: d.recipientRole,
    companionName: personDisplayName(a.companion) || null,
    assignedName: personDisplayName(a.assigned) || null,
  };
}

function monthNameFor(d: FullDelivery): string {
  const date = d.assignment.meetingWeek.meetingDate;
  const local = d.assignment.meetingWeek.meetingDateLocal;
  const idx = local ? Number(local.slice(5, 7)) - 1 : date.getUTCMonth();
  return MESES_ES_LOWER[idx] ?? MESES_ES_LOWER[date.getUTCMonth()];
}

async function getCongregationName(): Promise<string> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: "CONGREGATION_NAME" } });
  return cfg?.value || "";
}

/** Plantilla activa + su versión activa para un tipo. null si no hay activa. */
async function getActiveTemplateVersion(type: string) {
  const tpl = await prisma.jwMessageTemplate.findFirst({ where: { type, isActive: true } });
  if (!tpl) return null;
  const active = await prisma.messageTemplateVersion.findUnique({
    where: { templateId_version: { templateId: tpl.id, version: tpl.activeVersion } },
  });
  const version = active ?? (await prisma.messageTemplateVersion.findFirst({ where: { templateId: tpl.id }, orderBy: { version: "desc" } }));
  return { templateId: tpl.id, versionId: version?.id ?? null, body: version?.body ?? tpl.body };
}

export interface FrozenRender {
  renderedMessage: string;
  renderedVariables: Record<string, string>;
  templateId: string;
  templateVersionId: string | null;
  templateType: string;
  warnings: string[];
}

/**
 * Renderiza (SIN guardar) el mensaje final de un grupo de entregas hermanas
 * (misma persona + semana/mes + tipo). Es el núcleo compartido por preview,
 * congelado y regeneración. Devuelve null si el tipo no es "congelable" o no hay
 * plantilla activa (el worker caería a su render legacy).
 */
export async function renderFrozenForGroup(group: FullDelivery[], congregationName?: string): Promise<FrozenRender | null> {
  const first = group[0];
  const type = first.reminderType as string;
  if (!SNAPSHOTTABLE_TYPES.has(type)) return null;

  const tv = await getActiveTemplateVersion(type);
  if (!tv) return null;

  const congregation = congregationName ?? (await getCongregationName());
  const person = personDisplayName(first.publisher);

  let variables: Record<string, string>;
  if (type === "INITIAL_NOTICE") {
    const items = group.map((d) => ({
      ...deliveryToMessagePart(d),
      meetingDateText: formatDateSpanish(d.assignment.meetingWeek.meetingDate),
      sortDate: d.assignment.meetingWeek.meetingDateLocal || d.assignment.meetingWeek.meetingDate.toISOString().slice(0, 10),
    }));
    const lista = buildInitialAssignmentsList(items, { showDuration: false });
    variables = assembleMessageVariables({ personName: person, congregationName: congregation, listaAsignaciones: lista, monthName: monthNameFor(first) });
  } else {
    const week = first.assignment.meetingWeek;
    const parts = group.map(deliveryToMessagePart);
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

  const r = renderMessage(tv.body, variables, { templateType: type as TemplateTypeKey });
  return {
    renderedMessage: r.renderedMessage,
    renderedVariables: variables,
    templateId: tv.templateId,
    templateVersionId: tv.versionId,
    templateType: type,
    warnings: r.warnings,
  };
}

/** Recalcula el render del grupo al que pertenece una entrega (para PREVIEW). */
export async function previewDeliveryFrozen(deliveryId: string): Promise<FrozenRender | null> {
  const d = await prisma.reminderDelivery.findUnique({ where: { id: deliveryId }, include: SNAPSHOT_INCLUDE });
  if (!d) return null;
  const siblings = await loadGroupSiblings(d);
  return renderFrozenForGroup(siblings);
}

/** Carga las entregas hermanas del mismo grupo (misma persona/semana-o-mes/tipo). */
async function loadGroupSiblings(d: FullDelivery): Promise<FullDelivery[]> {
  if (d.reminderType === "INITIAL_NOTICE") {
    const monthlyId = d.assignment.meetingWeek.monthlyScheduleId;
    const candidates = await prisma.reminderDelivery.findMany({
      where: {
        publisherId: d.publisherId,
        reminderType: "INITIAL_NOTICE",
        assignment: monthlyId ? { meetingWeek: { monthlyScheduleId: monthlyId } } : { meetingWeekId: d.assignment.meetingWeekId },
      },
      include: SNAPSHOT_INCLUDE,
    });
    return candidates.length ? candidates : [d];
  }
  const candidates = await prisma.reminderDelivery.findMany({
    where: { publisherId: d.publisherId, reminderType: d.reminderType, assignment: { meetingWeekId: d.assignment.meetingWeekId } },
    include: SNAPSHOT_INCLUDE,
  });
  return candidates.length ? candidates : [d];
}

/**
 * GENERA y CONGELA snapshots para un alcance (mes o semana), creando un
 * MessageBatch en estado DRAFT (revisión). Solo congela entregas aún sin
 * snapshot (renderedMessage null) y en estado PENDING/DRAFT. No envía nada.
 */
export async function generateSnapshots(scope: {
  reminderType: string;
  monthlyScheduleId?: string;
  meetingWeekId?: string;
  periodLabel?: string;
  createdBy?: string;
}) {
  const where: Prisma.ReminderDeliveryWhereInput = {
    reminderType: scope.reminderType as any,
    renderedMessage: null,
    status: { in: ["PENDING", "DRAFT"] as any },
    ...(scope.monthlyScheduleId ? { assignment: { meetingWeek: { monthlyScheduleId: scope.monthlyScheduleId } } } : {}),
    ...(scope.meetingWeekId ? { assignment: { meetingWeekId: scope.meetingWeekId } } : {}),
  };
  const deliveries = await prisma.reminderDelivery.findMany({ where, include: SNAPSHOT_INCLUDE });
  if (deliveries.length === 0) return { batchId: null, groups: 0, frozen: 0, skipped: 0 };

  const batch = await prisma.messageBatch.create({
    data: {
      type: scope.reminderType,
      monthlyScheduleId: scope.monthlyScheduleId,
      meetingWeekId: scope.meetingWeekId,
      periodLabel: scope.periodLabel,
      status: "DRAFT",
      createdBy: scope.createdBy,
    },
  });

  const congregationName = await getCongregationName();
  const groups = groupDeliveries(deliveries);
  let frozen = 0;
  let skipped = 0;

  for (const group of groups) {
    const render = await renderFrozenForGroup(group, congregationName);
    if (!render) { skipped += group.length; continue; }
    await prisma.reminderDelivery.updateMany({
      where: { id: { in: group.map((d) => d.id) } },
      data: {
        renderedMessage: render.renderedMessage,
        renderedVariables: render.renderedVariables as Prisma.InputJsonValue,
        templateId: render.templateId,
        templateVersionId: render.templateVersionId,
        sourceType: "TEMPLATE",
        manuallyEdited: false,
        batchId: batch.id,
        status: "DRAFT",
      },
    });
    frozen += group.length;
  }

  return { batchId: batch.id, groups: groups.length, frozen, skipped };
}

/** Edita el mensaje FINAL de una entrega (y sus hermanas del grupo). */
export async function editFinalMessage(deliveryId: string, text: string) {
  const d = await prisma.reminderDelivery.findUnique({ where: { id: deliveryId }, include: SNAPSHOT_INCLUDE });
  if (!d) throw new Error("Entrega no encontrada");
  const siblings = await loadGroupSiblings(d);
  await prisma.reminderDelivery.updateMany({
    where: { id: { in: siblings.map((s) => s.id) } },
    data: { renderedMessage: text, manuallyEdited: true, editedAt: new Date(), sourceType: "MANUAL_EDIT" },
  });
  return { updated: siblings.length };
}

/** Regenera el mensaje final desde la plantilla ACTIVA actual (descarta edición). */
export async function regenerateFromTemplate(deliveryId: string) {
  const d = await prisma.reminderDelivery.findUnique({ where: { id: deliveryId }, include: SNAPSHOT_INCLUDE });
  if (!d) throw new Error("Entrega no encontrada");
  const siblings = await loadGroupSiblings(d);
  const render = await renderFrozenForGroup(siblings);
  if (!render) throw new Error("No hay plantilla activa para regenerar este tipo de mensaje");
  await prisma.reminderDelivery.updateMany({
    where: { id: { in: siblings.map((s) => s.id) } },
    data: {
      renderedMessage: render.renderedMessage,
      renderedVariables: render.renderedVariables as Prisma.InputJsonValue,
      templateId: render.templateId,
      templateVersionId: render.templateVersionId,
      manuallyEdited: false,
      regeneratedAt: new Date(),
      sourceType: "REGENERATED_TEMPLATE",
    },
  });
  return { updated: siblings.length, renderedMessage: render.renderedMessage };
}

/** Aprueba un batch: DRAFT → READY en sus entregas (listas para el worker). */
export async function approveBatch(batchId: string) {
  // Guard: no se puede aprobar si hay entregas sin snapshot (renderedMessage vacío).
  const missing = await prisma.reminderDelivery.count({
    where: { batchId, status: "DRAFT", renderedMessage: null },
  });
  if (missing > 0) {
    throw new Error(`No se puede aprobar: ${missing} mensaje(s) sin renderedMessage. Regenera o corrige antes de aprobar.`);
  }
  const updated = await prisma.reminderDelivery.updateMany({
    where: { batchId, status: "DRAFT", renderedMessage: { not: null } },
    data: { status: "READY" },
  });
  await prisma.messageBatch.update({ where: { id: batchId }, data: { status: "APPROVED", approvedAt: new Date() } });
  return { approved: updated.count };
}
