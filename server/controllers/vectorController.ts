/**
 * Vector Search Controller
 * ========================
 * Express request handlers for vector search operations.
 * Ported from functions/src/vector-search.ts.
 *
 * These controllers accept data in the request body rather than
 * coupling to Firestore, making them compatible with the mock
 * payload factory and dual-mode integration layer.
 */

import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreDb } from "../services/firebaseAdmin";
import {
  generateEmbedding,
  generateEmbeddings,
  buildCaseSearchText,
} from "../services/openaiClient";
import {
  upsertVectors,
  upsertVector,
  deleteVectors,
  querySimilar,
  getVectorCount,
  type TriageCaseVectorMetadata,
  type TriageCaseVector,
  type VectorSearchMatch,
} from "../services/pineconeClient";

// ── Incoming Request Types ──

interface VectorSearchBody {
  query: string;
  topK?: number;
  filter?: Record<string, unknown>;
}

interface VectorSimilarBody {
  /** Pre-built search text (e.g., from buildCaseSearchText) */
  caseText: string;
  topK?: number;
}

interface VectorIndexAllBody {
  patients?: Array<{
    id: string;
    text: string;
    metadata?: Partial<TriageCaseVectorMetadata>;
  }>;
  reports?: Array<{
    id: string;
    text: string;
    metadata?: Partial<TriageCaseVectorMetadata>;
  }>;
}

interface VectorIndexBody {
  id: string;
  text: string;
  metadata?: Partial<TriageCaseVectorMetadata>;
}

interface VectorDeleteBody {
  ids: string[];
}

// ── Controller: Search ──

/**
 * POST /api/vector/search
 *
 * Performs a semantic search across indexed triage cases.
 * Generates an embedding for the query text, then queries Pinecone.
 */
export async function searchVectors(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { query, topK = 10, filter } = req.body as VectorSearchBody;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'query' must be a non-empty string.",
      });
      return;
    }

    console.log(
      `[vectorController] Search query="${query.substring(0, 80)}" topK=${topK}`,
    );

    // 1. Generate embedding for the query
    const embedding = await generateEmbedding(query);

    // 2. Search Pinecone
    const matches = await querySimilar(embedding, topK, filter);

    res.json({ success: true, matches, query });
  } catch (error) {
    console.error("[vectorController] Search failed:", error);
    next(error);
  }
}

// ── Controller: Get Similar ──

/**
 * POST /api/vector/similar
 *
 * Finds cases similar to a given case's text content.
 * Generates an embedding from the provided case text, then queries Pinecone.
 */
export async function getSimilarVectors(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { caseText, topK = 5 } = req.body as VectorSimilarBody;

    if (!caseText || typeof caseText !== "string" || caseText.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'caseText' must be a non-empty string.",
      });
      return;
    }

    console.log(
      `[vectorController] GetSimilar caseText="${caseText.substring(0, 80)}" topK=${topK}`,
    );

    // 1. Generate embedding from the case text
    const embedding = await generateEmbedding(caseText);

    // 2. Query Pinecone
    const matches = await querySimilar(embedding, topK, {});

    res.json({ success: true, matches });
  } catch (error) {
    console.error("[vectorController] GetSimilar failed:", error);
    next(error);
  }
}

// ── Controller: Index All ──

/**
 * POST /api/vector/index-all
 *
 * Batch indexes triage cases from the provided payload into Pinecone.
 * Accepts patient and/or report arrays, generates embeddings for each,
 * and upserts them to the index.
 */
/**
 * Fetches all triage patients from Firestore and builds search vectors.
 * Uses batch embedding for efficiency.
 */
interface FirestorePatient {
  patientName?: string;
  triageCategory?: string;
  status?: string;
  confidence?: number;
  timestamp?: string;
  traceEvents?: Array<{ reason?: string }>;
}

interface FirestoreReport {
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

async function fetchAndVectorizePatients(
  db: Firestore,
): Promise<TriageCaseVector[]> {
  const snapshot = await db.collection("patients").get();
  const items: Array<{ id: string; text: string; patient: FirestorePatient }> = [];

  for (const doc of snapshot.docs) {
    const patient = doc.data() as FirestorePatient;
    const text = buildCaseSearchText({
      patientName: patient.patientName,
      triageCategory: patient.triageCategory,
      status: patient.status,
      reason: patient.traceEvents?.[0]?.reason,
    });
    items.push({ id: doc.id, text, patient });
  }

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
      sourceType: "patient",
      reportCategory: null,
      subType: null,
      verified: null,
      clinicianOverride: null,
    },
  }));
}

async function fetchAndVectorizeReports(
  db: Firestore,
): Promise<TriageCaseVector[]> {
  const snapshot = await db.collection("reports").get();
  const items: Array<{ id: string; text: string; report: FirestoreReport }> = [];

  for (const doc of snapshot.docs) {
    const report = doc.data() as FirestoreReport;
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
      sourceType: "report",
      reportCategory: item.report.category ?? null,
      subType: item.report.subType ?? null,
      verified: item.report.status === "verified" ? true : null,
      clinicianOverride: item.report.clinicianTriageOverride ?? null,
    },
  }));
}

