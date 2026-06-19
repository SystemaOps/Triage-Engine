/**
 * External Services Health Routes
 * ================================
 * Provides a unified endpoint to check the health status of ALL external
 * Railway services and writes results to the Firestore `systemHealth` collection
 * so the System Health Dashboard displays real Railway service status.
 *
 * Routes:
 *   GET  /api/external-services/health  — Unified health check (JSON)
 *   POST /api/external-services/refresh — Force refresh Firestore systemHealth
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  checkAllExternalServices,
  writeHealthReportToFirestore,
} from "../services/healthMonitor";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/external-services/health
 *
 * Pings ALL external Railway services in parallel and returns a
 * consolidated health report. Also writes the results to the Firestore
 * systemHealth collection so the System Health Dashboard picks them up.
 */
router.get("/health", async (_req, res, next) => {
  try {
    const report = await checkAllExternalServices();

    // ── Write results to Firestore systemHealth collection ──
    // Uses the shared writeHealthReportToFirestore helper which gracefully
    // handles the case where Firebase Admin is not configured.
    await writeHealthReportToFirestore(report);

    res.json({
      success: true,
      timestamp: report.timestamp,
      overallStatus: report.overallStatus,
      services: report.services,
    });
  } catch (error) {
    console.error("[externalServicesRoutes] Health check failed:", error);
    next(error);
  }
});

/**
 * POST /api/external-services/refresh
 *
 * Force-refreshes all external service health checks and writes the
 * results to Firestore. Useful for triggering a health check on demand.
 */
router.post("/refresh", async (_req, res, next) => {
  try {
    const report = await checkAllExternalServices();

    await writeHealthReportToFirestore(report);

    res.json({
      success: true,
      message: "External services health refreshed.",
      timestamp: report.timestamp,
      overallStatus: report.overallStatus,
    });
  } catch (error) {
    console.error("[externalServicesRoutes] Refresh failed:", error);
    next(error);
  }
});

export default router;
