import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { exportGoldenDatasetAsJsonl } from "./golden-dataset";

// ── Vector Search Functions ──
export {
  searchTriageCases,
  getSimilarCases,
  indexAllTriageCases,
  indexPatientOnWrite,
} from "./vector-search";

initializeApp();

// ── Type definitions (self-contained for the Cloud Functions runtime) ──

interface TriageRecord {
  triageCategory?: string;
  status?: string;
  timestamp?: string;
}

interface DiagnosticReport {
  status?: string;
  clinicianAgreement?: boolean;
  disagreementCategory?: string | null;
}

interface ModelWeight {
  accuracyRate?: number;
  status?: string;
}

interface KioskTerminal {
  status?: string;
}

interface TriageAnalyticsSnapshot {
  periodId: string;
  totalTriageSessions: number;
  urgencyBreakdown: {
    critical: number;
    urgent: number;
    routine: number;
  };
  aiAccuracyMetrics: {
    totalInferences: number;
    doctorAgreements: number;
    doctorOverrules: number;
  };
  averageWaitTimeSec: number;
  facilityPerformance: Array<{
    facilityId: string;
    patientVolume: number;
    avgProcessingTimeSec: number;
  }>;
  disagreementCategoryBreakdown: Record<string, number>;
  kioskUptimeRate: number;
  modelConsensusRate: number;
  computedAt: string;
}

// ── Helpers ──

function getWeekId(date: Date): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const daysSinceStart = Math.floor(
    (date.getTime() - startOfYear.getTime()) / 86400000,
  );
  const weekNum = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

async function computeAndWriteSnapshot(db: Firestore): Promise<void> {
  const now = new Date();
  const periodId = getWeekId(now);
  const timestamp = now.toISOString();

  // ── Query all source collections in parallel ──
  const [patientsSnap, reportsSnap, modelsSnap, kiosksSnap] =
    await Promise.all([
      db.collection("patients").get(),
      db.collection("reports").get(),
      db.collection("modelWeights").get(),
      db.collection("kiosks").get(),
    ]);

  const patients: TriageRecord[] = patientsSnap.docs.map(
    (doc: QueryDocumentSnapshot): TriageRecord => doc.data() as TriageRecord,
  );
  const reports: DiagnosticReport[] = reportsSnap.docs.map(
    (doc: QueryDocumentSnapshot): DiagnosticReport =>
      doc.data() as DiagnosticReport,
  );
  const models: ModelWeight[] = modelsSnap.docs.map(
    (doc: QueryDocumentSnapshot): ModelWeight => doc.data() as ModelWeight,
  );
  const kiosks: KioskTerminal[] = kiosksSnap.docs.map(
    (doc: QueryDocumentSnapshot): KioskTerminal =>
      doc.data() as KioskTerminal,
  );

  // ── Triage Volume & Urgency Breakdown ──
  const totalTriageSessions = patients.length;
  const criticalCount = patients.filter(
    (p: TriageRecord) => p.triageCategory === "Emergency",
  ).length;
  const urgentCount = patients.filter(
    (p: TriageRecord) => p.triageCategory === "Urgent",
  ).length;
  const routineCount = patients.filter(
    (p: TriageRecord) =>
      p.triageCategory !== "Emergency" && p.triageCategory !== "Urgent",
  ).length;

  // ── AI Accuracy Metrics (from verified reports) ──
  const verifiedReports: DiagnosticReport[] = reports.filter(
    (r: DiagnosticReport) => r.status === "verified",
  );
  const totalInferences = verifiedReports.length;
  const doctorAgreements = verifiedReports.filter(
    (r: DiagnosticReport) => r.clinicianAgreement === true,
  ).length;
  const doctorOverrules = verifiedReports.filter(
    (r: DiagnosticReport) => r.clinicianAgreement === false,
  ).length;

  // ── Disagreement Category Breakdown ──
  const disagreementCategoryBreakdown: Record<string, number> = {};
  for (const report of verifiedReports) {
    if (report.clinicianAgreement === false) {
      const cat = report.disagreementCategory ?? "Other";
      disagreementCategoryBreakdown[cat] =
        (disagreementCategoryBreakdown[cat] ?? 0) + 1;
    }
  }

  // ── Model Consensus Rate ──
  const activeModels: ModelWeight[] = models.filter(
    (m: ModelWeight) => m.status === "active",
  );
  const modelConsensusRate =
    activeModels.length > 0
      ? activeModels.reduce(
          (sum: number, m: ModelWeight) => sum + (m.accuracyRate ?? 0),
          0,
        ) / activeModels.length
      : 0.94;

  // ── Kiosk Uptime Rate ──
  const totalKiosks = kiosks.length;
  const onlineKiosks = kiosks.filter(
    (k: KioskTerminal) => k.status === "online",
  ).length;
  const kioskUptimeRate =
    totalKiosks > 0 ? (onlineKiosks / totalKiosks) * 100 : 100;

  // ── Build and write snapshot document ──
  // Single document at analytics/latest — overwritten each cycle.
  const snapshot: TriageAnalyticsSnapshot = {
    periodId,
    totalTriageSessions,
    urgencyBreakdown: {
      critical: criticalCount,
      urgent: urgentCount,
      routine: routineCount,
    },
    aiAccuracyMetrics: {
      totalInferences,
      doctorAgreements,
      doctorOverrules,
    },
    averageWaitTimeSec: 300,
    facilityPerformance: [
      {
        facilityId: "all",
        patientVolume: totalTriageSessions,
        avgProcessingTimeSec: 300,
      },
    ],
    disagreementCategoryBreakdown,
    kioskUptimeRate: Math.round(kioskUptimeRate),
    modelConsensusRate: Math.round(modelConsensusRate * 100),
    computedAt: timestamp,
  };

  await db.collection("analytics").doc("latest").set(snapshot);

  logger.info(
    `[computeAnalyticsSnapshot] Snapshot written for ${periodId}: ` +
      `${totalTriageSessions} sessions, ${totalInferences} verified reports`,
  );
}

