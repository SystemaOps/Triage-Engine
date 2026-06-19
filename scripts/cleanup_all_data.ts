/**
 * Complete Firestore Data Wipe
 * =============================
 * Authenticates with Firebase Auth and deletes ALL documents
 * from every collection. This is a full wipe — no data preserved.
 *
 * Run: npx tsx scripts/cleanup_all_data.ts
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

// ALL collections to wipe — including users, settings
const ALL_COLLECTIONS = [
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
  "users",
  "settings",
];

async function deleteCollection(collectionName: string): Promise<number> {
  const colRef = collection(db, collectionName);
  const snapshot = await getDocs(colRef);
  const count = snapshot.size;

  if (count === 0) {
    console.log(`  ⬚  ${collectionName}: empty (0 docs)`);
    return 0;
  }

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
  console.log("║  FIRESTORE COMPLETE WIPE                       ║");
  console.log("║  Project: admin-portal-2993d                    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Step 1: Authenticate
  console.log("Authenticating as admin@test.com...");
  try {
    const userCred = await signInWithEmailAndPassword(auth, "admin@test.com", "test123");
    console.log(`✓ Authenticated as: ${userCred.user.email}\n`);
  } catch (e: any) {
    console.error(`✗ Authentication failed: ${e.code || e.message}`);
    process.exit(1);
  }

  // Step 2: Delete all data from ALL collections
  console.log("Deleting ALL documents from ALL collections...\n");

  let totalDeleted = 0;
  let errors = 0;

  for (const collName of ALL_COLLECTIONS) {
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
  console.log(`  Collections processed:   ${ALL_COLLECTIONS.length}`);
  console.log(`  Errors:                  ${errors}`);
  console.log("══════════════════════════════════════════════════\n");

  if (errors === 0) {
    console.log("✓ ALL dummy/test data has been removed successfully.");
    console.log("  Every collection is now empty.");
  } else {
    console.log(`⚠ Completed with ${errors} error(s).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
