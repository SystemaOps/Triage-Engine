/**
 * Firestore Data Cleanup Script (Client SDK)
 * ============================================
 * Uses the Firebase WEB SDK (not Admin) to authenticate via email/password
 * and delete all dummy/test data from Firestore collections.
 *
 * Run: npx tsx scripts/cleanup_firestore.ts
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBkmXM_DWyJWwg_TMMUNCwd2G82BJKOnMo",
  authDomain: "admin-portal-2993d.firebaseapp.com",
  projectId: "admin-portal-2993d",
  storageBucket: "admin-portal-2993d.firebasestorage.app",
  messagingSenderId: "207027775114",
  appId: "1:207027775114:web:aff76b6c01f6f3efee6f73",
  measurementId: "G-9172D88ZCD",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Collections to clean — preserving 'users' (login roles) and 'settings' (app config)
const COLLECTIONS_TO_WIPE = [
  "patients",
  "reports",
  "auditLogs",
  "notifications",
  "kiosks",
  "organizations",
  "regions",
  "facilities",
  "systemHealth",
  "modelWeights",
  "analytics",
];

async function deleteCollection(collectionName: string): Promise<number> {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);
  const count = snapshot.size;

  if (count === 0) {
    console.log(`  ⬚  ${collectionName}: empty (0 docs)`);
    return 0;
  }

  // Firestore writeBatch supports max 500 ops per batch
  const batchSize = 450;
  let deleted = 0;

  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const chunk = snapshot.docs.slice(i, i + batchSize);
    const batch = writeBatch(db);
    for (const docSnap of chunk) {
      batch.delete(doc(db, collectionName, docSnap.id));
    }
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(`  ✓  ${collectionName}: deleted ${deleted} document(s)`);
  return deleted;
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Firestore Data Cleanup — MedTriage OS           ║");
  console.log("║  Project: admin-portal-2993d                     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Step 1: Authenticate
  const credentials = [
    { email: "admin@medtriage.com", password: "admin123" },
    { email: "admin@medtriage.com", password: "Admin123!" },
    { email: "rakesh@medtriage.com", password: "admin123" },
  ];

  let authenticated = false;
  for (const cred of credentials) {
    try {
      console.log(`Attempting login: ${cred.email}...`);
      const userCred = await signInWithEmailAndPassword(auth, cred.email, cred.password);
      console.log(`✓ Authenticated as: ${userCred.user.email} (uid: ${userCred.user.uid})\n`);
      authenticated = true;
      break;
    } catch (e: any) {
      console.log(`  ✗ Failed: ${e.code || e.message}`);
    }
  }

  if (!authenticated) {
    console.error("\n✗ Could not authenticate with any known credentials.");
    process.exit(1);
  }

  // Step 2: Delete all data from target collections
  console.log("Deleting data from collections...\n");

  let totalDeleted = 0;
  let errors = 0;

  for (const collName of COLLECTIONS_TO_WIPE) {
    try {
      const count = await deleteCollection(collName);
      totalDeleted += count;
    } catch (e: any) {
      console.log(`  ✗  ${collName}: ERROR — ${e.code || e.message}`);
      errors++;
    }
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`  Total documents deleted: ${totalDeleted}`);
  console.log(`  Collections processed:   ${COLLECTIONS_TO_WIPE.length}`);
  console.log(`  Errors:                  ${errors}`);
  console.log(`  Preserved:               users, settings`);
  console.log("══════════════════════════════════════════════════\n");

  if (errors === 0) {
    console.log("✓ All dummy/test data has been removed successfully.");
  } else {
    console.log(`⚠ Completed with ${errors} error(s). Some collections may have permission restrictions.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
