/**
 * Vector Search Cloud Functions
 * ==============================
 * Provides semantic search and similarity lookup for triage cases
 * using Pinecone vector database.
 *
 * Functions:
 *   searchTriageCases     — Callable function: natural-language search
 *   getSimilarCases       — Callable function: find cases similar to a given case
 *   indexAllTriageCases   — Callable function: (re-)index all cases in Pinecone
 *   indexPatientOnWrite   — Firestore trigger: auto-index new patient documents
 */

import { onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  generateEmbedding,
  generateEmbeddings,
  buildCaseSearchText,
} from "./embeddings";
import {
  upsertVectors,
  upsertVector,
  deleteVectors,
  querySimilar,
  getVectorCount,
  type TriageCaseVector,
  type TriageCaseVectorMetadata,
  type VectorSearchMatch,
} from "./vector-store";

// ── Type definitions ──

interface TriageRecord {
  id?: string;
  patientName?: string;
  triageCategory?: string;
  confidence?: number;
  timestamp?: string;
  status?: string;
  traceEvents?: Array<{ reason?: string }>;
}

interface DiagnosticReportData {
  id?: string;
  patientId?: string;
  patientName?: string;
  category?: string;
  subType?: string;
  status?: string;
  confidence?: number;
  content?: {
    aiAnalysis?: string;
    rawText?: string;
  };
  reviewNote?: string;
  clinicianTriageOverride?: string | null;
}

// ── Helpers ──

/**
 * Fetches all triage patients from Firestore and builds search vectors.
 * Uses batch embedding for efficiency.
 */
async function fetchAndVectorizePatients(
  db: Firestore,
): Promise<TriageCaseVector[]> {
  const snapshot = await db.collection("patients").get();
  const items: Array<{ id: string; text: string; patient: TriageRecord }> = [];

  for (const doc of snapshot.docs) {
    const patient = doc.data() as TriageRecord;
    const text = buildCaseSearchText({
      patientName: patient.patientName,
      triageCategory: patient.triageCategory,
      status: patient.status,
      reason: patient.traceEvents?.[0]?.reason,
    });
    items.push({ id: doc.id, text, patient });
  }

  // Batch generate all embeddings
  const texts = items.map((i) => i.text);
  const embeddings = await generateEmbeddings(texts);

  return items.map((item, index) => ({
    id: item.id,
    values: embeddings[index],
    metadata: {
      patientName: item.patient.patientName ?? "Unknown",
      triageCategory: item.patient.triageCategory ?? "Unknown",
      status: item.patient.status ?? "Unknown",
      confidence: item.patient.confidence ?? 0,
      timestamp: item.patient.timestamp ?? new Date().toISOString(),
      sourceType: "patient" as const,
      reportCategory: null,
      subType: null,
      verified: null,
      clinicianOverride: null,
    },
  }));
}

/**
 * Fetches all diagnostic reports from Firestore and builds search vectors.
 * Uses batch embedding for efficiency.
 */
async function fetchAndVectorizeReports(
  db: Firestore,
): Promise<TriageCaseVector[]> {
  const snapshot = await db.collection("reports").get();
  const items: Array<{
    id: string;
    text: string;
    report: DiagnosticReportData;
  }> = [];

  for (const doc of snapshot.docs) {
    const report = doc.data() as DiagnosticReportData;
    const text = buildCaseSearchText({
      patientName: report.patientName,
      triageCategory: report.category,
      status: report.status,
      aiAnalysis: report.content?.aiAnalysis ?? null,
      rawText: report.content?.rawText ?? null,
      reviewNote: report.reviewNote ?? null,
    });
    items.push({ id: doc.id, text, report });
  }

  // Batch generate all embeddings
  const texts = items.map((i) => i.text);
  const embeddings = await generateEmbeddings(texts);

  return items.map((item, index) => ({
    id: `report_${item.id}`,
    values: embeddings[index],
    metadata: {
      patientName: item.report.patientName ?? "Unknown",
      triageCategory: item.report.category ?? "Unknown",
      status: item.report.status ?? "Unknown",
      confidence: item.report.confidence ?? 0,
      timestamp: new Date().toISOString(),
      sourceType: "report" as const,
      reportCategory: item.report.category ?? null,
      subType: item.report.subType ?? null,
      verified: item.report.status === "verified" ? true : null,
      clinicianOverride: item.report.clinicianTriageOverride ?? null,
    },
  }));
}

