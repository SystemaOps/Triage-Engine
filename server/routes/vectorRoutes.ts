/**
 * Vector Search Routes
 * ====================
 * Defines the /api/vector/* REST endpoints for semantic triage case search.
 * All routes are protected by the auth middleware.
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  searchVectors,
  getSimilarVectors,
  indexAllVectors,
  indexVector,
  deleteVectorsController,
  getVectorStats,
} from "../controllers/vectorController";

const router = Router();

// All vector routes require authentication
router.use(authMiddleware);

// ── Search Routes ──

/**
 * POST /api/vector/search
 *
 * Performs a semantic search across indexed triage cases.
 * Body: { query: string, topK?: number, filter?: object }
 */
router.post("/search", searchVectors);

/**
 * POST /api/vector/similar
 *
 * Finds cases similar to a given case's text content.
 * Body: { caseText: string, topK?: number }
 */
router.post("/similar", getSimilarVectors);

// ── Index Management Routes ──

/**
 * POST /api/vector/index-all
 *
 * Batch indexes multiple triage cases into Pinecone.
 * Body: { patients?: Array<{ id, text, metadata? }>, reports?: Array<{ id, text, metadata? }> }
 */
router.post("/index-all", indexAllVectors);

/**
 * POST /api/vector/index
 *
 * Indexes a single triage case into Pinecone.
 * Body: { id: string, text: string, metadata?: object }
 */
router.post("/index", indexVector);

/**
 * DELETE /api/vector
 *
 * Deletes vectors from the Pinecone index by their IDs.
 * Body: { ids: string[] }
 */
router.delete("/", deleteVectorsController);

/**
 * GET /api/vector/stats
 *
 * Returns the total vector count in the Pinecone index.
 */
router.get("/stats", getVectorStats);

export default router;
