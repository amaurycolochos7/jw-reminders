import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes/index.js";
import { APP_VERSION, BUILD_TAG } from "./version.js";
import { assertSecurityConfig } from "./config/security.js";

assertSecurityConfig();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS restringido: solo orígenes permitidos (coma-separados en CORS_ORIGINS).
// En dev se permite localhost por defecto. Nunca "*" con credenciales.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Permite herramientas sin origin (curl, same-origin) y orígenes en lista.
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production") return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origen no permitido por CORS"));
    },
  }),
);
app.use(helmet());
app.use(express.json());

// Health routes (available at root AND under /api for Traefik routing)
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", (_req, res) => res.json({ ready: true }));
app.get("/version", (_req, res) => res.json({ version: APP_VERSION, build: BUILD_TAG }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/ready", (_req, res) => res.json({ ready: true }));
app.get("/api/version", (_req, res) => res.json({ version: APP_VERSION, build: BUILD_TAG }));

// API routes
app.use("/api", apiRouter);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
