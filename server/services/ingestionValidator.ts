/**
 * Ingestion Schema Validator
 * ==========================
 * Validates incoming patient and report payloads against the established
 * data contracts (src/types.ts). This is the gatekeeper that ensures only
 * well-formed records make it into the vector index.
 *
 * Each validator returns a ValidationResult with:
 *   - valid: boolean — whether the record passed all checks
 *   - errors: string[] — human-readable schema violations
 *   - record: the original record (for archival)
 */

// ── Constants ──

const VALID_TRIAGE_CATEGORIES = ["Self-care", "Doctor", "Urgent", "Emergency"] as const;
const VALID_CASE_STATUSES = [
  "Registered",
  "In Triage",
  "Needs Review",
  "Escalated",
  "Resolved",
] as const;
const VALID_REPORT_CATEGORIES = ["radiology", "lab", "ocr", "stt", "symptom"] as const;
const VALID_REPORT_STATUSES = ["pending", "verified", "flagged"] as const;

// ── Types ──

export interface ValidationResult<T = unknown> {
  valid: boolean;
  errors: string[];
  record: T;
  kind: "patient" | "report" | "unknown";
}

// ── Patient Validator ──

export type PatientRecord = Partial<{
  id: string;
  patientName: string;
  triageCategory: string;
  confidence: number;
  timestamp: string;
  status: string;
  traceEvents: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    performedBy: string;
    role: string;
    timestamp: string;
    fromState?: string;
    toState?: string;
    reason?: string;
  }>;
}>;

/**
 * Validates a single patient record against the TriageRecord contract.
 * Returns detailed error messages for each schema violation found.
 */
export function validatePatient(record: unknown): ValidationResult<PatientRecord> {
  const errors: string[] = [];
  const r = (record ?? {}) as PatientRecord;

  // Type check
  if (typeof r !== "object" || r === null) {
    return { valid: false, errors: ["Record must be a non-null object."], record: r, kind: "unknown" };
  }

  // Required field: patientName
  if (!r.patientName || typeof r.patientName !== "string") {
    errors.push("patientName: required string field missing or invalid.");
  }

  // Required field: triageCategory
  if (!r.triageCategory || !VALID_TRIAGE_CATEGORIES.includes(r.triageCategory as typeof VALID_TRIAGE_CATEGORIES[number])) {
    errors.push(
      `triageCategory: must be one of [${VALID_TRIAGE_CATEGORIES.join(", ")}], got "${r.triageCategory}".`,
    );
  }

  // Required field: confidence (number between 0 and 1)
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
    errors.push("confidence: required number between 0 and 1.");
  }

  // Required field: timestamp (ISO 8601 string)
  if (!r.timestamp || typeof r.timestamp !== "string" || isNaN(Date.parse(r.timestamp))) {
    errors.push("timestamp: required ISO 8601 date string missing or invalid.");
  }

  // Required field: status
  if (!r.status || !VALID_CASE_STATUSES.includes(r.status as typeof VALID_CASE_STATUSES[number])) {
    errors.push(
      `status: must be one of [${VALID_CASE_STATUSES.join(", ")}}], got "${r.status}".`,
    );
  }

  // Optional: traceEvents (array)
  if (r.traceEvents !== undefined) {
    if (!Array.isArray(r.traceEvents)) {
      errors.push("traceEvents: must be an array of trace event objects.");
    } else {
      for (let i = 0; i < r.traceEvents.length; i++) {
        const ev = r.traceEvents[i];
        if (!ev.id || !ev.action || !ev.performedBy || !ev.timestamp) {
          errors.push(`traceEvents[${i}]: each event requires id, action, performedBy, and timestamp.`);
          break;
        }
      }
    }
  }

  // Infer kind: if it has patientName + triageCategory, it's a patient
  const kind = r.patientName && r.triageCategory ? "patient" : "unknown";

  return { valid: errors.length === 0, errors, record: r, kind };
}

