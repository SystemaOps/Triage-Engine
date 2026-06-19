/**
 * LLM + RAG Client Service
 * =========================
 * Client for the unified Medical Triage API hosted on Railway.
 * Uses the shared triageApiClient to communicate with the consolidated
 * RAG + LLM pipeline at /api/v1.
 *
 * Endpoints (via triageApiClient):
 *   POST /triage   — primary triage analysis endpoint
 *   POST /chat     — follow-up chat for existing sessions
 *   GET  /health   — health check + model info
 *   POST /admin/rebuild-index — admin-only: rebuild BM25 index
 *
 * Environment variables:
 *   TRIAGE_API_BASE_URL — Base URL for the unified triage API
 *                         Default: https://medical-triage-production.up.railway.app/api/v1
 *   LLM_ADMIN_KEY       — X-Admin-Key value (default: medtriage2026)
 */

import {
  type TriageApiResponse,
  type TriageApiChatRequest,
  type TriageApiChatResponse,
  type TriageApiHealthResponse,
  type TriageApiRebuildResult,
  checkTriageApiHealth,
  triagePatient,
  chatWithSession,
  rebuildIndex as unifiedRebuildIndex,
} from "./triageApiClient";

const DEFAULT_ADMIN_KEY = "medtriage2026";

function adminKey(): string {
  return process.env.LLM_ADMIN_KEY || DEFAULT_ADMIN_KEY;
}

// ── Re-export types ──

export type { TriageApiHealthResponse as HealthResponse };

// ── Health Check ──

/**
 * GET /health
 * Returns the health status and current model info.
 *
 * Delegates to the shared triageApiClient.
 */
export async function checkHealth(): Promise<TriageApiHealthResponse> {
  return checkTriageApiHealth();
}

// ── Triage Analysis ──

export interface TriageRequest {
  /** Required: comma-separated symptoms or clinical text */
  symptoms: string;
  /** Optional: full patient case context (mapped to report_text) */
  patient_case?: string;
  /** Optional: chief complaint text (mapped to visual_notes) */
  chief_complaint?: string;
  /** Optional: vital signs */
  vitals?: {
    hr?: number;
    o2_sat?: number;
    bp?: string;
    temp?: number;
    rr?: number;
  };
}

export type { TriageApiResponse as TriageResponse };

/**
 * POST /triage
 * Sends a patient case to the unified API for triage analysis.
 *
 * Maps legacy field names to the unified API schema:
 *   patient_case → report_text
 *   chief_complaint → visual_notes
 *   vitals.hr → vitals.heart_rate
 *   vitals.o2_sat → vitals.spo2
 *   vitals.bp → parsed as vitals.blood_pressure
 *   vitals.temp → vitals.temperature
 *   vitals.rr → (no direct mapping — omitted)
 */
export async function runTriage(request: TriageRequest): Promise<TriageApiResponse> {
  // Build the unified API payload
  const payload: {
    symptoms: string;
    report_text?: string;
    visual_notes?: string;
    vitals?: {
      heart_rate?: number | null;
      spo2?: number | null;
      blood_pressure?: { systolic: number; diastolic: number } | null;
      temperature?: number | null;
    };
  } = {
    symptoms: request.symptoms,
  };

  // Map patient_case → report_text
  if (request.patient_case != null && request.patient_case.trim().length > 0) {
    payload.report_text = request.patient_case;
  }

  // Map chief_complaint → visual_notes
  if (request.chief_complaint != null && request.chief_complaint.trim().length > 0) {
    payload.visual_notes = request.chief_complaint;
  }

  // Map vitals to the unified API's Vitals schema
  if (request.vitals != null) {
    const v: typeof payload.vitals = {};

    if (request.vitals.hr != null) v.heart_rate = request.vitals.hr;
    if (request.vitals.o2_sat != null) v.spo2 = request.vitals.o2_sat;

    // Parse blood pressure string ("120/80") to structured object
    if (request.vitals.bp != null && request.vitals.bp.trim().length > 0) {
      const parts = request.vitals.bp.split("/").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        v.blood_pressure = { systolic: parts[0], diastolic: parts[1] };
      }
    }

    if (request.vitals.temp != null) v.temperature = request.vitals.temp;

    if (Object.keys(v).length > 0) {
      payload.vitals = v;
    }
  }

  console.log(`[llmClient] Sending triage request to unified API`, {
    symptoms: payload.symptoms.substring(0, 80),
    hasReportText: !!payload.report_text,
    hasVisualNotes: !!payload.visual_notes,
    hasVitals: !!payload.vitals,
  });

  // Retry strategy: the unified API's RAG pipeline may intermittently fail with 500.
  // On retry we simplify the payload.
  const payloadAttempts = [
    payload,
    // 2nd attempt: remove report_text
    { symptoms: payload.symptoms, ...(payload.visual_notes ? { visual_notes: payload.visual_notes } : {}), ...(payload.vitals ? { vitals: payload.vitals } : {}) },
    // 3rd attempt: symptoms only
    { symptoms: payload.symptoms },
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < payloadAttempts.length; attempt++) {
    const attemptPayload = payloadAttempts[attempt];
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1000 : 3000));
      console.log(`[llmClient] Retry ${attempt}/${payloadAttempts.length - 1} with simplified payload`);
    }

    try {
      const result = await triagePatient(attemptPayload);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[llmClient] Triage attempt ${attempt + 1} failed: ${lastError.message}`);
      // Only retry on server errors — 4xx failures are not retryable
      if (lastError.message.includes("(4")) break;
    }
  }

  throw lastError!;
}

// ── Chat Follow-up ──

export interface ChatRequest {
  session_id: string;
  message: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  /** The unified API doesn't return a disclaimer in chat responses — added for compatibility */
  disclaimer: string;
}

/**
 * POST /chat
 * Follow-up chat for an existing triage session.
 */
export async function chatWithLLM(request: ChatRequest): Promise<ChatResponse> {
  const result = await chatWithSession(request as TriageApiChatRequest);

  return {
    session_id: result.session_id,
    reply: result.reply,
    disclaimer: "⚠️ This AI-generated response is for informational purposes only and does not constitute medical advice.",
  };
}

// ── Admin: Rebuild BM25 Index ──

/**
 * POST /admin/rebuild-index
 * Triggers a full rebuild of the BM25 keyword index.
 */
export async function rebuildIndex(): Promise<TriageApiRebuildResult> {
  return unifiedRebuildIndex(adminKey());
}
