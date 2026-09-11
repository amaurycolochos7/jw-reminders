/**
 * Research Chat REST endpoints.
 *
 * Routes delegate to application layer operations.
 * All routes require auth + research chat permission (feature flag).
 */

import { Router, Request, Response } from "express";
import type { AuthRequest } from "../../../middleware/auth.js";
import * as Conversations from "../application/conversations/index.js";
import * as Messages from "../application/messages/index.js";
import * as Sources from "../application/sources/index.js";
import * as Prompts from "../application/prompts/index.js";
import * as Profiles from "../application/profiles/index.js";

const router = Router();

// ─── Feature flag guard ──────────────────────────────────

function isResearchChatEnabled(): boolean {
  return process.env.RESEARCH_CHAT_ENABLED === "true";
}

function featureGuard(_req: Request, res: Response, next: Function) {
  if (!isResearchChatEnabled()) {
    return res.status(403).json({
      error: "El Chat de investigación no está habilitado.",
      code: "FEATURE_DISABLED",
    });
  }
  next();
}

router.use(featureGuard);

// ─── GET /sessions ───────────────────────────────────────

router.get("/sessions", async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await Conversations.listConversations(req.user!.id);
    res.json({ sessions });
  } catch (err) {
    console.error("[research-chat] Error listing sessions:", err);
    res.status(500).json({ error: "Error al obtener sesiones" });
  }
});

// ─── POST /sessions ──────────────────────────────────────

router.post("/sessions", async (req: AuthRequest, res: Response) => {
  try {
    const session = await Conversations.createConversation(req.user!.id, req.body.title, req.body.profileId);
    res.status(201).json({ session });
  } catch (err) {
    console.error("[research-chat] Error creating session:", err);
    res.status(500).json({ error: "Error al crear sesión" });
  }
});

// ─── GET /profiles ───────────────────────────────────────

router.get("/profiles", async (_req: AuthRequest, res: Response) => {
  try {
    const profiles = await Profiles.listResearchProfiles();
    res.json({ profiles });
  } catch (err) {
    console.error("[research-chat] Error listing profiles:", err);
    res.status(500).json({ error: "Error al obtener perfiles" });
  }
});

// ─── GET /sessions/:id ───────────────────────────────────

router.get("/sessions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const session = await Conversations.getConversation(req.params.id as string, req.user!.id);
    res.json({ session });
  } catch (err) {
    console.error("[research-chat] Error getting session:", err);
    res.status(404).json({ error: "Sesión no encontrada" });
  }
});

// ─── DELETE /sessions/:id ────────────────────────────────

router.delete("/sessions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await Conversations.deleteConversation(req.params.id as string, req.user!.id);
    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error deleting session:", err);
    res.status(404).json({ error: "Sesión no encontrada" });
  }
});

// ─── POST /messages (principal) ──────────────────────────

router.post("/messages", async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, message, options = {} } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "El mensaje no puede estar vacío" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "La API de OpenAI no está configurada.",
        code: "OPENAI_NOT_CONFIGURED",
      });
    }

    const result = await Messages.sendResearchMessage({
      userId: req.user!.id,
      sessionId,
      message,
      options,
      profileId: req.body.profileId,
    });

    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error processing message:", err);
    res.status(500).json({
      error: "Error al procesar el mensaje. Intenta de nuevo.",
      code: "INTERNAL_ERROR",
    });
  }
});

// ─── POST /resolve-references ────────────────────────────

router.post("/resolve-references", async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body as { text: string };
    if (!text) return res.status(400).json({ error: "Texto requerido" });

    const result = await Sources.resolveTextReferences(text);
    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error resolving references:", err);
    res.status(500).json({ error: "Error al resolver referencias" });
  }
});

// ─── GET /sources/resolve ────────────────────────────────

router.get("/sources/resolve", async (req: AuthRequest, res: Response) => {
  try {
    const { reference } = req.query as { reference?: string };
    if (!reference) return res.status(400).json({ error: "Parámetro 'reference' requerido" });

    const result = await Sources.resolveSource(reference);
    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error re-resolving source:", err);
    res.status(500).json({ error: "Error al resolver la fuente" });
  }
});

// ─── POST /messages/variants (generar más variantes de una categoría) ───

router.post("/messages/variants", async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, messageId, commentType, count } = req.body;

    if (!sessionId || !messageId || !commentType) {
      return res.status(400).json({ error: "sessionId, messageId y commentType requeridos" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "La API de OpenAI no está configurada.",
        code: "OPENAI_NOT_CONFIGURED",
      });
    }

    const result = await Messages.generateMoreVariants({
      userId: req.user!.id,
      sessionId,
      messageId,
      commentType,
      count,
    });

    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error generating more variants:", err);
    res.status(500).json({ error: "Error al generar más variantes. Intenta de nuevo." });
  }
});

// ─── POST /regenerate ────────────────────────────────────

router.post("/regenerate", async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId, messageId, instruction } = req.body;

    if (!sessionId || !instruction) {
      return res.status(400).json({ error: "sessionId e instruction requeridos" });
    }

    const result = await Messages.regenerateComment({
      userId: req.user!.id,
      sessionId,
      messageId,
      instruction,
    });

    res.json(result);
  } catch (err) {
    console.error("[research-chat] Error regenerating:", err);
    res.status(500).json({ error: "Error al regenerar. Intenta de nuevo." });
  }
});

// ─── GET /prompt-rules (admin) ───────────────────────────

router.get("/prompt-rules", async (_req: AuthRequest, res: Response) => {
  try {
    const rules = await Prompts.listPromptRules();
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener reglas" });
  }
});

// ─── POST /prompt-rules (admin) ──────────────────────────

router.post("/prompt-rules", async (req: AuthRequest, res: Response) => {
  try {
    const { name, content } = req.body as { name: string; content: string };
    const rule = await Prompts.createPromptRule(name, content, req.user!.id);
    res.status(201).json({ rule });
  } catch (err) {
    console.error("[research-chat] Error creating prompt rule:", err);
    res.status(500).json({ error: "Error al crear regla" });
  }
});

export default router;
