/**
 * Admin Portal Express Server
 * ============================
 * Unified HTTP server for the Medical Triage Admin Portal.
 *
 * Replaces Firebase Cloud Functions with a standard Express application
 * that can run locally via tsx or on a Proxmox VM via pm2.
 *
 * Run:
 *   npm run server         # Production mode (port from .env or 5001)
 *   npm run server:dev     # Watch mode with auto-reload
 *
 * Environment variables (.env):
 *   PORT              — HTTP port (default: 5001)
 *   NODE_ENV          — "development" | "production"
 *   ADMIN_API_KEY     — Shared secret for API authentication
 *   OPENAI_API_KEY    — OpenAI API key (required for vector search)
 *   PINECONE_API_KEY  — Pinecone API key (required for vector search)
 *   PINECONE_INDEX    — Pinecone index name (default: "triage-cases")
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import vectorRoutes from "./routes/vectorRoutes";
import llmRoutes from "./routes/llmRoutes";
import ocrRoutes from "./routes/ocrRoutes";
import sttRoutes from "./routes/sttRoutes";
import ttsRoutes from "./routes/ttsRoutes";
import xrayRoutes from "./routes/xrayRoutes";
import visualRoutes from "./routes/visualRoutes";
import voiceTriageRoutes from "./routes/voiceTriageRoutes";
import externalServicesRoutes from "./routes/externalServicesRoutes";
import { startFileWatcher } from "./services/fileWatcher";

const app = express();
const PORT = parseInt(process.env.PORT || "5001", 10);

// ── Global Middleware ──

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logging ──

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ── Health & Readiness Probes ──

/**
 * GET /ready
 *
 * Readiness probe for load balancers and orchestration (K8s, PM2).
 * Verifies that required environment variables are set.
 * Optionally pings Pinecone for a deeper health check.
 */
app.get("/ready", async (_req, res) => {
  const checks: Record<string, string | boolean> = {
    server: true,
    nodeEnv: process.env.NODE_ENV || "development",
    openaiKeySet: !!process.env.OPENAI_API_KEY,
    pineconeKeySet: !!process.env.PINECONE_API_KEY,
    pineconeIndex: process.env.PINECONE_INDEX || "triage-cases (default)",
  };

  const allEssential = checks.openaiKeySet && checks.pineconeKeySet;

  // Deep check: ping Pinecone
  if (checks.pineconeKeySet) {
    try {
      const { getVectorCount } = await import("./services/pineconeClient");
      const count = await getVectorCount();
      checks.pineconeReachable = true;
      checks.vectorCount = String(count);
    } catch (err) {
      checks.pineconeReachable = false;
      checks.pineconeError = err instanceof Error ? err.message : String(err);
    }
  }

  const status = allEssential ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /
 *
 * Root path status/welcome message.
 */
app.get("/", (_req, res) => {
  res.json({
    status: "online",
    service: "MedTriage OS Backend Gateway",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/health",
      ready: "/ready"
    }
  });
});

/**
 * GET /health
 *
 * Lightweight liveness probe.
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API Routes ──

app.use("/api/vector", vectorRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/stt", sttRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/xray", xrayRoutes);
app.use("/api/visual", visualRoutes);
app.use("/api/voice-triage", voiceTriageRoutes);
app.use("/api/external-services", externalServicesRoutes);

// ── 404 Handler ──

app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found." });
});

// ── Global Error Handler ──

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An internal error occurred."
          : err.message,
    });
  },
);

// ── Start ──

if (!process.env.DISABLE_AUTO_LISTEN) {
  app.listen(PORT, "0.0.0.0", async () => {
    const banner = [
      "",
      "╔══════════════════════════════════════════════════╗",
      "║     Admin Portal Express Server                 ║",
      "║──────────────────────────────────────────────────║",
      `║  Port:     ${String(PORT).padEnd(40)}║`,
      `║  Mode:     ${(process.env.NODE_ENV || "development").padEnd(40)}║`,
      `║  OpenAI:   ${process.env.OPENAI_API_KEY ? "OK".padEnd(40) : "— (not set)".padEnd(40)}║`,
      `║  Pinecone: ${process.env.PINECONE_API_KEY ? "OK".padEnd(40) : "— (not set)".padEnd(40)}║`,
      `║  Auth:     ${process.env.ADMIN_API_KEY ? "API key required".padEnd(38) : "Open (no key)".padEnd(38)}║`,
      `║  Watcher:  ${process.env.DISABLE_FILE_WATCHER ? "disabled".padEnd(38) : "active".padEnd(38)}║`,
      `║  Triage:  ${process.env.TRIAGE_API_BASE_URL ? "configured".padEnd(38) : "unified API".padEnd(38)}║`,
      `║  STT:     ${process.env.STT_API_BASE_URL ? "separate".padEnd(38) : "default".padEnd(38)}║`,
      `║  TTS:     ${process.env.OPENAI_API_KEY ? "OpenAI".padEnd(38) : "— (no key)".padEnd(38)}║`,
      `║  Voice:   ${process.env.TRIAGE_API_BASE_URL ? "via unified API".padEnd(34) : "STT+Triage unified".padEnd(34)}║`
      + `║  Ext.Svc: ${process.env.ADMIN_API_KEY ? "protected".padEnd(38) : "unprotected".padEnd(38)}║`,
      "╚══════════════════════════════════════════════════╝",
      "",
    ].join("\n");
    console.log(banner);

    // Start the file ingestion daemon after the server is listening.
    if (!process.env.DISABLE_FILE_WATCHER) {
      try {
        await startFileWatcher();
        console.log("[server] File watcher daemon started.");
      } catch (err) {
        console.error("[server] File watcher failed to start:", err);
      }
    }

    // Run an initial external services health check to populate the
    // systemHealth Firestore collection so the System Health Dashboard
    // has data immediately on first load.
    try {
      const { checkAllExternalServices, writeHealthReportToFirestore } =
        await import("./services/healthMonitor");
      const report = await checkAllExternalServices();
      await writeHealthReportToFirestore(report);
      console.log(
        `[server] Initial health check complete: ${report.services.length} services checked, status: ${report.overallStatus}`,
      );
    } catch (err) {
      console.warn(
        "[server] Initial health check skipped:",
        err,
      );
    }
  });
}

export default app;
