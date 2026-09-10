import express from "express";
import cors from "cors";
import { router } from "./routes.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", router);

  // Central error handler — never leak stack traces to the client.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
