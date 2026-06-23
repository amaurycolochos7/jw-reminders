import { Router, Request, Response } from "express";
import { z } from "zod";
import { login } from "./auth.service.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await login(email, password);
    res.json(result);
  } catch (err: any) {
    const status = err.message === "Invalid credentials" ? 401 : 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