// ── Search Triage Cases (Callable) ──

/**
 * Performs a semantic search across indexed triage cases.
 *
 * @param query - Natural language search query
 * @param topK - Number of results (default: 10)
 * @param filter - Optional metadata filter (Pinecone filter syntax)
 *
 * Requires: Authenticated user with admin or clinician role
 */
export const searchTriageCases = onCall(
  {
    enforceAppCheck: false,
    minInstances: 0,
    secrets: ["PINECONE_API_KEY", "OPENAI_API_KEY"],
  },
  async (request) => {
    // ── Authentication check ──
    if (!request.auth) {
      throw new Error(
        "UNAUTHENTICATED: A valid Firebase Authentication token is required.",
      );
    }

    // ── Authorization (admin or clinician) ──
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const userData = userDoc.data();
    const callerRole: string | undefined = userData?.role;

    if (callerRole !== "admin" && callerRole !== "clinician") {
      throw new Error(
        `FORBIDDEN: Role '${callerRole ?? "none"}' is not authorized to search cases. Admin or clinician role required.`,
      );
    }

    // ── Parse parameters ──
    const query: string | undefined = request.data?.query;
    const topK: number = request.data?.topK ?? 10;
    const filter: Record<string, unknown> | undefined = request.data?.filter;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw new Error("INVALID_ARGUMENT: 'query' must be a non-empty string.");
    }

    logger.info(
      `[searchTriageCases] uid=${request.auth.uid} query="${query.substring(0, 80)}" topK=${topK}`,
    );

    try {
      // 1. Generate embedding for the query
      const embedding = await generateEmbedding(query);

      // 2. Search Pinecone
      const matches = await querySimilar(embedding, topK, filter);

      return { success: true, matches, query };
    } catch (error) {
      logger.error(`[searchTriageCases] Search failed:`, error);
      throw new Error("INTERNAL: Semantic search failed. Check function logs.");
    }
  },
);

// ── Get Similar Cases (Callable) ──

/**
 * Finds triage cases similar to a given case by its Firestore document ID.
 *
 * @param caseId - The Firestore document ID of the triage case
 * @param topK - Number of similar results (default: 5)
 *
 * Requires: Authenticated user with admin or clinician role
 */
export const getSimilarCases = onCall(
  {
    enforceAppCheck: false,
    secrets: ["PINECONE_API_KEY", "OPENAI_API_KEY"],
  },
  async (request) => {
    if (!request.auth) {
      throw new Error("UNAUTHENTICATED: Authentication required.");
    }

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const userData = userDoc.data();
    const callerRole: string | undefined = userData?.role;

    if (callerRole !== "admin" && callerRole !== "clinician") {
      throw new Error(
        `FORBIDDEN: Role '${callerRole ?? "none"}' not authorized.`,
      );
    }

    const caseId: string | undefined = request.data?.caseId;
    const topK: number = request.data?.topK ?? 5;

    if (!caseId || typeof caseId !== "string") {
      throw new Error(
        "INVALID_ARGUMENT: 'caseId' must be a non-empty string.",
      );
    }

    logger.info(
      `[getSimilarCases] uid=${request.auth.uid} caseId=${caseId} topK=${topK}`,
    );

    try {
      let patientName = "";
      let reason = "";

      if (caseId.startsWith("report_")) {
        const reportId = caseId.replace("report_", "");
        const reportSnap = await db.collection("reports").doc(reportId).get();
        if (reportSnap.exists) {
          const report = reportSnap.data() as DiagnosticReportData;
          patientName = report.patientName ?? "";
          reason = report.content?.aiAnalysis ?? "";
        }
      } else {
        const patientSnap = await db.collection("patients").doc(caseId).get();
        if (patientSnap.exists) {
          const patient = patientSnap.data() as TriageRecord;
          patientName = patient.patientName ?? "";
          reason = patient.traceEvents?.[0]?.reason ?? "";
        }
      }

      const text = buildCaseSearchText({ patientName, reason });
      const embedding = await generateEmbedding(text);
      const matches = await querySimilar(embedding, topK, {});

      return { success: true, matches, caseId };
    } catch (error) {
      logger.error(`[getSimilarCases] Lookup failed:`, error);
      throw new Error("INTERNAL: Similarity lookup failed.");
    }
  },
);

