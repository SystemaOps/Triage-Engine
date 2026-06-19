/**
 * OCR Processing Routes
 * =====================
 * Express routes that accept image uploads and proxy them to the unified
 * Triage API's /reports endpoint for medical report processing.
 *
 * All routes are protected by the auth middleware.
 *
 * New unified API fields (optional, sent as multipart form fields):
 *   - session_id  — Triage session ID (for session-aware uploads)
 *   - patient_id  — Patient ID (for session-aware uploads)
 *   - report_type — Report type label (default: "blood_report")
 */

import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth";
import { processOcrImage, checkOcrHealth } from "../services/ocrClient";

const router = Router();

// Multer: store uploaded files in memory as Buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/tiff",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WebP, TIFF`));
    }
  },
});

// All OCR routes require authentication
router.use(authMiddleware);

/**
 * POST /api/ocr/process
 *
 * Upload a blood report image for OCR processing.
 * Accepts multipart/form-data with a single `file` field.
 *
 * Optional form fields for the unified API flow:
 *   - session_id  — Triage session ID (forwarded to the unified API)
 *   - patient_id  — Patient ID (forwarded to the unified API)
 *   - report_type — Report type label (default: "blood_report")
 *
 * Returns the extracted lab values from the unified triage API.
 */
router.post(
  "/process",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          res.status(400).json({
            success: false,
            error: "UPLOAD_ERROR",
            message: `File upload error: ${err.message}`,
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
          message: "No file uploaded. Provide a 'file' field with a blood report image.",
        });
        return;
      }

      // Extract optional unified API fields from multipart form body
      const sessionId = req.body.session_id as string | undefined;
      const patientId = req.body.patient_id as string | undefined;
      const reportType = req.body.report_type as string | undefined;

      console.log(
        `[ocrRoutes] Processing OCR: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})` +
          (sessionId ? `, session=${sessionId}` : ""),
      );

      const result = await processOcrImage({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        sessionId,
        patientId,
        reportType,
      });

      res.json(result);
    } catch (error) {
      console.error("[ocrRoutes] OCR processing failed:", error);
      next(error);
    }
  },
);

/**
 * POST /api/ocr/health
 *
 * Checks if the external OCR API is reachable.
 * Note: POST is used to match the frontend's _request method pattern.
 */
router.post("/health", async (_req, res, next) => {
  try {
    const health = await checkOcrHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    next(error);
  }
});

export default router;
