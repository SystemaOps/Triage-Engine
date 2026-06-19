/**
 * Visual Symptom Analysis Client Service
 * ========================================
 * Client for the unified Medical Triage API's visual scan endpoint.
 * Uploads photos of clinical symptoms for analysis.
 *
 * Previously pointed to a separate ML microservice (mlservice-production-4d52.up.railway.app).
 * Now consolidated to use the single unified API at /api/v1/visual-scan.
 *
 * Endpoint:
 *   POST /visual-scan — Upload a symptom photo for visual triage
 *                        Requires session_id, patient_id, and image file.
 *
 * Environment variables:
 *   TRIAGE_API_BASE_URL — Base URL for the unified triage API
 *                         Default: https://medical-triage-production.up.railway.app/api/v1
 */

import { uploadVisualScan } from "./triageApiClient";

// ── Types ──

export interface VisualAnalyzeRequest {
  /** Image file buffer */
  buffer: Buffer;
  /** Original file name (e.g., "skin_rash.jpg") */
  originalname: string;
  /** MIME type (e.g., "image/png", "image/jpeg") */
  mimetype: string;
  /** Triage session ID (required by the unified API) */
  sessionId?: string;
  /** Patient ID (required by the unified API) */
  patientId?: string;
  /** Anatomy target: skin, eyes, nails, tongue (used for metadata) */
  target?: string;
}

export interface VisualAnalyzeResponse {
  success: boolean;
  /** Analysis results from the API */
  data: Record<string, unknown>;
  /** Raw response from the unified API */
  raw: unknown;
  /** Processing metadata */
  processedAt: string;
  source: string;
  target: string;
}

// ── Analysis Targets ──

export const VISUAL_TARGETS = [
  { id: "skin", label: "Skin", description: "Lesions / Rash / Dermatological" },
  { id: "eyes", label: "Eyes", description: "Ocular symptoms / Conjunctivitis" },
  { id: "nails", label: "Nails", description: "Nail abnormalities / Infections" },
  { id: "tongue", label: "Tongue", description: "Oral symptoms / Tongue conditions" },
];

// ── Visual Analysis ──

/**
 * POST /visual-scan
 *
 * Uploads a symptom photo to the unified triage API for visual analysis.
 * The API accepts multipart/form-data with session_id, patient_id, and image.
 *
 * If sessionId/patientId are not provided, auto-generates standalone identifiers
 * (the backend will process the image independently).
 */
export async function analyzeVisual(
  request: VisualAnalyzeRequest,
): Promise<VisualAnalyzeResponse> {
  const { buffer, originalname, mimetype, target } = request;
  const sessionId = request.sessionId || "standalone-visual";
  const patientId = request.patientId || "standalone-visual";
  const analyzeTarget = target || "skin";

  console.log(
    `[visualClient] Uploading image to unified API /visual-scan: ${originalname} (${buffer.length} bytes, target=${analyzeTarget})`,
  );

  const rawData = await uploadVisualScan(
    sessionId,
    patientId,
    buffer,
    originalname,
    mimetype,
  );

  console.log("[visualClient] Visual scan complete:", {
    originalname,
    target: analyzeTarget,
    keys: Object.keys(rawData),
  });

  return {
    success: true,
    data: rawData,
    raw: rawData,
    processedAt: new Date().toISOString(),
    source: `${process.env.TRIAGE_API_BASE_URL || "https://medical-triage-production.up.railway.app/api/v1"}/visual-scan`,
    target: analyzeTarget,
  };
}
