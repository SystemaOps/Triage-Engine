/**
 * X-Ray Classification Routes
 * ============================
 * Express routes that accept X-ray image uploads and proxy them to the
 * unified Triage API's /visual-scan endpoint for medical imaging analysis.
 *
 * All routes are protected by the auth middleware.
 *
 * New unified API fields (optional, sent as multipart form fields):
 *   - session_id  — Triage session ID (for session-aware uploads)
 *   - patient_id  — Patient ID (for session-aware uploads)
 */

import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth";
import { classifyXRay } from "../services/xrayClient";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff", "image/dicom"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WebP, TIFF, DICOM`));
    }
  },
});

router.use(authMiddleware);

/**
 * POST /api/xray/classify
 *
 * Upload an X-ray image for medical condition classification via the unified API.
 * Query param: target (chest, bone, dental, spine) — default: chest
 *
 * Optional form fields for the unified API flow:
 *   - session_id  — Triage session ID (forwarded to the unified API)
 *   - patient_id  — Patient ID (forwarded to the unified API)
 */
router.post(
  "/classify",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          res.status(400).json({ success: false, error: "UPLOAD_ERROR", message: `Upload error: ${err.message}` });
          return;
        }
        res.status(400).json({ success: false, error: "INVALID_FILE", message: err.message });
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "MISSING_FILE", message: "No file uploaded." });
        return;
      }

      const target = (req.query.target as string) || "chest";

      // Extract optional unified API fields from multipart form body
      const sessionId = req.body.session_id as string | undefined;
      const patientId = req.body.patient_id as string | undefined;

      const result = await classifyXRay({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        target,
        sessionId,
        patientId,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
