import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

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
    body: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, esperamos que se encuentre bien.| 👋}

{Le compartimos|Le hacemos llegar|Aquí le dejamos} sus asignaciones para {las reuniones del mes de|el programa de} {{mes}}.

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|Contamos con su valiosa participación. ¡Éxito en su preparación!|Que Jehová le conceda sabiduría al preparar sus participaciones.}`,
  },
  {
    type: "SEVEN_DAYS_BEFORE",
    title: "Recordatorio — 7 días antes",
    description: "Recordatorio de la(s) asignación(es) de la próxima reunión. Un mensaje por persona.",
    body: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos|Solo le hacemos llegar un recordatorio de|Le compartimos un recordatorio sobre} {su asignación|su participación} para la próxima reunión:

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|Ánimo con su preparación, ¡le irá muy bien!|Contamos con su participación. ¡Muchas gracias!}`,
  },
  {
    type: "THREE_DAYS_BEFORE",
    title: "Recordatorio — 3 días antes",
    description: "Recordatorio de la(s) asignación(es) de la próxima reunión. Un mensaje por persona.",
    body: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos que su asignación es en unos días:|Solo un recordatorio amable, su participación es pronto:|Ya falta poco para su asignación:}

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|¡Ánimo con los últimos detalles de su preparación!|Sabemos que lo hará muy bien. ¡Muchas gracias por su esfuerzo!}`,
  },
  {
    type: "ONE_DAY_BEFORE",
    title: "Recordatorio — 1 día antes",
    description: "Recordatorio de la(s) asignación(es) de la reunión de mañana. Un mensaje por persona.",
    body: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos que mañana tiene su asignación:|Solo un recordatorio, mañana es su participación:|Ya casi es la hora, mañana tiene su asignación:}

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|¡Mucho éxito mañana! Sabemos que hará un excelente trabajo.|Estamos seguros de que Jehová bendecirá su preparación. ¡Ánimo!}`,
  },
  {
    type: "CHANGE_NOTICE",
    title: "Cambio de asignación",
    description: "Aviso de que una asignación cambió. Se puede previsualizar y editar antes de enviar.",
    body: `{Hola|Buenos días|Saludos} *{{nombre}}*{.| 👋}

{Hubo un cambio en su asignación:|Le informamos que su asignación fue actualizada:|Le notificamos un ajuste en su participación:}

{{listaAsignaciones}}

{Disculpe las molestias.|Agradecemos su comprensión.|Gracias por su flexibilidad ante este cambio.}`,
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

const RESEARCH_PROFILES = [
  {
    id: "general",
    name: "General",
    description: "Investigación bíblica general con Biblia, WOL y publicaciones locales.",
    promptRuleName: "system_prompt",
    defaultOutputType: null,
    defaultLevel: null,
    defaultDuration: null,
    reasoningEffort: null,
    forcePrecursorMatch: false,
    themeKey: "general",
    order: 0,
  },
  {
    id: "precursor",
    name: "Escuela de precursores",
    description: 'Análisis enfocado exclusivamente en el libro "Cumple completamente tu ministerio".',
    promptRuleName: "system_prompt_precursor",
    defaultOutputType: "comments",
    defaultLevel: "profundo",
    defaultDuration: "auto",
    reasoningEffort: "medium",
    forcePrecursorMatch: true,
    themeKey: "precursor",
    order: 1,
  },
];

const PRECURSOR_SYSTEM_PROMPT = `Eres un agente de investigación e instructor para la Escuela de precursores de los Testigos de Jehová. Tu única fuente de estudio es el libro "Cumple completamente tu ministerio" (2 Timoteo 4:5) y las citas bíblicas que ese libro referencia. No uses ni menciones ninguna otra publicación, artículo de La Atalaya, ni contenido general de WOL fuera de esta lección — si el usuario pide algo fuera de este libro, dilo con claridad y sugiere usar el perfil "General".

MODO POR DEFECTO: "precursor" — análisis profundo de la lección: qué enseña, cómo conecta con el ministerio de tiempo completo, y un comentario bien fundamentado listo para clase.

ANÁLISIS DE CITAS (obligatorio):
- Identifica la lección y el extracto exacto que corresponde a la pregunta (ya viene resuelto en [CONTEXTO DEL LIBRO DE LOS PRECURSORES] si hubo coincidencia).
- Explica qué principio bíblico o de ministerio enseña esa cita específica, no una generalidad.
- Conecta el principio con la aplicación práctica en el servicio de precursor (metas, constancia, técnicas de enseñanza, actitud, resistencia, etc. según corresponda a la lección).
- El comentario final debe sonar como una reflexión personal y madura de un precursor experimentado, no como un resumen del libro.

LENGUAJE OBLIGATORIO:
Usa lenguaje natural de Testigos de Jehová:
- Jehová, Jesucristo, la Biblia, la congregación, los hermanos, los publicadores, los precursores.
- La predicación, el ministerio, las reuniones, Vida y Ministerio, La Atalaya.
- Principios bíblicos, conciencia entrenada, buen juicio, aplicación personal.
- Reino de Dios, nueva personalidad, adoración pura, santificar el nombre de Jehová.

PROHIBIDO:
- "Dios te bendiga", "bendiciones" como cierre.
- "La iglesia", "el pastor", "culto", "servicio religioso".
- "Predicador" como sustituto de publicador.
- Frases emocionales tipo sermón evangélico.
- Lenguaje devocional exagerado o ambiguo.
- "Diosito", "energía", "vibrar", "manifestar".
- Lenguaje académico frío o de ensayo.
- Repetir la misma frase (como "esto nos enseña") en cada párrafo.

ANTI-REPETICIÓN:
- No uses la misma frase de transición más de una vez en toda la respuesta.
- Varía las construcciones: en vez de siempre "esto nos enseña", alterna con ideas directas, preguntas retóricas, ejemplos concretos, contrastes.
- El texto debe sonar como un hermano preparado hablando, no como un formulario.

FUENTES:
- Usa SOLO el contenido del libro de precursores y las citas bíblicas proporcionadas.
- No inventes fuentes ni contenido de publicaciones.
- No uses fuentes con status unresolved, ambiguous, invalid_reference o failed EXCEPTO para indicar que no se pudieron verificar.
- Si no hay fuente directa dentro del libro, dilo con claridad en vez de traer contenido de otra publicación.
- Toda cita bíblica que uses DEBE estar en las fuentes proporcionadas. No cites textos que no recibiste.

SEPARACIÓN DE CONOCIMIENTO:
- Si usas información de las fuentes verificadas, márcala como tal.
- Si usas razonamiento general basado en principios bíblicos conocidos (sin fuente específica proporcionada), indícalo como "razonamiento basado en principios bíblicos" — NO lo presentes como fuente verificada.

REGLA DE FIDELIDAD AL TEXTO:
- Cuando cites o presentes contenido de una fuente verificada, usa el texto EXACTO tal como fue proporcionado. No lo parafrasees, no lo resumas, no lo modifiques.
- Los sourceHighlights deben ser copias LITERALES del texto recibido.
- NUNCA inventes, modifiques o "mejores" el contenido de una publicación. El texto de la fuente es sagrado: se presenta tal cual.

FORMATO JSON:
Devuelve JSON estructurado. Incluye sourceHighlights con frases EXACTAS del texto de la fuente.`;

async function ensureResearchProfiles() {
  for (const p of RESEARCH_PROFILES) {
    await prisma.researchProfile.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
  }
  console.log(`✓ Perfiles de investigación asegurados (${RESEARCH_PROFILES.length})`);

  const existingPrecursorPrompt = await prisma.researchPromptRule.findFirst({
    where: { name: "system_prompt_precursor" },
  });
  if (!existingPrecursorPrompt) {
    await prisma.researchPromptRule.create({
      data: {
        name: "system_prompt_precursor",
        version: 1,
        content: PRECURSOR_SYSTEM_PROMPT,
        isActive: true,
        isProtected: true,
      },
    });
    console.log("✓ Prompt del perfil de precursores creado (v1)");
  } else {
    console.log("✓ Prompt del perfil de precursores respetado (ya existía)");
  }
}

async function main() {
  // Admin: NO se resetea si ya existe. Contraseña desde ADMIN_PASSWORD (bcrypt).
  // Si no existe admin y no hay ADMIN_PASSWORD, se genera una temporal y se imprime.
  const adminPassword = process.env.ADMIN_PASSWORD;
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: "admin" } });
  if (!existingAdmin) {
    const pw = adminPassword || randomBytes(9).toString("base64url");
    await prisma.adminUser.create({ data: { email: "admin", password: await bcrypt.hash(pw, 10), name: "Administrador" } });
    if (adminPassword) console.log("✓ Admin creado (contraseña desde ADMIN_PASSWORD)");
    else console.log(`⚠ Admin creado con contraseña TEMPORAL: ${pw}  → cámbiala o define ADMIN_PASSWORD y re-siembra.`);
  } else if (adminPassword) {
    await prisma.adminUser.update({ where: { id: existingAdmin.id }, data: { password: await bcrypt.hash(adminPassword, 10) } });
    console.log("✓ Admin: contraseña actualizada desde ADMIN_PASSWORD (bcrypt)");
  } else {
    console.log("✓ Admin ya existe (sin cambios)");
  }

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

  await ensureResearchProfiles();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
