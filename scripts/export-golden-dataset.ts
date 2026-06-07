/**
 * Golden Dataset Export Script
 * ==============================
 *
 * Standalone CLI script that queries all verified reports from Firestore
 * where a clinician overrode the AI, strips PHI, and outputs the result
 * as newline-delimited JSON (JSONL) to stdout.
 *
 * Usage:
 *   VITE_FIREBASE_API_KEY=... VITE_FIREBASE_AUTH_DOMAIN=... \
 *   VITE_FIREBASE_PROJECT_ID=... VITE_FIREBASE_STORAGE_BUCKET=... \
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=... VITE_FIREBASE_APP_ID=... \
 *   VITE_FIREBASE_MEASUREMENT_ID=... \
 *   npx tsx scripts/export-golden-dataset.ts > golden-dataset.jsonl
 *
 * Or with a .env file in the project root:
 *   npx tsx --env-file=.env scripts/export-golden-dataset.ts > golden-dataset.jsonl
 *
 * Options (via environment variables):
 *   FILTER_OVERRIDES_ONLY=true   (default: true — only export override cases)
 *   MAX_RECORDS=1000             (default: 1000)
 *
 * Requires Firebase credentials set as VITE_FIREBASE_* env vars.
 * The output is suitable for Supervised Fine-Tuning (SFT) of clinical triage models.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import type { DiagnosticReport } from "../src/types";

// ── Firebase Init ──
// Uses process.env for compatibility with both tsx and Node.js
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate required config
const missingVars = Object.entries(firebaseConfig)
  .filter(([_, v]) => !v)
  .map(([k]) => k);
if (missingVars.length > 0) {
  console.error(
    `[golden-dataset] Missing required env vars: ${missingVars.join(", ")}`,
  );
  console.error(
    "[golden-dataset] Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, " +
      "VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, " +
      "VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, " +
      "and VITE_FIREBASE_MEASUREMENT_ID.",
  );
  process.exit(1);
}

const app = initializeApp(firebaseConfig as Record<string, string>);
const db = getFirestore(app);

// ── Types ──

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
  reportId: string;
  category: string;
  subType: string;
  confidence: number;
  aiAnalysis: string | null;
  rawText: string | null;
  clinicianOverride: string | null;
  disagreementCategory: string | null;
  reviewNote: string | null;
  clinicianAgreed: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

// ── PHI Stripping ──

function stripPhi(report: DiagnosticReport): GoldenDatasetRecord {
  return {
    reportId: report.id,
    category: report.category,
    subType: report.subType,
    confidence: report.confidence,
    aiAnalysis: report.content?.aiAnalysis ?? null,
    rawText: report.content?.rawText ?? null,
    clinicianOverride: report.clinicianTriageOverride ?? null,
    disagreementCategory: report.disagreementCategory ?? null,
    reviewNote: report.reviewNote ?? null,
    clinicianAgreed: report.clinicianAgreement === true,
    verifiedAt: report.verifiedAt ?? null,
    createdAt: report.createdAt,
  };
}

// ── Main ──

async function main() {
  const filterOverridesOnly =
    (import.meta.env.FILTER_OVERRIDES_ONLY ?? "true") !== "false";
  const maxRecords = parseInt(process.env.MAX_RECORDS ?? "1000", 10) || 1000;

  console.error(
    `[golden-dataset] Fetching reports (overridesOnly=${filterOverridesOnly}, max=${maxRecords || "unlimited"})...`,
  );

  const snapshot = await getDocs(collection(db, "reports"));
  const reports = snapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        ...doc.data(),
      }) as DiagnosticReport,
  );

  // Sort newest first
  reports.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Filter to verified reports with clinician override
  let filtered = reports.filter((r) => r.status === "verified");
  if (filterOverridesOnly) {
    filtered = filtered.filter((r) => r.clinicianAgreement === false);
  }

  // Limit
  if (maxRecords > 0 && filtered.length > maxRecords) {
    filtered = filtered.slice(0, maxRecords);
  }

  // Strip PHI and output JSONL to stdout
  const records = filtered.map(stripPhi);
  for (const record of records) {
    console.log(JSON.stringify(record));
  }

  console.error(
    `[golden-dataset] Done — exported ${records.length} records ` +
      `(from ${reports.length} total reports).`,
  );
}

main().catch((err) => {
  console.error("[golden-dataset] Fatal error:", err);
  process.exit(1);
});
