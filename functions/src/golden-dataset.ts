import {
  getFirestore,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

// ── PHI Text Scrubbing ──

/**
 * Common PHI patterns to detect in unstructured text.
 * Scans for names, contact info, identifiers embedded in free-text fields.
 *
 * 🔗 Canonical source: `src/lib/pii.ts` in the root project.
 *    Keep this array in sync with the shared version to prevent divergence.
 */
const PHI_PATTERNS: RegExp[] = [
  // Honorific + Name: "Mr. Smith", "Dr. Johnson"
  /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Miss|Mx\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
  // Contextual name patterns: "Patient John Doe", "seen by Sarah"
  /\b(?:patient|called|seen\s+by|contacted|referred\s+to|spoke\s+with)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/gi,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Phone numbers
  /\b(?:\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // SSN-like patterns
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Medical record numbers
  /\b(?:MRN|mrn|medical\s+record|record\s+#?)\s*:?\s*[A-Za-z0-9]{6,12}\b/gi,
  // DOB patterns
  /\b(?:DOB|dob|date\s+of\s+birth|born)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  // Street addresses
  /\b\d+\s+(?:[A-Z][a-z]+\s+)+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir)\b/g,
  // ZIP codes
  /\b\d{5}(?:-\d{4})?\b/g,
];

/**
 * Scrubs common unstructured PHI from a text string.
 * Returns null when input is null.
 */
function stripPhiFromText(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  let cleaned = text;
  for (const pattern of PHI_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[PHI REDACTED]');
  }
  return cleaned;
}

// ── Types ──

interface RawDiagnosticReport {
  id?: string;
  patientId?: string;
  patientName?: string;
  category?: string;
  subType?: string;
  status?: string;
  confidence?: number;
  content?: {
    rawText?: string;
    structuredData?: Record<string, unknown>;
    aiAnalysis?: string;
  };
  clinicianAgreement?: boolean;
  clinicianTriageOverride?: string | null;
  disagreementCategory?: string | null;
  reviewNote?: string;
  verifiedBy?: string;
  createdAt?: string;
  verifiedAt?: string;
}

/**
 * A single training example for Supervised Fine-Tuning (SFT).
 * Contains only de-identified, clinically relevant data.
 *
 * ⚠️ PHI WARNING: While patientName, patientId, and other structured
 * PHI fields are explicitly excluded, the free-text fields (rawText,
 * aiAnalysis) may still contain embedded PHI (e.g., patient names in
 * radiology reports). Downstream consumers should apply additional
 * PHI scrubbing before using this data in training pipelines.
 */
export interface GoldenDatasetRecord {
  /** Internal reference (not PHI — opaque Firestore doc ID) */
  reportId: string;
  /** Report category (radiology, lab, ocr, stt, symptom) */
  category: string;
  /** Sub-type of the report */
  subType: string;
  /** AI's confidence score (0–1) */
  confidence: number;
  /** The AI's original natural-language analysis */
  aiAnalysis: string | null;
  /** Raw extracted text (may be null) */
  rawText: string | null;
  /** What the clinician overrode the AI's assessment to */
  clinicianOverride: string | null;
  /** Categorization of the disagreement */
  disagreementCategory: string | null;
  /** Clinician's review note */
  reviewNote: string | null;
  /** Whether the clinician agreed (false means override) */
  clinicianAgreed: boolean;
  /** ISO timestamp of verification */
  verifiedAt: string | null;
  /** ISO timestamp of report creation */
  createdAt: string;
}

// ── PHI Stripping ──

/**
 * Strips all PHI from a raw DiagnosticReport, returning only
 * clinically relevant fields safe for ML training pipelines.
 *
 * PHI fields (patientName, patientId) are deliberately omitted
 * from the return type to enforce the zero-PHI export invariant.
 */
function stripPhi(report: RawDiagnosticReport): GoldenDatasetRecord {
  return {
    reportId: report.id ?? "unknown",
    category: report.category ?? "unknown",
    subType: report.subType ?? "unknown",
    confidence: report.confidence ?? 0,
    aiAnalysis: stripPhiFromText(report.content?.aiAnalysis),
    rawText: stripPhiFromText(report.content?.rawText),
    clinicianOverride: report.clinicianTriageOverride ?? null,
    disagreementCategory: report.disagreementCategory ?? null,
    reviewNote: stripPhiFromText(report.reviewNote),
    clinicianAgreed: report.clinicianAgreement === true,
    verifiedAt: report.verifiedAt ?? null,
    createdAt: report.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Converts an array of GoldenDatasetRecord to newline-delimited JSON (JSONL).
 * Each line is a complete JSON object.
 */
export function toJsonl(records: GoldenDatasetRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

/**
 * Fetches all reports from Firestore (with optional filtering),
 * strips PHI, and returns the golden dataset records.
 *
 * @param db - Firestore instance
 * @param options.filterOverridesOnly - If true, only return reports where clinician disagreed
 * @param options.maxRecords - Maximum number of records to return (0 = unlimited)
 */
export async function fetchGoldenDataset(
  db: Firestore,
  options?: {
    filterOverridesOnly?: boolean;
    maxRecords?: number;
  },
): Promise<GoldenDatasetRecord[]> {
  const { filterOverridesOnly = true, maxRecords = 0 } = options ?? {};

  // Query all reports. For large datasets, consider pagination.
  const snapshot = await db.collection("reports").get();

  const reports: RawDiagnosticReport[] = snapshot.docs.map(
    (doc: QueryDocumentSnapshot) =>
      ({
        id: doc.id,
        ...doc.data(),
      }) as RawDiagnosticReport,
  );

  // Sort by creation date, newest first
  reports.sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() -
      new Date(a.createdAt ?? 0).getTime(),
  );

  // Filter to verified reports
  let filtered = reports.filter((r) => r.status === "verified");

  // Optionally filter to only clinician-override cases (the "golden" dataset)
  if (filterOverridesOnly) {
    filtered = filtered.filter((r) => r.clinicianAgreement === false);
  }

  // Apply max records limit
  if (maxRecords > 0 && filtered.length > maxRecords) {
    filtered = filtered.slice(0, maxRecords);
  }

  // Strip PHI from each report
  const goldenRecords = filtered.map((r) => stripPhi(r));

  logger.info(
    `[golden-dataset] Exported ${goldenRecords.length} records ` +
      `(total reports: ${reports.length}, overrides: ${filtered.length})`,
  );

  return goldenRecords;
}

/**
 * Fetches, strips PHI, and returns the golden dataset as a JSONL string.
 * Convenience wrapper for the export pipeline.
 */
export async function exportGoldenDatasetAsJsonl(
  db: Firestore,
  options?: {
    filterOverridesOnly?: boolean;
    maxRecords?: number;
  },
): Promise<string> {
  const records = await fetchGoldenDataset(db, options);
  return toJsonl(records);
}
