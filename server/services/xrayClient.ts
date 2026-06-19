/**
 * X-Ray Classification Client Service
 * =====================================
 * Client for the unified Medical Triage API's visual scan endpoint.
 * Uploads radiograph images for AI analysis.
 *
 * Previously pointed to a separate ML microservice (mlservice-production-4d52.up.railway.app).
 * Now consolidated to use the single unified API at /api/v1/visual-scan
 * (the same endpoint used for visual symptom analysis — the backend
 * differentiates by context / metadata).
 *
 * Endpoint:
 *   POST /visual-scan — Upload a radiograph image for analysis
 *                        Requires session_id, patient_id, and image file.
 *
 * Environment variables:
 *   TRIAGE_API_BASE_URL — Base URL for the unified triage API
 *                         Default: https://medical-triage-production.up.railway.app/api/v1
 */

import { uploadVisualScan } from "./triageApiClient";

// ── Types ──

export interface XRayClassifyRequest {
  /** Image file buffer */
  buffer: Buffer;
  /** Original file name (e.g., "chest_xray.png") */
  originalname: string;
  /** MIME type (e.g., "image/png", "image/jpeg") */
  mimetype: string;
  /** Triage session ID (required by the unified API) */
  sessionId?: string;
  /** Patient ID (required by the unified API) */
  patientId?: string;
  /** Imaging target: chest, bone, dental, spine (used for metadata) */
  target?: string;
}

export interface XRayClassifyResponse {
  success: boolean;
  /** Classification results from the API */
  data: Record<string, unknown>;
  /** Raw response from the unified API */
  raw: unknown;
  /** Processing metadata */
  processedAt: string;
  source: string;
  target: string;
}

// ── Classification Targets ──

export const XRAY_TARGETS = [
  { id: "chest", label: "Chest X-Ray", description: "Diagnostic chest radiograph" },
  { id: "bone", label: "Bone X-Ray", description: "Musculoskeletal radiograph" },
  { id: "dental", label: "Dental X-Ray", description: "Dental/panoramic radiograph" },
  { id: "spine", label: "Spine X-Ray", description: "Spinal radiograph" },
];

// ── X-Ray Classification ──

/**
 * POST /visual-scan
 *
 * Uploads an X-ray image to the unified triage API for analysis.
 * The API accepts multipart/form-data with session_id, patient_id, and image.
 *
 * If sessionId/patientId are not provided, auto-generates standalone identifiers
 * (the backend will process the image independently).
 */
export async function classifyXRay(
  request: XRayClassifyRequest,
): Promise<XRayClassifyResponse> {
  const { buffer, originalname, mimetype, target } = request;
  const sessionId = request.sessionId || "standalone-xray";
  const patientId = request.patientId || "standalone-xray";
  const classifyTarget = target || "chest";

  console.log(
    `[xrayClient] Uploading X-ray to unified API /visual-scan: ${originalname} (${buffer.length} bytes, target=${classifyTarget})`,
  );

  const rawData = await uploadVisualScan(
    sessionId,
    patientId,
    buffer,
    originalname,
    mimetype,
  );

  console.log("[xrayClient] Classification complete:", {
    originalname,
    target: classifyTarget,
    keys: Object.keys(rawData),
  });

  return {
    success: true,
    data: rawData,
    raw: rawData,
    processedAt: new Date().toISOString(),
    source: `${process.env.TRIAGE_API_BASE_URL || "https://medical-triage-production.up.railway.app/api/v1"}/visual-scan`,
    target: classifyTarget,
  };
}
