import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/** Extrae los nombres de variable {{var}} de un cuerpo (para variablesSchema). */
function extractVariableNames(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu)) found.add(m[1]);
  return [...found];
}

/**
 * PLANTILLAS ACTIVAS (reestructuración mensajería robusta).
 *
 * Son la FUENTE REAL del texto que se envía. Usan el vocabulario del render
 * único (`@jw-reminders/shared` renderMessage): {{nombre}}, {{mes}},
 * {{listaAsignaciones}}, etc. El bloque {{listaAsignaciones}} lo genera el
 * sistema (agrupando las partes de la persona) y queda editable en el mensaje
 * final antes de enviar.
 *
 * Formato WhatsApp: los *asteriscos* son negritas reales; se conservan tal cual.
 */
const ACTIVE_TEMPLATES = [
  {
    type: "INITIAL_NOTICE",
    title: "Aviso inicial (mensual)",
    description:
      "Un solo mensaje por persona con TODAS sus asignaciones del mes, agrupadas. La lista se genera automáticamente y es editable antes de enviar.",
    body: `Hola *{{nombre}}*.

Le compartimos sus asignaciones para las reuniones del mes de {{mes}}.

{{listaAsignaciones}}

Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.`,
  },
  {
    type: "SEVEN_DAYS_BEFORE",
    title: "Recordatorio — 7 días antes",
    description: "Recordatorio de la(s) asignación(es) de la próxima reunión. Un mensaje por persona.",
    body: `Hola *{{nombre}}*.

Le recordamos su asignación para la próxima reunión:

{{listaAsignaciones}}

Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.`,
  },
  {
    type: "THREE_DAYS_BEFORE",
    title: "Recordatorio — 3 días antes",
    description: "Recordatorio de la(s) asignación(es) de la próxima reunión. Un mensaje por persona.",
    body: `Hola *{{nombre}}*.

Le recordamos que su asignación es en unos días:

{{listaAsignaciones}}

Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.`,
  },
  {
    type: "ONE_DAY_BEFORE",
    title: "Recordatorio — 1 día antes",
    description: "Recordatorio de la(s) asignación(es) de la reunión de mañana. Un mensaje por persona.",
    body: `Hola *{{nombre}}*.

Le recordamos que mañana tiene su asignación:

{{listaAsignaciones}}

Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.`,
  },
  {
    type: "CHANGE_NOTICE",
    title: "Cambio de asignación",
    description: "Aviso de que una asignación cambió. Se puede previsualizar y editar antes de enviar.",
    body: `Hola *{{nombre}}*.

Hubo un cambio en su asignación:

{{listaAsignaciones}}

Disculpe las molestias.`,
  },
];

/**
 * Tipos LEGACY que dejan de ser flujos activos. NO se borran (para no romper
 * referencias históricas), solo se marcan inactivos y quedan fuera del panel.
 *  - INITIAL_NOTICE_ASSIGNED / _COMPANION: reemplazados por INITIAL_NOTICE único.
 *  - CANCELLATION_NOTICE: cancelación desactivada por decisión de producto.
 *  - FOLLOW_UP / SEGUIMIENTO: seguimiento desactivado por decisión de producto.
 */
const LEGACY_TYPES = [
  "INITIAL_NOTICE_ASSIGNED",
  "INITIAL_NOTICE_COMPANION",
  "CANCELLATION_NOTICE",
  "SAME_DAY",
  "FOLLOW_UP",
  "SEGUIMIENTO",
];

async function ensureActiveTemplate(t: (typeof ACTIVE_TEMPLATES)[number]) {
  const variablesSchema = extractVariableNames(t.body);
  const existing = await prisma.jwMessageTemplate.findUnique({
    where: { type: t.type },
    include: { versions: true },
  });

  if (!existing) {
    const created = await prisma.jwMessageTemplate.create({
      data: { type: t.type, title: t.title, description: t.description, body: t.body, isActive: true, activeVersion: 1 },
    });
    await prisma.messageTemplateVersion.create({
      data: { templateId: created.id, version: 1, body: t.body, variablesSchema, isActive: true, createdBy: "seed" },
    });
    return `creada ${t.type}`;
  }

  // Existe. Si aún no tiene versiones, es un registro del modelo viejo: migramos
  // UNA vez al nuevo cuerpo/vocabulario (los cuerpos viejos de 7/3/1 nunca se
  // usaron para enviar, así que no se pierde nada funcional) y creamos v1.
  if (existing.versions.length === 0) {
    await prisma.jwMessageTemplate.update({
      where: { id: existing.id },
      data: { title: t.title, description: t.description, body: t.body, isActive: true, activeVersion: 1 },
    });
    await prisma.messageTemplateVersion.create({
      data: { templateId: existing.id, version: 1, body: t.body, variablesSchema, isActive: true, createdBy: "seed:migracion" },
    });
    return `migrada a v1 ${t.type}`;
  }

  // Ya tiene versiones (ediciones del panel): NO se sobrescribe. Solo aseguramos
  // que esté activa y con descripción.
  await prisma.jwMessageTemplate.update({
    where: { id: existing.id },
    data: { isActive: true, description: existing.description ?? t.description },
  });
  return `respetada ${t.type} (${existing.versions.length} versiones)`;
}

async function main() {
  await prisma.adminUser.upsert({
    where: { email: "admin" },
    update: {},
    create: { email: "admin", password: hashPassword("dorian123"), name: "Administrador" },
  });
  console.log("✓ Admin user ensured");

  for (const t of ACTIVE_TEMPLATES) {
    const msg = await ensureActiveTemplate(t);
    console.log(`  · ${msg}`);
  }
  console.log("✓ Plantillas activas aseguradas (con versión v1, ediciones respetadas)");

  const legacy = await prisma.jwMessageTemplate.updateMany({
    where: { type: { in: LEGACY_TYPES } },
    data: { isActive: false },
  });
  console.log(`✓ Plantillas legacy desactivadas: ${legacy.count}`);

  const defaults = [
    { key: "TIMEZONE", value: "America/Mexico_City" },
    { key: "REMINDER_SEND_HOUR", value: "9" },
    { key: "CONGREGATION_NAME", value: "" },
  ];
  for (const c of defaults) {
    await prisma.appConfig.upsert({ where: { key: c.key }, update: {}, create: c });
  }
  console.log("✓ Config por defecto asegurada");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