// ── Report Validator ──

export type ReportRecord = Partial<{
  id: string;
  patientId: string;
  patientName: string;
  category: string;
  subType: string;
  status: string;
  confidence: number;
  content: {
    rawText?: string;
    structuredData?: Record<string, unknown>;
    aiAnalysis?: string;
  };
  verifiedBy?: string;
  verifiedAt?: string;
  flagReason?: string;
  clinicianTriageOverride?: string | null;
  reviewNote?: string;
  clinicianAgreement?: boolean;
  disagreementCategory?: string | null;
  createdAt: string;
}>;

/**
 * Validates a single diagnostic report record against the DiagnosticReport contract.
 * Returns detailed error messages for each schema violation.
 */
export function validateReport(record: unknown): ValidationResult<ReportRecord> {
  const errors: string[] = [];
  const r = (record ?? {}) as ReportRecord;

  if (typeof r !== "object" || r === null) {
    return { valid: false, errors: ["Record must be a non-null object."], record: r, kind: "unknown" };
  }

  // Required: patientId
  if (!r.patientId || typeof r.patientId !== "string") {
    errors.push("patientId: required string field missing or invalid.");
  }

  // Required: patientName
  if (!r.patientName || typeof r.patientName !== "string") {
    errors.push("patientName: required string field missing or invalid.");
  }

  // Required: category
  if (!r.category || !VALID_REPORT_CATEGORIES.includes(r.category as typeof VALID_REPORT_CATEGORIES[number])) {
    errors.push(
      `category: must be one of [${VALID_REPORT_CATEGORIES.join(", ")}], got "${r.category}".`,
    );
  }

  // Required: subType
  if (!r.subType || typeof r.subType !== "string") {
    errors.push("subType: required string field missing or invalid.");
  }

  // Required: status
  if (!r.status || !VALID_REPORT_STATUSES.includes(r.status as typeof VALID_REPORT_STATUSES[number])) {
    errors.push(
      `status: must be one of [${VALID_REPORT_STATUSES.join(", ")}], got "${r.status}".`,
    );
  }

  // Required: confidence
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
    errors.push("confidence: required number between 0 and 1.");
  }

  // Required: createdAt
  if (!r.createdAt || typeof r.createdAt !== "string" || isNaN(Date.parse(r.createdAt))) {
    errors.push("createdAt: required ISO 8601 date string missing or invalid.");
  }

  // Optional: content block
  if (r.content !== undefined) {
    if (typeof r.content !== "object" || r.content === null) {
      errors.push("content: must be an object with optional rawText, structuredData, aiAnalysis fields.");
    }
  }

  // Infer kind
  const kind = r.patientId && r.category && r.subType ? "report" : "unknown";

  return { valid: errors.length === 0, errors, record: r, kind };
}

// ── Auto-Detect & Validate ──

/**
 * Inspects the record shape and applies the appropriate validator.
 * Useful when the file contains mixed or unknown record types.
 */
export function autoValidate(record: unknown): ValidationResult {
  const r = record as Record<string, unknown> | null | undefined;

  if (!r || typeof r !== "object") {
    return { valid: false, errors: ["Record is not a valid object."], record: record, kind: "unknown" };
  }

  // Heuristic: patients have patientName + triageCategory; reports have patientId + category + subType
  const hasPatientSignature =
    typeof r.patientName === "string" && typeof r.triageCategory === "string";
  const hasReportSignature =
    typeof r.patientId === "string" &&
    typeof r.category === "string" &&
    typeof r.subType === "string";

  if (hasPatientSignature) {
    return validatePatient(record);
  }

  if (hasReportSignature) {
    return validateReport(record);
  }

  return {
    valid: false,
    errors: [
      "Could not determine record type. A patient record requires " +
        "'patientName' and 'triageCategory'. A report record requires " +
        "'patientId', 'category', and 'subType'.",
    ],
    record: record,
    kind: "unknown",
  };
}
