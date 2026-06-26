import { Router, Request, Response } from "express";
import { listProviders } from "../../services/providers/registry.js";
import { previewImport, confirmImport } from "../../services/import.service.js";

const router = Router();

router.get("/providers", (_req: Request, res: Response) => {
  res.json(listProviders());
});

router.post("/preview", async (req: Request, res: Response) => {
  try {
    const { provider, input } = req.body || {};
    if (!provider) return res.status(400).json({ error: "Falta 'provider'." });
    res.json(await previewImport(provider, input));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/confirm", async (req: Request, res: Response) => {
  try {
    const { provider, input } = req.body || {};
    if (!provider) return res.status(400).json({ error: "Falta 'provider'." });
    res.json(await confirmImport(provider, input));
  } catch (err: any) {
    res.status(400).json({ error: err.message, validation: err.validation });
  }
});

export default router;