// ── Index All Triage Cases (Callable) ──

/**
 * (Re-)indexes all triage patients and diagnostic reports into Pinecone.
 * This is useful for initial seeding or rebuilding the index.
 *
 * Requires: Authenticated admin user
 */
export const indexAllTriageCases = onCall(
  {
    enforceAppCheck: false,
    secrets: ["PINECONE_API_KEY", "OPENAI_API_KEY"],
    timeoutSeconds: 540, // 9 minutes — may need adjustment for large datasets
  },
  async (request) => {
    if (!request.auth) {
      throw new Error("UNAUTHENTICATED: Authentication required.");
    }

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const userData = userDoc.data();
    const callerRole: string | undefined = userData?.role;

    if (callerRole !== "admin") {
      throw new Error("FORBIDDEN: Admin role required to re-index.");
    }

    logger.info(
      `[indexAllTriageCases] Started by uid=${request.auth.uid}`,
    );

    try {
      // Fetch and index patients
      logger.info("[indexAllTriageCases] Indexing patients...");
      const patientVectors = await fetchAndVectorizePatients(db);
      await upsertVectors(patientVectors);
      logger.info(
        `[indexAllTriageCases] Indexed ${patientVectors.length} patients`,
      );

      // Fetch and index reports
      logger.info("[indexAllTriageCases] Indexing reports...");
      const reportVectors = await fetchAndVectorizeReports(db);
      await upsertVectors(reportVectors);
      logger.info(
        `[indexAllTriageCases] Indexed ${reportVectors.length} reports`,
      );

      const totalVectors = patientVectors.length + reportVectors.length;
      const indexStats = await getVectorCount();

      return {
        success: true,
        indexedCount: totalVectors,
        totalInIndex: indexStats,
        patientsIndexed: patientVectors.length,
        reportsIndexed: reportVectors.length,
      };
    } catch (error) {
      logger.error(`[indexAllTriageCases] Indexing failed:`, error);
      throw new Error("INTERNAL: Indexing failed.");
    }
  },
);

// ── Auto-Index on Patient Write (Firestore Trigger) ──

/**
 * Automatically indexes a triage patient document when it is created
 * or updated in Firestore.
 *
 * Uses `onDocumentWritten` to handle both create and delete events.
 * For updates, consider adding a `lastVectorizedAt` field to debounce
 * if frequent updates are expected.
 */
export const indexPatientOnWrite = onDocumentWritten(
  {
    document: "patients/{patientId}",
    secrets: ["PINECONE_API_KEY", "OPENAI_API_KEY"],
  },
  async (event) => {
    const patientId = event.params.patientId;

    // If the document was deleted, remove from index
    if (!event.data?.after?.exists) {
      await deleteVectors([patientId]);
      logger.info(
        `[indexPatientOnWrite] Deleted vector for patient ${patientId}`,
      );
      return;
    }

    const patient = event.data.after.data() as TriageRecord;

    const text = buildCaseSearchText({
      patientName: patient.patientName,
      triageCategory: patient.triageCategory,
      status: patient.status,
      reason: patient.traceEvents?.[0]?.reason,
    });

    const embedding = await generateEmbedding(text);

    const vector: TriageCaseVector = {
      id: patientId,
      values: embedding,
      metadata: {
        patientName: patient.patientName ?? "Unknown",
        triageCategory: patient.triageCategory ?? "Unknown",
        status: patient.status ?? "Unknown",
        confidence: patient.confidence ?? 0,
        timestamp: patient.timestamp ?? new Date().toISOString(),
        sourceType: "patient",
        reportCategory: null,
        subType: null,
        verified: null,
        clinicianOverride: null,
      },
    };

    await upsertVector(vector);

    logger.info(
      `[indexPatientOnWrite] Indexed patient ${patientId}: ${patient.patientName}`,
    );
  },
);
