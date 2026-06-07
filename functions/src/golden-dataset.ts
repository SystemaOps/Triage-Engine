import {
  getFirestore,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

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
    aiAnalysis: report.content?.aiAnalysis ?? null,
    rawText: report.content?.rawText ?? null,
    clinicianOverride: report.clinicianTriageOverride ?? null,
    disagreementCategory: report.disagreementCategory ?? null,
    reviewNote: report.reviewNote ?? null,
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
