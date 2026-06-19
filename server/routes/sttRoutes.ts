/**
 * STT (Speech-to-Text) Processing Routes
 * =======================================
 * Express routes that accept audio uploads and proxy them to the external
 * STT microservice for speech transcription.
 *
 * All routes are protected by the auth middleware.
 */

import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth";
import { voiceTriageAudio, checkTriageApiHealth } from "../services/triageApiClient";
import { getSession } from "../services/sttClient";

const router = Router();

// Multer: store uploaded files in memory as Buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max for audio files
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "audio/wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/ogg",
      "audio/webm",
      "audio/flac",
      "audio/aac",
      "audio/x-wav",
      "audio/x-m4a",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}. Allowed: WAV, MP3, M4A, OGG, WebM, FLAC, AAC`));
    }
  },
});

// All STT routes require authentication
router.use(authMiddleware);

/**
 * POST /api/stt/transcribe
 *
 * Upload an audio file for speech-to-text transcription.
 * Accepts multipart/form-data with a single `file` field.
 *
 * Query params (optional, passed through to STT API):
 *   - model: Whisper model size (default: "base")
 *   - language: Language code (default: "en")
 *
 * Returns transcribed text and session metadata.
 */
router.post(
  "/transcribe",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          res.status(400).json({
            success: false,
            error: "UPLOAD_ERROR",
            message: `Audio upload error: ${err.message}`,
          });
          return;
        }
        res.status(400).json({
          success: false,
          error: "INVALID_FILE",
          message: err.message,
        });
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "MISSING_FILE",
          message: "No audio file uploaded. Provide a 'file' field with an audio recording.",
        });
        return;
      }

      const sessionId = `stt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      console.log(
        `[sttRoutes] Transcribing via unified voice-triage: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype}, session=${sessionId})`,
      );

      // Route through the unified API's voice-triage endpoint
      // which handles STT transcription + LLM triage in one call.
      const triageResult = await voiceTriageAudio(
        sessionId,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      // Map the voice-triage response to the frontend's expected format.
      // The `reasoning` field from the triage serves as the clinical text,
      // and we include the full triage result for the UI to display.
      res.json({
        success: true,
        text: triageResult.reasoning,
        language: "en",
        timestamp: new Date().toISOString(),
        model: triageResult.session_id ? "unified-voice-triage" : "unified-voice-triage",
        processingTime: triageResult.latency_ms ? triageResult.latency_ms / 1000 : null,
        sessionId: triageResult.session_id,
        audioFile: null,
        transcriptFile: null,
        metadataFile: null,
        // Include triage data so the frontend can skip the separate triage step
        triage: {
          session_id: triageResult.session_id,
          urgency_level: triageResult.urgency_level,
          reasoning: triageResult.reasoning,
          next_steps: triageResult.next_steps,
          red_flags: triageResult.red_flags,
          disclaimer: triageResult.disclaimer,
          latency_ms: triageResult.latency_ms,
        },
      });
    } catch (error) {
      console.error("[sttRoutes] Transcription failed:", error);
      next(error);
    }
  },
);

/**
 * POST /api/stt/health
 *
 * Checks if the external STT API is reachable.
 * Note: POST is used to match the frontend's _request method pattern.
 */
router.post("/health", async (_req, res, next) => {
  try {
    // Check the unified API health instead of the separate STT service
    const health = await checkTriageApiHealth();
    res.json({ success: true, reachable: true, status: health.status, model: health.model, service: "stt-via-unified-api" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/stt/session
 *
 * Retrieves details for a specific transcription session.
 * Body: { session_id: string }
 */
router.post("/session", async (req, res, next) => {
  try {
    const { session_id } = req.body;

    if (!session_id || typeof session_id !== "string") {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'session_id' must be a non-empty string.",
      });
      return;
    }

    const sessionData = await getSession(session_id);
    res.json({ success: true, data: sessionData });
  } catch (error) {
    next(error);
  }
});

export default router;
