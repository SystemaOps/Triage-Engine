/**
 * Auth Middleware
 * ===============
 * Validates requests using a shared API key (adminToken) set in .env.
 * Designed for local development and Proxmox deployment where a simple
 * pre-shared key is sufficient for service-to-service authentication.
 *
 * Environment variables:
 *   ADMIN_API_KEY  — Shared secret sent via Authorization: Bearer <key>
 *                    If not set, authentication is skipped (local dev mode).
 */

import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  /** Set to true when the request was authenticated */
  authenticated?: boolean;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const adminApiKey = process.env.ADMIN_API_KEY;

  // If no API key is configured, allow all requests (local dev mode)
  if (!adminApiKey) {
    req.authenticated = false;
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or malformed Authorization header. Expected: Bearer <API_KEY>",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (token !== adminApiKey) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Invalid API key.",
    });
    return;
  }

  req.authenticated = true;
  next();
}