export async function indexAllVectors(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // ── Dual-mode: accept data in body OR fetch from Firestore ──
    const body = req.body as VectorIndexAllBody | Record<string, never>;
    const hasExplicitData =
      "patients" in req.body || "reports" in req.body;

    let patients: VectorIndexAllBody["patients"] = [];
    let reports: VectorIndexAllBody["reports"] = [];

    if (hasExplicitData) {
      // Mode A: Data provided by caller (mock factory, tests)
      patients = body.patients ?? [];
      reports = body.reports ?? [];
      console.log(
        `[vectorController] IndexAll (from request body): ${patients.length} patients, ${reports.length} reports`,
      );
    } else {
      // Mode B: Fetch from Firestore via Admin SDK
      const db = getFirestoreDb();
      if (!db) {
        res.status(503).json({
          success: false,
          error: "FIRESTORE_UNAVAILABLE",
          message:
            "Firestore Admin SDK is not configured. Set FIREBASE_PROJECT_ID and " +
            "GOOGLE_APPLICATION_CREDENTIALS in .env, or provide 'patients' and 'reports' in the request body.",
        });
        return;
      }

      console.log("[vectorController] IndexAll (from Firestore)...");

      const [patientVectors, reportVectors] = await Promise.all([
        fetchAndVectorizePatients(db),
        fetchAndVectorizeReports(db),
      ]);

      await upsertVectors([...patientVectors, ...reportVectors]);

      const totalInIndex = await getVectorCount();

      res.json({
        success: true,
        indexedCount: patientVectors.length + reportVectors.length,
        totalInIndex,
        patientsIndexed: patientVectors.length,
        reportsIndexed: reportVectors.length,
      });
      return;
    }

    // ── Mode A continued: process data from request body ──
    const vectors: TriageCaseVector[] = [];

    if (patients.length > 0) {
      const patientTexts = patients.map((p) => p.text);
      const patientEmbeddings = await generateEmbeddings(patientTexts);

      for (let i = 0; i < patients.length; i++) {
        const p = patients[i];
        vectors.push({
          id: p.id,
          values: patientEmbeddings[i],
          metadata: {
            patientName: p.metadata?.patientName ?? "Unknown",
            triageCategory: p.metadata?.triageCategory ?? "Unknown",
            status: p.metadata?.status ?? "Unknown",
            confidence: p.metadata?.confidence ?? 0,
            timestamp: p.metadata?.timestamp ?? new Date().toISOString(),
            sourceType: "patient",
            reportCategory: null,
            subType: null,
            verified: null,
            clinicianOverride: null,
            ...p.metadata,
          },
        });
      }
    }

    if (reports.length > 0) {
      const reportTexts = reports.map((r) => r.text);
      const reportEmbeddings = await generateEmbeddings(reportTexts);

      for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        vectors.push({
          id: `report_${r.id}`,
          values: reportEmbeddings[i],
          metadata: {
            patientName: r.metadata?.patientName ?? "Unknown",
            triageCategory: r.metadata?.triageCategory ?? "Unknown",
            status: r.metadata?.status ?? "Unknown",
            confidence: r.metadata?.confidence ?? 0,
            timestamp: r.metadata?.timestamp ?? new Date().toISOString(),
            sourceType: "report",
            reportCategory: r.metadata?.reportCategory ?? null,
            subType: r.metadata?.subType ?? null,
            verified: r.metadata?.verified ?? null,
            clinicianOverride: r.metadata?.clinicianOverride ?? null,
          },
        });
      }
    }

    await upsertVectors(vectors);

    const totalInIndex = await getVectorCount();

    res.json({
      success: true,
      indexedCount: vectors.length,
      totalInIndex,
      patientsIndexed: patients.length,
      reportsIndexed: reports.length,
    });
  } catch (error) {
    console.error("[vectorController] IndexAll failed:", error);
    next(error);
  }
}

// ── Controller: Index Single ──

/**
 * POST /api/vector/index
 *
 * Indexes a single triage case into Pinecone.
 */
export async function indexVector(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, text, metadata } = req.body as VectorIndexBody;

    if (!id || typeof id !== "string") {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'id' must be a non-empty string.",
      });
      return;
    }

    if (!text || typeof text !== "string") {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'text' must be a non-empty string.",
      });
      return;
    }

    console.log(`[vectorController] Index vector id=${id}`);

    const embedding = await generateEmbedding(text);

    const vector: TriageCaseVector = {
      id,
      values: embedding,
      metadata: {
        patientName: metadata?.patientName ?? "Unknown",
        triageCategory: metadata?.triageCategory ?? "Unknown",
        status: metadata?.status ?? "Unknown",
        confidence: metadata?.confidence ?? 0,
        timestamp: metadata?.timestamp ?? new Date().toISOString(),
        sourceType: metadata?.sourceType ?? "patient",
        reportCategory: metadata?.reportCategory ?? null,
        subType: metadata?.subType ?? null,
        verified: metadata?.verified ?? null,
        clinicianOverride: metadata?.clinicianOverride ?? null,
      },
    };

    await upsertVector(vector);

    res.json({ success: true });
  } catch (error) {
    console.error("[vectorController] Index failed:", error);
    next(error);
  }
}

// ── Controller: Delete ──

/**
 * DELETE /api/vector
 *
 * Deletes vectors from the Pinecone index by their IDs.
 */
export async function deleteVectorsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { ids } = req.body as VectorDeleteBody;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'ids' must be a non-empty array of strings.",
      });
      return;
    }

    console.log(`[vectorController] Delete ${ids.length} vectors`);

    await deleteVectors(ids);

    res.json({ success: true, deletedCount: ids.length });
  } catch (error) {
    console.error("[vectorController] Delete failed:", error);
    next(error);
  }
}

// ── Controller: Index Stats ──

/**
 * GET /api/vector/stats
 *
 * Returns the total vector count in the Pinecone index.
 */
export async function getVectorStats(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const totalVectors = await getVectorCount();
    res.json({ success: true, totalVectors });
  } catch (error) {
    console.error("[vectorController] Stats failed:", error);
    next(error);
  }
}

// ── Utility: Build Search Text (exposed for mock factory usage) ──

export { buildCaseSearchText };
