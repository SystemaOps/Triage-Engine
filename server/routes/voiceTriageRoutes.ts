/**
 * Voice Triage Routes
 * ===================
 * Express routes that accept audio uploads and proxy them to the unified
 * Medical Triage API's /voice-triage endpoint, which transcribes audio
 * via STT and runs the triage pipeline in a single call.
 *
 * All routes are protected by the auth middleware.
 */

import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth";
import { voiceTriageAudio } from "../services/triageApiClient";

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

// All voice triage routes require authentication
router.use(authMiddleware);

/**
 * POST /api/voice-triage/triage
 *
 * Upload an audio file for voice-based triage analysis.
 * The unified API handles STT transcription + LLM triage in one call.
 *
 * Accepts multipart/form-data with:
 *   - audio (file) — audio recording of patient symptoms
 *   - session_id (string, optional) — existing session ID
 *
 * Returns a TriageApiResponse with urgency level, reasoning, next steps, and red flags.
 */
router.post(
  "/triage",
  (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
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
          message: "No audio file uploaded. Provide an 'audio' field with a voice recording.",
        });
        return;
      }

      const sessionId = (req.body?.session_id as string) || `voice-${Date.now()}`;

      console.log(
        `[voiceTriageRoutes] Processing audio: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype}, session=${sessionId})`,
      );

      const result = await voiceTriageAudio(
        sessionId,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error("[voiceTriageRoutes] Voice triage failed:", error);
      next(error);
    }
  },
);

/**
 * POST /api/voice-triage/health
 *
 * Checks if the unified voice-triage API is reachable.
 * Note: reuses the existing triage API health check since it's the same service.
 */
router.post("/health", async (_req, res, next) => {
  try {
    const { checkTriageApiHealth } = await import("../services/triageApiClient");
    const health = await checkTriageApiHealth();
    res.json({ success: true, voice: "connected", ...health });
  } catch (error) {
    next(error);
  }
});

export default router;
