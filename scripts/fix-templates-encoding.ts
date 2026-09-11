/**
 * fix-templates-encoding.ts
 *
 * Migración: corrige plantillas con mojibake (encoding roto) o sin spintax.
 * También limpia el campo `variants` (dead feature) en JwMessageTemplate.
 *
 * Ejecución:
 *   npx tsx scripts/fix-templates-encoding.ts
 *
 * Seguridad:
 *   - NO borra versiones anteriores (las marca inactivas).
 *   - Crea una NUEVA versión con el body correcto y la marca activa.
 *   - Idempotente: si la versión activa ya tiene el spintax correcto, la salta.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Correct spintax bodies ─────────────────────────────────────────────────

const SPINTAX_BODIES: Record<string, string> = {
  INITIAL_NOTICE: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, esperamos que se encuentre bien.| 👋}

{Le compartimos|Le hacemos llegar|Aquí le dejamos} sus asignaciones para {las reuniones del mes de|el programa de} {{mes}}.

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|Contamos con su valiosa participación. ¡Éxito en su preparación!|Que Jehová le conceda sabiduría al preparar sus participaciones.}`,

  SEVEN_DAYS_BEFORE: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos|Solo le hacemos llegar un recordatorio de|Le compartimos un recordatorio sobre} {su asignación|su participación} para la próxima reunión:

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|Ánimo con su preparación, ¡le irá muy bien!|Contamos con su participación. ¡Muchas gracias!}`,

  THREE_DAYS_BEFORE: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos que su asignación es en unos días:|Solo un recordatorio amable, su participación es pronto:|Ya falta poco para su asignación:}

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|¡Ánimo con los últimos detalles de su preparación!|Sabemos que lo hará muy bien. ¡Muchas gracias por su esfuerzo!}`,

  ONE_DAY_BEFORE: `{Hola|Buenos días|Saludos} *{{nombre}}*{.|, ¿cómo está?| 👋}

{Le recordamos que mañana tiene su asignación:|Solo un recordatorio, mañana es su participación:|Ya casi es la hora, mañana tiene su asignación:}

{{listaAsignaciones}}

{Que Jehová bendiga su esfuerzo y preparación al presentar esta participación.|¡Mucho éxito mañana! Sabemos que hará un excelente trabajo.|Estamos seguros de que Jehová bendecirá su preparación. ¡Ánimo!}`,

  CHANGE_NOTICE: `{Hola|Buenos días|Saludos} *{{nombre}}*{.| 👋}

{Hubo un cambio en su asignación:|Le informamos que su asignación fue actualizada:|Le notificamos un ajuste en su participación:}

{{listaAsignaciones}}

{Disculpe las molestias.|Agradecemos su comprensión.|Gracias por su flexibilidad ante este cambio.}`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Detects mojibake / corrupted encoding in a body string. */
function hasMojibake(body: string): boolean {
  // Double question marks replacing unicode chars (UTF-8 decoded as latin1/ascii)
  if (/\?\?/.test(body)) return true;
  // Common corrupted words from this project's Spanish content
  if (/Jehov\?\?|pr\?\?ximas|anticipaci\?\?n|asignaci\?\?n|preparaci\?\?n|participaci\?\?n/.test(body)) return true;
  // Replacement character (U+FFFD)
  if (/\uFFFD/.test(body)) return true;
  // Garbled multi-byte sequences (common mojibake patterns like Ã¡, Ã©, Ã³, etc.)
  if (/Ã[¡©­³º±]/.test(body)) return true;
  return false;
}

function hasSpintax(body: string): boolean {
  return /\{[^{}]*\|[^{}]*\}/.test(body);
}

function extractVariableNames(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu)) found.add(m[1]);
  return [...found];
}

/** Returns true if the current body already matches the expected spintax exactly. */
function isAlreadyCorrect(currentBody: string, expectedBody: string): boolean {
  return currentBody.trim() === expectedBody.trim();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  fix-templates-encoding: corrige mojibake + spintax     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  let fixed = 0;
  let skipped = 0;

  for (const [type, correctBody] of Object.entries(SPINTAX_BODIES)) {
    const tpl = await prisma.jwMessageTemplate.findUnique({ where: { type } });
    if (!tpl) {
      console.log(`⏭  ${type}: no existe en DB, saltando`);
      skipped++;
      continue;
    }

    // Get current active version body
    const activeVersion = await prisma.messageTemplateVersion.findUnique({
      where: { templateId_version: { templateId: tpl.id, version: tpl.activeVersion } },
    });
    const currentBody = activeVersion?.body ?? tpl.body;

    // Idempotency: if already correct, only clear variants if needed
    if (isAlreadyCorrect(currentBody, correctBody)) {
      console.log(`✓  ${type}: v${tpl.activeVersion} ya es correcta`);
      // Still clear variants if present
      if (tpl.variants !== null) {
        await prisma.jwMessageTemplate.update({
          where: { id: tpl.id },
          data: { variants: Prisma.DbNull },
        });
        console.log(`   └─ variants limpiado`);
      }
      skipped++;
      continue;
    }

    // Determine if we need to fix
    const mojibake = hasMojibake(currentBody);
    const noSpintax = !hasSpintax(currentBody);

    if (!mojibake && !noSpintax) {
      // Has spintax but doesn't match exactly — might be a valid custom edit.
      // Still fix it since the task says to ensure correct bodies.
      console.log(`⚠  ${type}: tiene spintax pero difiere del body canónico, actualizando...`);
    } else {
      const reasons: string[] = [];
      if (mojibake) reasons.push("mojibake detectado");
      if (noSpintax) reasons.push("sin spintax");
      console.log(`🔧 ${type}: ${reasons.join(" + ")}, creando nueva versión...`);
    }

    // Find highest existing version number
    const lastVersion = await prisma.messageTemplateVersion.findFirst({
      where: { templateId: tpl.id },
      orderBy: { version: "desc" },
    });
    const newVersionNum = (lastVersion?.version ?? tpl.activeVersion) + 1;
    const variablesSchema = extractVariableNames(correctBody);

    // Deactivate all existing versions
    await prisma.messageTemplateVersion.updateMany({
      where: { templateId: tpl.id },
      data: { isActive: false },
    });

    // Create new active version
    await prisma.messageTemplateVersion.create({
      data: {
        templateId: tpl.id,
        version: newVersionNum,
        body: correctBody,
        variablesSchema,
        isActive: true,
        createdBy: "migration:fix-encoding",
      },
    });

    // Update template: body, activeVersion, and clear variants
    await prisma.jwMessageTemplate.update({
      where: { id: tpl.id },
      data: {
        body: correctBody,
        activeVersion: newVersionNum,
        variants: Prisma.DbNull,
      },
    });

    console.log(`   ✅ v${newVersionNum} creada y activada (variables: ${variablesSchema.join(", ")})`);
    fixed++;
  }

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`Resultado: ${fixed} corregidas, ${skipped} sin cambios.`);
  console.log(`Mensajes ya congelados (renderedMessage) NO se modifican.`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