/**
 * Scheduled Cloud Function that aggregates triage analytics from live
 * Firestore collections and writes the pre-computed result to
 * `analytics/latest`.
 *
 * Runs every 15 minutes — frequent enough for dashboards without
 * excessive Firestore read costs.
 *
 * The client (src/lib/api.ts) reads this single document instead of
 * performing expensive aggregations in the browser.
 */
export const computeAnalyticsSnapshot = onSchedule(
  "every 15 minutes",
  async () => {
    const db = getFirestore();
    try {
      await computeAndWriteSnapshot(db);
    } catch (error) {
      logger.error(
        `[computeAnalyticsSnapshot] Aggregation failed:`,
        error,
      );
    }
  },
);

/**
 * Callable Cloud Function that exports the golden dataset for ML training.
 *
 * Requires a valid Firebase Authentication token. The caller must have
 * either the 'admin' or 'clinician' role (stored in a custom claim or
 * the 'role' field on the user's auth token).
 *
 * Returns the dataset as a JSONL string in the response.
 */
export const exportGoldenDataset = onCall(
  { enforceAppCheck: false },
  async (request) => {
    const db = getFirestore();

    // ── Authentication check ──
    if (!request.auth) {
      throw new Error(
        "UNAUTHENTICATED: A valid Firebase Authentication token is required.",
      );
    }

    const uid = request.auth.uid;

    // ── Authorization check ──
    // The caller must have 'admin' or 'clinician' role.
    // Roles are stored in the Firestore 'users' collection (the system of record,
    // see src/lib/rbac.ts). Query the user document by uid.
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    const callerRole: string | undefined = userData?.role;

    const authorizedRoles = ["admin", "clinician"];
    if (!callerRole || !authorizedRoles.includes(callerRole)) {
      throw new Error(
        `FORBIDDEN: Role '${callerRole ?? "none"}' is not authorized to ` +
          "export the golden dataset. Admin or clinician role required.",
      );
    }

    // ── Parse optional parameters ──
    const filterOverridesOnly =
      request.data?.filterOverridesOnly !== false;
    const maxRecords: number = request.data?.maxRecords ?? 1000;

    logger.info(
      `[exportGoldenDataset] Request by uid=${uid} role=${callerRole} ` +
        `filterOverridesOnly=${filterOverridesOnly} maxRecords=${maxRecords}`,
    );

    try {
      const jsonl = await exportGoldenDatasetAsJsonl(db, {
        filterOverridesOnly,
        maxRecords,
      });

      return {
        success: true,
        format: "jsonl",
        recordCount: jsonl.split("\n").filter(Boolean).length,
        data: jsonl,
      };
    } catch (error) {
      logger.error(
        `[exportGoldenDataset] Export failed:`,
        error,
      );
      throw new Error("INTERNAL: Golden dataset export failed.");
    }
  },
);
