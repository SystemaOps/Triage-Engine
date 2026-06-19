/**
 * Firebase Admin SDK Service
 * ==========================
 * Initializes the Firebase Admin SDK for server-side Firestore access.
 * Used for operations that need to read/write Firestore directly:
 *   - Fetching data for batch indexing (indexAll)
 *   - Role lookups for authorization (future)
 *
 * Environment variables (.env):
 *   GOOGLE_APPLICATION_CREDENTIALS — Path to service account JSON file
 *                                    OR leave unset to use Application Default Credentials
 *   FIREBASE_PROJECT_ID           — Your Firebase project ID (required)
 *
 * Two initialization modes:
 *   1. Service account file: Set GOOGLE_APPLICATION_CREDENTIALS to the path
 *   2. Application Default Credentials: Works in Firebase Emulator Suite
 *      or on GCP-hosted environments
 */

import { initializeApp, getApps, cert, type AppOptions } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

let db: Firestore | null = null;

/**
 * Returns a Firestore Admin instance, initializing it on first call.
 * Returns null if the required credentials are not available.
 */
export function getFirestoreDb(): Firestore | null {
  if (db) return db;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.warn(
      "[firebaseAdmin] FIREBASE_PROJECT_ID not set. Firestore access unavailable.\n" +
        "  Set it in .env to enable server-side Firestone operations (e.g., batch indexing).",
    );
    return null;
  }

  // Check if Firebase Admin is already initialized
  if (getApps().length === 0) {
    const options: AppOptions = { projectId };

    // Prefer service account file for on-premises Proxmox deployment
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (saPath) {
      try {
        const raw = readFileSync(saPath, "utf-8");
        const serviceAccount = JSON.parse(raw) as Record<string, string>;
        options.credential = cert(serviceAccount as Parameters<typeof cert>[0]);
        console.log("[firebaseAdmin] Initialized with service account:", saPath);
      } catch (err) {
        console.error(
          `[firebaseAdmin] Failed to load service account from '${saPath}':`,
          err,
        );
        return null;
      }
    } else {
      // Fall back to Application Default Credentials
      // Works with: firebase emulators, GCP, or ADC-configured environments
      console.log(
        "[firebaseAdmin] No service account file. Using Application Default Credentials.",
      );
    }

    initializeApp(options);
  }

  db = getFirestore();
  return db;
}
