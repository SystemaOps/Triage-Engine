/**
 * LLM + RAG Routes
 * ================
 * Express routes that proxy to the external triage LLM on Railway.
 * All endpoints are protected by the auth middleware.
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  checkHealth,
  runTriage,
  chatWithLLM,
  rebuildIndex,
} from "../services/llmClient";

const router = Router();

// All LLM routes require authentication
router.use(authMiddleware);

/**
 * GET /api/llm/health
 *
 * Returns the health status and current model info from the LLM service.
 */
router.get("/health", async (_req, res, next) => {
  try {
    const health = await checkHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm/triage
 *
 * Sends a patient case to the LLM for triage analysis.
 * Body: { symptoms: string, patient_case?: string, chief_complaint?: string, vitals?: object }
 */
router.post("/triage", async (req, res, next) => {
  try {
    const { symptoms, patient_case, chief_complaint, vitals } = req.body;

    if (!symptoms || typeof symptoms !== "string" || symptoms.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'symptoms' must be a non-empty string (comma-separated or clinical text).",
      });
      return;
    }

    const result = await runTriage({
      symptoms,
      patient_case,
      chief_complaint,
      vitals,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm/chat
 *
 * Follow-up chat for an existing triage session.
 * Body: { session_id: string, message: string }
 */
router.post("/chat", async (req, res, next) => {
  try {
    const { session_id, message } = req.body;

    if (!session_id || typeof session_id !== "string") {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'session_id' must be a non-empty string.",
      });
      return;
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'message' must be a non-empty string.",
      });
      return;
    }

    const result = await chatWithLLM({ session_id, message });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm/rebuild-index
 *
 * Triggers a full rebuild of the BM25 keyword index.
 * Requires X-Admin-Key header (configured server-side).
 */
router.post("/rebuild-index", async (_req, res, next) => {
  try {
    const result = await rebuildIndex();
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
