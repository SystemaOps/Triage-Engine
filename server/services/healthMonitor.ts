/**
 * External Services Health Monitor
 * ==================================
 * Unified health checker that pings ALL external services and the local
 * Express server, then returns a consolidated health report.
 *
 * Services monitored:
 *   - Unified Triage API (LLM + RAG Pipeline + Vision/OCR) — consolidated endpoint
 *   - STT Service (stt-tts-service-production.up.railway.app) — separate, no unified equivalent
 *   - OpenAI API (embeddings + TTS)
 *   - Pinecone Vector Index
 *   - Local Express server health
 *
 * Note: OCR, Visual, and X-Ray are no longer checked separately — they
 *       are now served by the Unified Triage API (medical-triage-production.up.railway.app/api/v1).
 */

import { getVectorCount } from "./pineconeClient";
import { checkTriageApiHealth } from "./triageApiClient";
import { checkSttHealth } from "./sttClient";
import { getFirestoreDb } from "./firebaseAdmin";

// ── Types ──

export type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export interface ServiceHealthResult {
  id: string;
  name: string;
  type: "core_service" | "ai_model" | "kiosk_hardware";
  status: HealthStatus;
  latencyMs: number | null;
  lastSeen: string;
  errorMessage: string | null;
  /** Extra info specific to the service */
  detail?: Record<string, unknown>;
}

export interface HealthReport {
  timestamp: string;
  overallStatus: HealthStatus;
  services: ServiceHealthResult[];
}

// ── Helpers ──

/** Times a promise and returns both the result and duration in ms. */
async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

/** Wraps a health check so it never throws — returns a ServiceHealthResult. */
async function safeCheck(
  id: string,
  name: string,
  type: ServiceHealthResult["type"],
  checkFn: () => Promise<{ status: string; detail?: Record<string, unknown> }>,
): Promise<ServiceHealthResult> {
  try {
    const { result, durationMs } = await timed(checkFn);

    const status: HealthStatus =
      result.status === "ok" || result.status === "healthy"
        ? "healthy"
        : result.status?.toLowerCase().includes("degraded")
          ? "degraded"
          : "critical";

    return {
      id,
      name,
      type,
      status,
      latencyMs: durationMs,
      lastSeen: new Date().toISOString(),
      errorMessage: null,
      detail: { ...result.detail, rawStatus: result.status },
    };
  } catch (err) {
    return {
      id,
      name,
      type,
      status: "critical",
      latencyMs: null,
      lastSeen: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Individual Health Checks ──

async function checkLocalExpress(): Promise<{
  status: string;
  detail?: Record<string, unknown>;
}> {
  const port = process.env.PORT || "5001";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = process.env.HOST || "localhost";
  const response = await fetch(`${protocol}://${host}:${port}/health`, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  return { status: response.ok ? "ok" : "degraded", detail: body };
}

async function checkOpenAI(): Promise<{
  status: string;
  detail?: Record<string, unknown>;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "degraded", detail: { message: "OPENAI_API_KEY not set" } };
  }

  // List models as a lightweight connectivity check
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { status: "critical", detail: { httpStatus: response.status } };
  }

  const body = (await response.json()) as { data: Array<{ id: string }> };
  const hasEmbeddingModel = body.data?.some(
    (m) => m.id === "text-embedding-3-small",
  );
  const hasTtsModel = body.data?.some((m) => m.id === "tts-1");

  return {
    status: "ok",
    detail: {
      modelsAvailable: body.data?.length ?? 0,
      embeddingModelAvailable: hasEmbeddingModel,
      ttsModelAvailable: hasTtsModel,
    },
  };
}

async function checkPinecone(): Promise<{
  status: string;
  detail?: Record<string, unknown>;
}> {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    return { status: "degraded", detail: { message: "PINECONE_API_KEY not set" } };
  }

  const count = await getVectorCount();
  return {
    status: "ok",
    detail: { vectorCount: count, indexName: process.env.PINECONE_INDEX || "triage-cases" },
  };
}

async function checkUnifiedTriageApi(): Promise<{
  status: string;
  detail?: Record<string, unknown>;
}> {
  const health = await checkTriageApiHealth();
  return {
    status: health.status,
    detail: {
      model: health.model,
      version: health.version,
      ragReady: health.rag_ready,
    },
  };
}

async function checkSttApi(): Promise<{
  status: string;
  detail?: Record<string, unknown>;
}> {
  const health = await checkSttHealth();
  return {
    status: health.reachable ? "ok" : "critical",
    detail: { reachable: health.reachable, model: health.model, service: health.service },
  };
}

// ── Unified Health Check ──

/**
 * Pings ALL external services in parallel and returns a consolidated health report.
 * This is the main entry point used by the Express route and the Firestore writer.
 *
 * Consolidated services (OCR, Visual, X-Ray) are now monitored via the single
 * "Unified Triage API" entry. STT remains a separate check since it has no
 * equivalent in the unified API.
 */
export async function checkAllExternalServices(): Promise<HealthReport> {
  const results = await Promise.all([
    safeCheck("unified-triage-api", "Unified Triage API (RAG + LLM + Vision)", "ai_model", checkUnifiedTriageApi),
    safeCheck("stt-whisper-service", "STT Whisper Service", "ai_model", checkSttApi),
    safeCheck("openai-api", "OpenAI API", "core_service", checkOpenAI),
    safeCheck("pinecone-vector-index", "Pinecone Vector Index", "core_service", checkPinecone),
    safeCheck("local-express-server", "Admin Portal Express", "core_service", checkLocalExpress),
  ]);

  // Determine overall status
  const criticalCount = results.filter((r) => r.status === "critical").length;
  const degradedCount = results.filter((r) => r.status === "degraded").length;

  let overallStatus: HealthStatus = "healthy";
  if (criticalCount > 0) overallStatus = "critical";
  else if (degradedCount > 0) overallStatus = "degraded";

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    services: results,
  };
}

/**
 * Writes a health report to the Firestore systemHealth collection.
 * Each service becomes a separate document keyed by its ID.
 */
export async function writeHealthReportToFirestore(
  report: HealthReport,
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    console.log(
      "[healthMonitor] Firestore Admin not configured. Skipping systemHealth write.",
    );
    return;
  }

  try {
    const batch = db.batch();

    for (const svc of report.services) {
      const docRef = db.collection("systemHealth").doc(svc.id);
      batch.set(docRef, {
        id: svc.id,
        name: svc.name,
        type: svc.type,
        status: svc.status,
        latencyMs: svc.latencyMs ?? null,
        lastSeen: svc.lastSeen,
        errorMessage: svc.errorMessage,
        detail: svc.detail ? JSON.stringify(svc.detail) : null,
      });
    }

    await batch.commit();
    console.log(
      `[healthMonitor] Wrote ${report.services.length} service health docs to Firestore`,
    );
  } catch (err) {
    console.warn(
      "[healthMonitor] Failed to write to Firestore:",
      err,
    );
  }
}
