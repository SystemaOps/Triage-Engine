/**
 * Unified Triage API Client
 * ==========================
 * Shared HTTP client for the consolidated Medical Triage API at:
 *   https://medical-triage-production.up.railway.app/api/v1
 *
 * All services that interact with the unified triage pipeline should
 * import from this client rather than maintaining separate base URLs.
 *
 * Environment variable:
 *   TRIAGE_API_BASE_URL — defaults to https://medical-triage-production.up.railway.app/api/v1
 */

const DEFAULT_BASE_URL = "https://medical-triage-production.up.railway.app/api/v1";

/**
 * Returns the configured base URL for the unified Triage API.
 * Falls back to deprecated env vars for backward compatibility, then to default.
 */
export function baseUrl(): string {
  return (
    process.env.TRIAGE_API_BASE_URL ||
    process.env.LLM_API_BASE_URL?.replace(/\/+$/, "") + "/api/v1" ||
    DEFAULT_BASE_URL
  );
}

// ── Health Check ──

export interface TriageApiHealthResponse {
  status: string;
  rag_ready: boolean;
  model: string;
  version: string;
}

/**
 * GET /health
 * Returns the health status and current model info from the unified API.
 */
export async function checkTriageApiHealth(): Promise<TriageApiHealthResponse> {
  const response = await fetch(`${baseUrl()}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `Triage API health check failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json() as Promise<TriageApiHealthResponse>;
}

// ── Triage ──

export interface TriageApiRequest {
  /** Required: patient's symptom description (3-4000 chars) */
  symptoms: string;
  /** Optional: measured vital signs */
  vitals?: {
    heart_rate?: number | null;
    spo2?: number | null;
    blood_pressure?: { systolic: number; diastolic: number } | null;
    temperature?: number | null;
  };
  /** Optional: OCR-extracted text from a medical report (max 8000) */
  report_text?: string;
  /** Optional: visual / physical observation notes (max 2000) */
  visual_notes?: string;
}

export interface TriageApiResponse {
  session_id: string;
  urgency_level: string;
  reasoning: string;
  next_steps: string;
  red_flags: string[];
  disclaimer: string;
  latency_ms: number | null;
}

/**
 * POST /triage
 * Sends a patient case for triage analysis via the unified RAG + LLM pipeline.
 */
export async function triagePatient(
  request: TriageApiRequest,
): Promise<TriageApiResponse> {
  const response = await fetch(`${baseUrl()}/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Triage API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<TriageApiResponse>;
}

// ── Chat ──

export interface TriageApiChatRequest {
  session_id: string;
  message: string;
}

export interface TriageApiChatResponse {
  session_id: string;
  reply: string;
}

/**
 * POST /chat
 * Follow-up chat for an existing triage session.
 */
export async function chatWithSession(
  request: TriageApiChatRequest,
): Promise<TriageApiChatResponse> {
  const response = await fetch(`${baseUrl()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Triage chat API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<TriageApiChatResponse>;
}

// ── Admin: Rebuild Index ──

export interface TriageApiRebuildResult {
  status: string;
  message: string;
}

/**
 * POST /admin/rebuild-index
 * Triggers a full rebuild of the BM25 keyword index on the unified API server.
 */
export async function rebuildIndex(adminKey?: string): Promise<TriageApiRebuildResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (adminKey) {
    headers["x-admin-key"] = adminKey;
  }

  const response = await fetch(`${baseUrl()}/admin/rebuild-index`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Rebuild index error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<TriageApiRebuildResult>;
}

// ── Visual Scan ──

/**
 * POST /visual-scan
 * Submits an image for visual triage/scan as part of a triage session.
 *
 * The unified API expects multipart/form-data with:
 *   - session_id (string)
 *   - patient_id (string)
 *   - image (file)
 */
export async function uploadVisualScan(
  sessionId: string,
  patientId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("patient_id", patientId);
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append("image", blob, fileName);

  const response = await fetch(`${baseUrl()}/visual-scan`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Visual scan API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ── Upload Reports ──

/**
 * POST /reports
 * Uploads medical report files as part of a triage session.
 *
 * The unified API expects multipart/form-data with:
 *   - session_id (string)
 *   - patient_id (string)
 *   - files (array of files)
 *   - types (array of strings — report type labels e.g. "blood_report", "xray")
 */
export async function uploadReports(
  sessionId: string,
  patientId: string,
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
  types: string[],
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("patient_id", patientId);

  for (const file of files) {
    const blob = new Blob([file.buffer], { type: file.mimetype });
    form.append("files", blob, file.originalname);
  }

  for (const t of types) {
    form.append("types", t);
  }

  const response = await fetch(`${baseUrl()}/reports`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Reports upload API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

// ── Voice Triage ──

/**
 * POST /voice-triage
 * Accepts an audio file, transcribes it via STT, then runs the triage
 * pipeline on the transcribed text — all in a single unified call.
 *
 * The unified API expects multipart/form-data with:
 *   - session_id (string) — existing session or new session ID
 *   - audio (binary file) — audio recording of patient symptoms
 *
 * Returns the same TriageApiResponse as POST /triage.
 */
export async function voiceTriageAudio(
  sessionId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<TriageApiResponse> {
  const form = new FormData();
  form.append("session_id", sessionId);
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append("audio", blob, fileName);

  const response = await fetch(`${baseUrl()}/voice-triage`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Voice triage API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<TriageApiResponse>;
}

// ── Analyse ──

/**
 * POST /analyse
 * Triggers the final analysis for a given session.
 */
export async function triggerAnalyse(
  sessionId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${baseUrl()}/analyse?session_id=${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(`Analyse API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}
