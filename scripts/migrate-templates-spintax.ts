/**
 * migrate-templates-spintax.ts
 *
 * Script de migración para producción: crea nuevas versiones activas de las
 * plantillas existentes con spintax para variación anti-baneo.
 *
 * Ejecución:
 *   npx tsx scripts/migrate-templates-spintax.ts
 *
 * Seguridad:
 *   - NO sobrescribe versiones anteriores.
 *   - Crea una NUEVA versión con el body actualizado y la marca como activa.
 *   - Si la plantilla ya tiene spintax (detecta `{` con `|`), la salta.
 *   - Idempotente: ejecutar varias veces no duplica versiones.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

function hasSpintax(body: string): boolean {
  return /\{[^{}]*\|[^{}]*\}/.test(body);
}

function extractVariableNames(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\p{L}\p{N}_]+)\s*\}\}/gu)) found.add(m[1]);
  return [...found];
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Migración: agregar spintax a plantillas activas    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  for (const [type, newBody] of Object.entries(SPINTAX_BODIES)) {
    const tpl = await prisma.jwMessageTemplate.findUnique({ where: { type } });
    if (!tpl) {
      console.log(`⏭  ${type}: no existe en DB (se creará con el seed)`);
      continue;
    }

    // Verificar si la versión activa ya tiene spintax
    const activeVersion = await prisma.messageTemplateVersion.findUnique({
      where: { templateId_version: { templateId: tpl.id, version: tpl.activeVersion } },
    });
    const currentBody = activeVersion?.body ?? tpl.body;
    if (hasSpintax(currentBody)) {
      console.log(`✓  ${type}: ya tiene spintax (v${tpl.activeVersion}), saltando`);
      continue;
    }

    // Crear nueva versión
    const lastVersion = await prisma.messageTemplateVersion.findFirst({
      where: { templateId: tpl.id },
      orderBy: { version: "desc" },
    });
    const newVersionNum = (lastVersion?.version ?? tpl.activeVersion) + 1;
    const variablesSchema = extractVariableNames(newBody);

    // Desactivar versiones anteriores
    await prisma.messageTemplateVersion.updateMany({
      where: { templateId: tpl.id },
      data: { isActive: false },
    });

    // Crear nueva versión activa
    await prisma.messageTemplateVersion.create({
      data: {
        templateId: tpl.id,
        version: newVersionNum,
        body: newBody,
        variablesSchema,
        isActive: true,
        createdBy: "migration:spintax",
      },
    });

    // Actualizar plantilla principal
    await prisma.jwMessageTemplate.update({
      where: { id: tpl.id },
      data: { body: newBody, activeVersion: newVersionNum },
    });

    console.log(`✅ ${type}: nueva versión v${newVersionNum} con spintax creada y activada`);
  }

  console.log("\n✓ Migración completada. Todas las plantillas activas ahora tienen spintax.");
  console.log("  Los mensajes ya congelados (renderedMessage existente) NO se modifican.");
  console.log("  Solo los nuevos snapshots usarán las variantes.");
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
