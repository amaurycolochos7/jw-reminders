import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@jw-reminders/database";
import {
  renderMessage,
  validateTemplate,
  extractVariables,
  sampleVariables,
  TEMPLATE_VARIABLES,
  ACTIVE_TEMPLATE_TYPES,
  type TemplateTypeKey,
} from "@jw-reminders/shared";

const router = Router();

const ACTIVE = new Set<string>(ACTIVE_TEMPLATE_TYPES);

const updateSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** Lista de plantillas con metadatos para el panel. */
router.get("/", async (_req: Request, res: Response) => {
  const templates = await prisma.jwMessageTemplate.findMany({ orderBy: { type: "asc" } });
  res.json(
    templates.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      body: t.body,
      description: t.description,
      isActive: t.isActive,
      activeVersion: t.activeVersion,
      updatedAt: t.updatedAt,
      // ¿Esta plantilla afecta realmente el envío? (tipo activo + isActive)
      connectedToSend: t.isActive && ACTIVE.has(t.type),
      isLegacy: !ACTIVE.has(t.type),
    })),
  );
});

/** Catálogo oficial de variables (documentación para el editor). */
router.get("/variables", (_req: Request, res: Response) => {
  res.json(TEMPLATE_VARIABLES);
});

/** Historial de versiones de una plantilla. */
router.get("/:id/versions", async (req: Request<{ id: string }>, res: Response) => {
  const versions = await prisma.messageTemplateVersion.findMany({
    where: { templateId: req.params.id },
    orderBy: { version: "desc" },
  });
  res.json(versions);
});

/**
 * Preview con el RENDER ÚNICO del backend/shared (nunca una función vieja).
 * Usa variables de ejemplo; si se envía `body`, previsualiza ese texto en vivo.
 */
router.post("/:id/preview", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const t = await prisma.jwMessageTemplate.findUniqueOrThrow({ where: { id: req.params.id } });
    const body = typeof req.body?.body === "string" ? req.body.body : t.body;
    const templateType = ACTIVE.has(t.type) ? (t.type as TemplateTypeKey) : undefined;
    const r = renderMessage(body, sampleVariables(), { templateType });
    const validation = validateTemplate(body, templateType);
    res.json({
      rendered: r.renderedMessage,
      warnings: [...new Set([...r.warnings, ...validation.warnings])],
      invalidVariables: validation.invalidVariables,
      usedVariables: extractVariables(body),
    });
  } catch {
    res.status(404).json({ error: "Plantilla no encontrada" });
  }
});

/**
 * Editar plantilla. Si cambia el CUERPO, se crea una NUEVA VERSIÓN (no se
 * sobrescribe el historial) y se marca como activa. Los mensajes ya congelados
 * NO cambian (usan su templateVersionId).
 */
router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const t = await prisma.jwMessageTemplate.findUniqueOrThrow({ where: { id: req.params.id } });

    const bodyChanged = typeof data.body === "string" && data.body !== t.body;
    let newVersion = t.activeVersion;

    if (bodyChanged) {
      const last = await prisma.messageTemplateVersion.findFirst({
        where: { templateId: t.id },
        orderBy: { version: "desc" },
      });
      newVersion = (last?.version ?? t.activeVersion) + 1;
      await prisma.messageTemplateVersion.updateMany({ where: { templateId: t.id }, data: { isActive: false } });
      await prisma.messageTemplateVersion.create({
        data: {
          templateId: t.id,
          version: newVersion,
          body: data.body!,
          variablesSchema: extractVariables(data.body!),
          isActive: true,
          createdBy: "admin",
        },
      });
    }

    const updated = await prisma.jwMessageTemplate.update({
      where: { id: t.id },
      data: {
        title: data.title ?? t.title,
        description: data.description ?? t.description,
        isActive: data.isActive ?? t.isActive,
        ...(bodyChanged ? { body: data.body!, activeVersion: newVersion } : {}),
      },
    });
    res.json({ ...updated, versionCreated: bodyChanged ? newVersion : null });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
