import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables based on NODE_ENV or default to development
const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env.development';
const envPath = path.join(__dirname, envFile);

console.log(`⚡ Loading environment: ${envFile}`);
dotenv.config({ path: envPath });

// Build Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.projectId) {
  console.error('❌ Firebase configuration incomplete. Check your .env file.');
  process.exit(1);
}

// Initialize connection
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedPipeline() {
  console.log(`\n⚡ Initializing database synchronization vector...`);
  console.log(`📍 Target: ${firebaseConfig.projectId} (${process.env.VITE_ENVIRONMENT || 'development'})\n`);

  try {
    // 3. Inject Core Organization
    const orgRef = doc(db, 'organizations', 'org_apex_health');
    await setDoc(orgRef, {
      name: "Apex Health Systems",
      status: "active",
      createdAt: new Date().toISOString()
    });
    console.log("✅ Core Organization [Apex Health Systems] committed.");

    // 4. Inject Regional Child Nodes
    const reg1Ref = doc(db, 'regions', 'reg_northeast_01');
    await setDoc(reg1Ref, {
      name: "Northeast Regional Hub",
      orgId: "org_apex_health",
      status: "operational"
    });

    const reg2Ref = doc(db, 'regions', 'reg_southwest_02');
    await setDoc(reg2Ref, {
      name: "Southwest Regional Hub",
      orgId: "org_apex_health",
      status: "operational"
    });
    console.log("✅ Regional Topology Nodes committed successfully.");

    // 5. Inject Edge Kiosk Terminals
    const kiosk1Ref = doc(db, 'kiosks', 'kiosk_er_alpha');
    await setDoc(kiosk1Ref, {
      hardwareId: "HW-AMD-IX01",
      name: "Main ER Intake A",
      facilityId: "fac_northeast_01",
      facilityName: "Apex Health Main",
      regionName: "Northeast Regional Hub",
      status: "online",
      ipAddress: "10.142.12.4",
      softwareVersion: "v2.4.1-build82",
      currentQueue: 2,
      thermalStatus: "cool",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const kiosk2Ref = doc(db, 'kiosks', 'kiosk_peds_west');
    await setDoc(kiosk2Ref, {
      hardwareId: "HW-AMD-IX03",
      name: "Pediatric Triage West",
      facilityId: "fac_northeast_01",
      facilityName: "St. Jude Urgent Care",
      regionName: "Northeast Regional Hub",
      status: "online",
      ipAddress: "10.144.98.21",
      softwareVersion: "v2.4.1-build82",
      currentQueue: 0,
      thermalStatus: "cool",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const kiosk3Ref = doc(db, 'kiosks', 'kiosk_pavilion_north');
    await setDoc(kiosk3Ref, {
      hardwareId: "HW-AMD-IX04",
      name: "North Pavilion Check-In",
      facilityId: "fac_northeast_01",
      facilityName: "Apex Health Main",
      regionName: "Northeast Regional Hub",
      status: "degraded",
      ipAddress: "10.142.44.102",
      softwareVersion: "v2.4.0-legacy",
      currentQueue: 4,
      thermalStatus: "nominal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const kiosk4Ref = doc(db, 'kiosks', 'kiosk_trauma_rapid');
    await setDoc(kiosk4Ref, {
      hardwareId: "HW-AMD-IX06",
      name: "Trauma Wing Rapid Kiosk",
      facilityId: "fac_northeast_01",
      facilityName: "Apex Health Main",
      regionName: "Northeast Regional Hub",
      status: "online",
      ipAddress: "10.142.12.19",
      softwareVersion: "v2.4.1-build82",
      currentQueue: 3,
      thermalStatus: "nominal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log("✅ Edge Kiosk Fleet [4 terminals] committed to hardware registry.");

    // 6. Inject Neural Weight Models
    const modelActive = doc(db, 'modelWeights', 'llm-triage-v4.2-pro');
    await setDoc(modelActive, {
      tag: "Clinical Core Triage",
      type: "triage",
      contextWindow: "32K tokens",
      avgInferenceTime: 42,
      accuracyRate: 96.4,
      status: "active",
      tokenCostPerM: 1.50,
      createdAt: new Date().toISOString()
    });

    const modelShadow = doc(db, 'modelWeights', 'llm-triage-v4.3-rc1');
    await setDoc(modelShadow, {
      tag: "Shadow Pipeline Target",
      type: "triage",
      contextWindow: "64K tokens",
      avgInferenceTime: 58,
      accuracyRate: 97.1,
      status: "shadow",
      tokenCostPerM: 1.75,
      createdAt: new Date().toISOString()
    });

    const modelClassifier = doc(db, 'modelWeights', 'classifier-v2.1-fast');
    await setDoc(modelClassifier, {
      tag: "Symptom Vectorization",
      type: "classifier",
      contextWindow: "8K tokens",
      avgInferenceTime: 12,
      accuracyRate: 94.2,
      status: "active",
      tokenCostPerM: 0.30,
      createdAt: new Date().toISOString()
    });

    const modelFallback = doc(db, 'modelWeights', 'fallback-deterministic-v1');
    await setDoc(modelFallback, {
      tag: "Local Edge Safetynet",
      type: "fallback",
      contextWindow: "4K tokens",
      avgInferenceTime: 8,
      accuracyRate: 88.5,
      status: "active",
      tokenCostPerM: 0.00,
      createdAt: new Date().toISOString()
    });

    const modelLegacy = doc(db, 'modelWeights', 'llm-triage-v4.1-legacy');
    await setDoc(modelLegacy, {
      tag: "Archived Baseline Node",
      type: "triage",
      contextWindow: "16K tokens",
      avgInferenceTime: 45,
      accuracyRate: 93.8,
      status: "deprecated",
      tokenCostPerM: 1.50,
      createdAt: new Date().toISOString()
    });

    console.log("✅ Neural Weight Matrix [5 models] committed to inference registry.");

    // 7. Inject Initial Audit Log Entries
    const auditInitRef = doc(db, 'auditLogs', 'EVT-SEED-0001');
    await setDoc(auditInitRef, {
      timestamp: new Date().toISOString(),
      actor: "seed-pipeline@system",
      role: "Automated Bootstrap",
      action: "INITIALIZED_KIOSK_FLEET",
      targetResource: "admin-portal-2993d",
      severity: "info",
      txHash: "0xb1a2c3d4",
      createdAt: new Date().toISOString()
    });

    const auditModelRef = doc(db, 'auditLogs', 'EVT-SEED-0002');
    await setDoc(auditModelRef, {
      timestamp: new Date().toISOString(),
      actor: "seed-pipeline@system",
      role: "Automated Bootstrap",
      action: "INITIALIZED_MODEL_WEIGHTS",
      targetResource: "admin-portal-2993d",
      severity: "info",
      txHash: "0xb1a2c3d5",
      createdAt: new Date().toISOString()
    });

    const auditOrgRef = doc(db, 'auditLogs', 'EVT-SEED-0003');
    await setDoc(auditOrgRef, {
      timestamp: new Date().toISOString(),
      actor: "seed-pipeline@system",
      role: "Automated Bootstrap",
      action: "INITIALIZED_ORGANIZATIONAL_TOPOLOGY",
      targetResource: "admin-portal-2993d",
      severity: "info",
      txHash: "0xb1a2c3d6",
      createdAt: new Date().toISOString()
    });

    console.log("✅ Immutable Audit Ledger [3 bootstrap entries] committed.");

    // ===== 8. Patient Triage Records =====
    const now = new Date();
    const ts = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();

    const patientDefinitions = [
      {
        id: "CASE-1001",
        patientName: "Michael Chen",
        triageCategory: "Emergency",
        confidence: 0.98,
        status: "Escalated",
        traceEvents: [
          { id: "evt-c1001-1", entityType: "PATIENT", entityId: "CASE-1001", action: "CASE_CREATED", performedBy: "kiosk_er_alpha", role: "OPERATOR", timestamp: ts(2), toState: "Registered", reason: "Patient checked in via ER kiosk — acute chest pain reported" },
          { id: "evt-c1001-2", entityType: "PATIENT", entityId: "CASE-1001", action: "TRIAGE_STARTED", performedBy: "dr_wilson@apexhealth.com", role: "DOCTOR", timestamp: ts(1.8), fromState: "Registered", toState: "In Triage", reason: "AI flagged high-risk cardiac symptoms" },
          { id: "evt-c1001-3", entityType: "PATIENT", entityId: "CASE-1001", action: "ESCALATED", performedBy: "dr_wilson@apexhealth.com", role: "DOCTOR", timestamp: ts(1.5), fromState: "In Triage", toState: "Escalated", reason: "ECG abnormal — immediate cardiology consult required" }
        ]
      },
      {
        id: "CASE-1002",
        patientName: "Sarah Davis",
        triageCategory: "Urgent",
        confidence: 0.85,
        status: "Needs Review",
        traceEvents: [
          { id: "evt-c1002-1", entityType: "PATIENT", entityId: "CASE-1002", action: "CASE_CREATED", performedBy: "kiosk_peds_west", role: "OPERATOR", timestamp: ts(3), toState: "Registered", reason: "Pediatric intake — high fever for 48 hours" },
          { id: "evt-c1002-2", entityType: "PATIENT", entityId: "CASE-1002", action: "TRIAGE_STARTED", performedBy: "dr_patel@apexhealth.com", role: "DOCTOR", timestamp: ts(2.5), fromState: "Registered", toState: "In Triage", reason: "Urgent care protocol activated" },
          { id: "evt-c1002-3", entityType: "PATIENT", entityId: "CASE-1002", action: "NEEDS_REVIEW", performedBy: "system-ai-triage", role: "ANALYST", timestamp: ts(2), fromState: "In Triage", toState: "Needs Review", reason: "Elevated WBC with dehydration markers — requires physician review" }
        ]
      },
      {
        id: "CASE-1003",
        patientName: "James Wilson",
        triageCategory: "Self-care",
        confidence: 0.92,
        status: "Registered",
        traceEvents: [
          { id: "evt-c1003-1", entityType: "PATIENT", entityId: "CASE-1003", action: "CASE_CREATED", performedBy: "kiosk_trauma_rapid", role: "OPERATOR", timestamp: ts(1), toState: "Registered", reason: "Minor laceration — self-care guidance provided" }
        ]
      },
      {
        id: "CASE-1004",
        patientName: "Maria Garcia",
        triageCategory: "Doctor",
        confidence: 0.76,
        status: "In Triage",
        traceEvents: [
          { id: "evt-c1004-1", entityType: "PATIENT", entityId: "CASE-1004", action: "CASE_CREATED", performedBy: "kiosk_er_alpha", role: "OPERATOR", timestamp: ts(0.8), toState: "Registered", reason: "Persistent cough with mild fever — routine consult" },
          { id: "evt-c1004-2", entityType: "PATIENT", entityId: "CASE-1004", action: "TRIAGE_STARTED", performedBy: "dr_wilson@apexhealth.com", role: "DOCTOR", timestamp: ts(0.5), fromState: "Registered", toState: "In Triage", reason: "Doctor consultation initiated" }
        ]
      },
      {
        id: "CASE-1005",
        patientName: "Robert Kim",
        triageCategory: "Emergency",
        confidence: 0.94,
        status: "Needs Review",
        traceEvents: [
          { id: "evt-c1005-1", entityType: "PATIENT", entityId: "CASE-1005", action: "CASE_CREATED", performedBy: "kiosk_trauma_rapid", role: "OPERATOR", timestamp: ts(0.3), toState: "Registered", reason: "Motor vehicle accident — trauma protocol" },
          { id: "evt-c1005-2", entityType: "PATIENT", entityId: "CASE-1005", action: "TRIAGE_STARTED", performedBy: "dr_kelly@apexhealth.com", role: "DOCTOR", timestamp: ts(0.25), fromState: "Registered", toState: "In Triage", reason: "Emergency triage overridden by attending" },
          { id: "evt-c1005-3", entityType: "PATIENT", entityId: "CASE-1005", action: "NEEDS_REVIEW", performedBy: "dr_kelly@apexhealth.com", role: "DOCTOR", timestamp: ts(0.1), fromState: "In Triage", toState: "Needs Review", reason: "CT scan ordered — pending radiologist review" }
        ]
      },
      {
        id: "CASE-1006",
        patientName: "Lisa Thompson",
        triageCategory: "Urgent",
        confidence: 0.81,
        status: "Escalated",
        traceEvents: [
          { id: "evt-c1006-1", entityType: "PATIENT", entityId: "CASE-1006", action: "CASE_CREATED", performedBy: "kiosk_pavilion_north", role: "OPERATOR", timestamp: ts(4), toState: "Registered", reason: "Severe abdominal pain" },
          { id: "evt-c1006-2", entityType: "PATIENT", entityId: "CASE-1006", action: "TRIAGE_STARTED", performedBy: "dr_patel@apexhealth.com", role: "DOCTOR", timestamp: ts(3.5), fromState: "Registered", toState: "In Triage", reason: "Urgent care protocol" },
          { id: "evt-c1006-3", entityType: "PATIENT", entityId: "CASE-1006", action: "ESCALATED", performedBy: "dr_patel@apexhealth.com", role: "DOCTOR", timestamp: ts(3), fromState: "In Triage", toState: "Escalated", reason: "Possible appendicitis — surgical consult requested" }
        ]
      },
      {
        id: "CASE-1007",
        patientName: "David Martinez",
        triageCategory: "Self-care",
        confidence: 0.88,
        status: "Resolved",
        traceEvents: [
          { id: "evt-c1007-1", entityType: "PATIENT", entityId: "CASE-1007", action: "CASE_CREATED", performedBy: "kiosk_er_alpha", role: "OPERATOR", timestamp: ts(6), toState: "Registered", reason: "Mild allergic reaction — antihistamines advised" },
          { id: "evt-c1007-2", entityType: "PATIENT", entityId: "CASE-1007", action: "RESOLVED", performedBy: "system-auto-resolve", role: "ANALYST", timestamp: ts(5.5), fromState: "Registered", toState: "Resolved", reason: "Self-care protocol completed — no escalation needed" }
        ]
      },
      {
        id: "CASE-1008",
        patientName: "Emily Johnson",
        triageCategory: "Doctor",
        confidence: 0.72,
        status: "Resolved",
        traceEvents: [
          { id: "evt-c1008-1", entityType: "PATIENT", entityId: "CASE-1008", action: "CASE_CREATED", performedBy: "kiosk_peds_west", role: "OPERATOR", timestamp: ts(12), toState: "Registered", reason: "Routine check-up with blood work" },
          { id: "evt-c1008-2", entityType: "PATIENT", entityId: "CASE-1008", action: "TRIAGE_STARTED", performedBy: "dr_green@apexhealth.com", role: "DOCTOR", timestamp: ts(10), fromState: "Registered", toState: "In Triage", reason: "Doctor consultation" },
          { id: "evt-c1008-3", entityType: "PATIENT", entityId: "CASE-1008", action: "RESOLVED", performedBy: "dr_green@apexhealth.com", role: "DOCTOR", timestamp: ts(8), fromState: "In Triage", toState: "Resolved", reason: "Consultation complete — vitamin D deficiency diagnosed, treatment plan provided" }
        ]
      }
    ];

    for (const patient of patientDefinitions) {
      const patientRef = doc(db, 'patients', patient.id);
      const { id, ...patientData } = patient;
      await setDoc(patientRef, {
        ...patientData,
        timestamp: patient.traceEvents[0].timestamp
      });
    }
    console.log(`✅ Patient Triage Records [${patientDefinitions.length} cases] committed to registry.`);

    // ===== 9. Notification Center Entries =====
    const notificationDefinitions = [
      {
        id: "NOTIF-001",
        category: "clinical",
        severity: "critical",
        title: "Critical Triage Alert: ER Wait Time Breach",
        message: "Emergency department wait time has exceeded 45 minutes for Category 1 patients. Consider activating surge protocol.",
        source: "system-ai-monitor",
        acknowledged: false,
        createdAt: ts(0.5)
      },
      {
        id: "NOTIF-002",
        category: "device",
        severity: "warning",
        title: "Kiosk Degraded Connection — North Pavilion",
        message: "Kiosk HW-AMD-IX04 (North Pavilion) is reporting intermittent connectivity loss. Queue buildup of 4 patients detected.",
        source: "system-hardware-monitor",
        acknowledged: false,
        createdAt: ts(1)
      },
      {
        id: "NOTIF-003",
        category: "ai",
        severity: "info",
        title: "Shadow Model Accuracy Threshold Met",
        message: "Triage model v4.3-rc1 (shadow) has maintained 97.1% accuracy over 24h window. Eligible for promotion to active pipeline.",
        source: "system-ai-evaluator",
        acknowledged: false,
        createdAt: ts(2)
      },
      {
        id: "NOTIF-004",
        category: "security",
        severity: "critical",
        title: "Unauthorized Access Attempt Blocked",
        message: "Multiple failed authentication attempts detected from IP 203.0.113.42 targeting the audit log endpoint. Rate limiter engaged.",
        source: "system-security-gateway",
        acknowledged: true,
        acknowledgedBy: "admin@apexhealth.com",
        createdAt: ts(4)
      },
      {
        id: "NOTIF-005",
        category: "clinical",
        severity: "warning",
        title: "Patient Michael Chen Escalated to Emergency",
        message: "Patient CASE-1001 (Michael Chen) has been escalated with acute cardiac presentation. Cardiology paged stat.",
        source: "dr_wilson@apexhealth.com",
        acknowledged: true,
        acknowledgedBy: "admin@apexhealth.com",
        createdAt: ts(1.5)
      },
      {
        id: "NOTIF-006",
        category: "device",
        severity: "info",
        title: "Firmware Update Available for Edge Kiosks",
        message: "Software version v2.4.2-build91 is available for 3 of 4 deployed kiosks. Update addresses thermal management improvements.",
        source: "system-update-manager",
        acknowledged: false,
        createdAt: ts(5)
      },
      {
        id: "NOTIF-007",
        category: "ai",
        severity: "info",
        title: "Classifier Model Training Complete",
        message: "Symptom vectorization classifier v2.2 has completed training with 95.1% validation accuracy. Awaiting deployment approval.",
        source: "system-ml-pipeline",
        acknowledged: true,
        acknowledgedBy: "admin@apexhealth.com",
        createdAt: ts(6)
      },
      {
        id: "NOTIF-008",
        category: "security",
        severity: "warning",
        title: "Suspicious Login Pattern — Multiple Accounts",
        message: "3 user accounts have reported unrecognized login attempts from geographic region outside normal operating zone.",
        source: "system-security-gateway",
        acknowledged: false,
        createdAt: ts(3)
      }
    ];

    for (const notification of notificationDefinitions) {
      const notificationRef = doc(db, 'notifications', notification.id);
      await setDoc(notificationRef, notification);
    }
    console.log(`✅ Notification Center [${notificationDefinitions.length} entries] committed.`);

    console.log("\n🚀 Complete pipeline seeding finalized. All collections ready for dynamic UI testing.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failure:", error);
    process.exit(1);
  }
}

seedPipeline();
