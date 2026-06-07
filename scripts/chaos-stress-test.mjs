/**
 * Chaos Monkey Stress Test — Role-Switch Audit Integrity
 *
 * Simulates:
 *   1. Triage flood (rapid patient ingestion)
 *   2. Kiosk outage injection
 *   3. Rapid role-switch audit entries
 *   4. Verifies audit log ordering and completeness
 *
 * Requires: Firebase project credentials via VITE_ env vars
 * Usage:     node scripts/chaos-stress-test.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, updateDoc, query, orderBy, limit, setDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load env from actual .env or .env.local ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadEnv() {
  let envPath = resolve(projectRoot, '.env.local');
  if (fileURLToPath) { /* nop */ }
  try {
    readFileSync(envPath, 'utf-8');
  } catch {
    envPath = resolve(projectRoot, '.env');
  }
  const dotenv = readFileSync(envPath, 'utf-8');
  const vars = {};
  for (const line of dotenv.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

async function main() {
  console.log('=== CHAOS MONKEY STRESS TEST ===');
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const env = loadEnv();
  const fbConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  if (!fbConfig.projectId || fbConfig.projectId === 'your-firebase-project-id') {
    console.log('⏭️ SKIP: No real Firebase credentials. Install firebase-tools and set up emulators or configure .env.local');
    console.log('   For local testing without Firebase, use: npm run dev and interact with the DebugChaosDrawer directly.');
    return;
  }

  const app = initializeApp(fbConfig, 'chaos-stress');
  const db = getFirestore(app);

  // ── Phase 1: Check current state ──
  console.log('[1/5] Checking current database state...');
  const [patientsSnap, kiosksSnap, auditSnap] = await Promise.all([
    getDocs(collection(db, 'patients')),
    getDocs(collection(db, 'kiosks')),
    getDocs(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(10))),
  ]);

  const initialPatientCount = patientsSnap.size;
  const initialKioskCount = kiosksSnap.size;
  const initialAuditCount = auditSnap.size;

  console.log(`   Patients: ${initialPatientCount}`);
  console.log(`   Kiosks:   ${initialKioskCount}`);
  console.log(`   Recent audit entries: ${initialAuditCount}`);

  if (initialPatientCount === 0) {
    console.log('\n⚠️  No patients in database. Triage flood will create new records.');
  }

  // ── Phase 2: Trigger kiosk outage ──
  console.log('\n[2/5] 💥 Kiosk outage injection...');
  if (initialKioskCount > 0) {
    const targets = kiosksSnap.docs;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const originalStatus = target.data().status;
    console.log(`   Target: ${target.id} (${target.data().name || 'unnamed'})`);
    console.log(`   Status: ${originalStatus} → offline`);

    await updateDoc(doc(db, 'kiosks', target.id), { status: 'offline', updatedAt: new Date().toISOString() });

    // Write audit entry for the outage
    await addDoc(collection(db, 'auditLogs'), {
      timestamp: new Date().toISOString(),
      actor: 'chaos-monkey',
      role: 'admin',
      action: 'KIOSK_STATUS_CHANGED',
      targetResource: target.id,
      severity: 'critical',
      txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
      createdAt: new Date().toISOString(),
    });

    console.log('   ✅ Kiosk offline audit entry written');

    // Auto-recover after delay (simulate)
    setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'kiosks', target.id), { status: originalStatus, updatedAt: new Date().toISOString() });
        console.log(`   🔄 Auto-recovered ${target.id} → ${originalStatus}`);
      } catch (e) {
        console.log(`   ❌ Recovery failed: ${e.message}`);
      }
    }, 8000);
  } else {
    console.log('   ⏭️  No kiosks to disrupt');
  }

  // ── Phase 3: Triage flood (5 injections at 1.5s intervals) ──
  console.log('\n[3/5] 🌊 Triage flood (5 rapid patient ingestions)...');
  const statuses = ['Registered', 'In Triage', 'Needs Review'];
  const categories = ['Self-care', 'Doctor', 'Urgent', 'Emergency'];
  const patientIds = [];

  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const patientRef = await addDoc(collection(db, 'patients'), {
        patientName: `Chaos-Sim-${Date.now().toString(36)}-${i}`,
        triageCategory: categories[Math.floor(Math.random() * categories.length)],
        confidence: 0.75 + Math.random() * 0.2,
        timestamp: new Date().toISOString(),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        traceEvents: [],
      });
      patientIds.push(patientRef.id);
      console.log(`   📦 Patient ${i + 1}/5 created: ${patientRef.id.substring(0, 10)}...`);
    } catch (err) {
      console.log(`   ❌ Injection ${i + 1} failed: ${err.message}`);
    }
  }
  console.log(`   ✅ ${patientIds.length} patients ingested`);

  // ── Phase 4: Rapid role-switch audit entries (simulating frantic admin) ──
  console.log('\n[4/5] ⚡ Rapid role-switch overs (10 switches, no delay)...');
  const roleChain = ['admin', 'clinician', 'device_provider', 'kiosk_operator', 'public_health', 'admin'];
  const switchIds = [];

  for (let i = 0; i < 10; i++) {
    const fromRole = roleChain[i % roleChain.length];
    const toRole = roleChain[(i + 1) % roleChain.length];
    try {
      const ref = await addDoc(collection(db, 'auditLogs'), {
        timestamp: new Date().toISOString(),
        actor: 'chaos-monkey',
        role: fromRole,
        action: 'ROLE_SWITCH',
        targetResource: `security-token:${fromRole}→${toRole}`,
        severity: 'info',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: new Date().toISOString(),
      });
      switchIds.push(ref.id);
      console.log(`   🔀 Switch ${i + 1}/10: ${fromRole} → ${toRole} [${ref.id.substring(0, 8)}]`);
    } catch (err) {
      console.log(`   ❌ Switch ${i + 1} failed: ${err.message}`);
    }
  }
  console.log(`   ✅ ${switchIds.length} role-switch entries committed`);

  // ── Phase 5: Audit log integrity check ──
  console.log('\n[5/5] 🔍 Audit log integrity verification...');
  await new Promise(r => setTimeout(r, 1000));

  try {
    const recentAuditQuery = query(
      collection(db, 'auditLogs'),
      orderBy('timestamp', 'desc'),
      limit(30)
    );
    const recentSnap = await getDocs(recentAuditQuery);
    const entries = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const rokeSwitchEntries = entries.filter(e => e.action === 'ROLE_SWITCH');
    const kioskEntries = entries.filter(e => e.action === 'KIOSK_STATUS_CHANGED');
    const patientEntries = entries.filter(e => e.action === undefined || e.entityType === 'PATIENT' || e.action === 'CREATE');

    console.log(`   Total recent entries: ${entries.length}`);
    console.log(`   ROLE_SWITCH entries:  ${rokeSwitchEntries.length}`);
    console.log(`   Kiosk events:         ${kioskEntries.length}`);

    // Validate role-switch chain integrity
    let chainIntact = true;
    for (let i = 0; i < rokeSwitchEntries.length - 1; i++) {
      const current = rokeSwitchEntries[i];
      const next = rokeSwitchEntries[i + 1];
      const currentTs = new Date(current.timestamp).getTime();
      const nextTs = new Date(next.timestamp).getTime();
      if (currentTs < nextTs) {
        chainIntact = false;
        console.log(`   ⚠️  TIMESTAMP ANOMALY: Entry ${current.id} (${current.timestamp}) before ${next.id} (${next.timestamp})`);
      }
    }

    // Check txHash presence
    const missingHashes = entries.filter(e => !e.txHash).length;
    console.log(`   Entries missing txHash: ${missingHashes}`);

    if (rokeSwitchEntries.length >= 10 && missingHashes === 0 && chainIntact) {
      console.log('\n✅ AUDIT INTEGRITY: PASS');
    } else {
      console.log('\n⚠️  AUDIT INTEGRITY: DEGRADED');
      console.log(`   ROLE_SWITCH count (expected ≥10): ${rokeSwitchEntries.length}`);
      console.log(`   Missing txHashes: ${missingHashes}`);
    }

    // Print the role-switch timeline
    console.log('\n📋 Role-switch timeline (most recent first):');
    rokeSwitchEntries.slice(0, 10).forEach(e => {
      console.log(`   ${e.timestamp} | ${e.role} → ${e.targetResource.split('→')[1] || '?'} | hash:${e.txHash?.substring(0, 10)}`);
    });

  } catch (err) {
    console.log(`   ❌ Integrity check failed: ${err.message}`);
  }

  console.log('\n=== CHAOS MONKEY STRESS TEST COMPLETE ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});