/**
 * OCR Client Service
 * ===================
 * Client for the unified Medical Triage API's report upload endpoint.
 * Uploads medical report images and returns processing results.
 *
 * Previously pointed to a separate ML OCR microservice
 * (mlservice-production-4d52.up.railway.app). Now consolidated to use
 * the single unified API at /api/v1/reports.
 *
 * Endpoint:
 *   POST /reports  — Upload medical report files (multipart/form-data)
 *                     Requires session_id, patient_id, files, and types.
 *
 * Environment variables:
 *   TRIAGE_API_BASE_URL — Base URL for the unified triage API
 *                         Default: https://medical-triage-production.up.railway.app/api/v1
 */

import { uploadReports, checkTriageApiHealth } from "./triageApiClient";

// ── Types ──

export interface OcrProcessRequest {
  /** Image file buffer */
  buffer: Buffer;
  /** Original file name (e.g., "blood_report.png") */
  originalname: string;
  /** MIME type (e.g., "image/png", "image/jpeg") */
  mimetype: string;
  /** Triage session ID (required by the unified API) */
  sessionId?: string;
  /** Patient ID (required by the unified API) */
  patientId?: string;
  /** Report type label (default: "blood_report") */
  reportType?: string;
}

export interface OcrProcessResponse {
  success: boolean;
  /** Extracted lab values from the OCR service */
  data: Record<string, unknown>;
  /** Raw response from the unified API */
  raw: unknown;
  /** Processing metadata */
  processedAt: string;
  source: string;
}

// ── OCR Processing ──

/**
 * POST /reports
 *
 * Uploads a blood report image to the unified triage API for processing.
 * The API accepts multipart/form-data with session_id, patient_id, files, and types.
 *
 * If sessionId/patientId are not provided, auto-generates a session-less upload
 * (the backend will process the report independently).
 */
export async function processOcrImage(
  request: OcrProcessRequest,
): Promise<OcrProcessResponse> {
  const { buffer, originalname, mimetype } = request;
  const sessionId = request.sessionId || "standalone-ocr";
  const patientId = request.patientId || "standalone-ocr";
  const reportType = request.reportType || "blood_report";

  console.log(
    `[ocrClient] Uploading report to unified API: ${originalname} (${buffer.length} bytes, type=${reportType})`,
  );

  const rawData = await uploadReports(
    sessionId,
    patientId,
    [{ buffer, originalname, mimetype }],
    [reportType],
  );

  console.log("[ocrClient] Report upload complete:", {
    originalname,
    keys: Object.keys(rawData),
  });

  return {
    success: true,
    data: rawData,
    raw: rawData,
    processedAt: new Date().toISOString(),
    source: `${process.env.TRIAGE_API_BASE_URL || "https://medical-triage-production.up.railway.app/api/v1"}/reports`,
  };
}

/**
 * Checks if the unified triage API is reachable and healthy.
 * Pings the /health endpoint (replaces the old OCR-specific health check).
 */
export async function checkOcrHealth(): Promise<{
  reachable: boolean;
  status: string;
}> {
  try {
    const health = await checkTriageApiHealth();
    return {
      reachable: true,
      status: `ok (model: ${health.model}, rag_ready: ${health.rag_ready})`,
    };
  } catch (error) {
    return {
      reachable: false,
      status: error instanceof Error ? error.message : String(error),
    };
  }
}
