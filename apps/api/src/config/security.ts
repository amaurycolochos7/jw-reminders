import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Fase 9 — Configuración de seguridad centralizada.
 */

let cachedJwtSecret: string | null = null;

/**
 * Secreto JWT SIN fallback inseguro. En producción DEBE estar definido y ser
 * suficientemente largo, o el proceso falla al arrancar (ver assertSecurityConfig).
 * En desarrollo, si falta, se genera un secreto EFÍMERO aleatorio (nunca "secret").
 */
export function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) { cachedJwtSecret = s; return s; }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET no configurado o demasiado corto (>=16 chars) en producción.");
  }
  cachedJwtSecret = randomBytes(32).toString("hex");
  console.warn("[security] JWT_SECRET ausente/corto: usando secreto EFÍMERO de desarrollo (los tokens no sobreviven reinicios).");
  return cachedJwtSecret;
}

/** Se llama al arrancar: aborta el proceso en prod si falta seguridad crítica. */
export function assertSecurityConfig(): void {
  if (process.env.NODE_ENV === "production") {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 16) { console.error("[security] FATAL: JWT_SECRET no configurado o demasiado corto."); process.exit(1); }
    if (!process.env.WHATSAPP_INTERNAL_TOKEN) {
      console.warn("[security] WHATSAPP_INTERNAL_TOKEN no configurado: el servicio WhatsApp no exigirá auth interna.");
    }
  }
}

/** Enmascara un teléfono para logs: deja país + últimos 2 dígitos. */
export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 2)}****${d.slice(-2)}`;
}

/**
 * Rate limiter en memoria (sin dependencias). Suficiente para endpoints
 * sensibles (login, envíos). ponytail: ventana fija por IP; techo simple; para
 * multi-instancia se necesitaría un store compartido (Redis).
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = (opts.key ? opts.key(req) : req.ip) || "unknown";
    const rec = hits.get(k);
    if (!rec || now > rec.resetAt) {
      hits.set(k, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    rec.count += 1;
    if (rec.count > opts.max) {
      const retry = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: `Demasiadas solicitudes. Reintenta en ${retry}s.` });
    }
    next();
  };
}
