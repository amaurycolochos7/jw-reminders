import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(helmet());
app.use(express.json());

// Health routes
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", (_req, res) => res.json({ ready: true }));
app.get("/version", (_req, res) => res.json({ version: "1.0.0" }));

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
