# Admin Portal — Integration Endpoints by Team

> **Step 2 of the Integration Plan: Role-based integration endpoints for external teams.**
> Each team gets its own section with the exact endpoints, auth, data formats, and call sequences they need.
>
> **Prerequisites:** Step 1 — `docs/API_CONTRACT.md` (comprehensive reference)
> **Next:** Step 3 — Implementation & test harnesses
>
> **📢 API Consolidation Notice:** LLM triage, OCR, visual analysis, and X-ray have been consolidated into a **single Unified Triage API** at `https://medical-triage-production.up.railway.app/api/v1`.
> See **[docs/UNIFIED_API_MIGRATION_GUIDE.md](UNIFIED_API_MIGRATION_GUIDE.md)** for the complete migration guide with code examples for Mobile and Kiosk teams.

---

## Table of Contents by Team

1. [Kiosk Hardware Team](#1-kiosk-hardware-team)
2. [EMR / Lab Systems Team](#2-emr--lab-systems-team)
3. [AI / ML Engineering Team](#3-ai--ml-engineering-team)
4. [Legacy File Integration Team](#4-legacy-file-integration-team)
5. [Mobile App / Partner Portal Team](#5-mobile-app--partner-portal-team)
6. [Admin Portal SPA Team (Internal)](#6-admin-portal-spa-team-internal)

---

## 1. Kiosk Hardware Team

**Goal:** Register hardware terminals, submit patient triage records, publish heartbeat status.

### 1.1 Integration Model

Kiosks have **two integration paths**:

| Path | Purpose | Documentation |
|------|---------|---------------|
| **Firestore Direct Access** | Hardware registration, heartbeat, patient records | See below (this section) |
| **Unified Triage API** | AI triage analysis, symptom logging, report uploads, visual scans | See **[docs/UNIFIED_API_MIGRATION_GUIDE.md §3](UNIFIED_API_MIGRATION_GUIDE.md#3-kiosk-complete-triage-workflow)** |

The triage workflow (previously directed at a separate LLM/OCR/Visual pipeline) now goes through the unified API:

```
Kiosk Terminal
     │
     ├── Provision:       Firestore  kiosks/{id}          (one-time, on install)
     ├── Heartbeat:       Firestore  kiosks/{id}.status    (every 60s)
     │
     ├── ★ NEW ★ Triage:  Unified Triage API              (see migration guide)
     │     POST /api/v1/triage        → Initialize session
     │     POST /api/v1/patient       → Save demographics
     │     POST /api/v1/symptoms      → Log symptoms
     │     POST /api/v1/vitals        → Record vitals
     │     POST /api/v1/visual-scan   → Upload images
     │     POST /api/v1/reports       → Upload reports
     │     POST /api/v1/analyse       → Get final triage
     │
     ├── Submit (legacy):  Firestore  patients/{id}        (for basic patient records)
     └── Audit:            Firestore  patients/{id}/traceEvents/{id}
```

> **⚠️ Migration Note:** The old separate AI endpoints (`mlservice-production-4d52.up.railway.app/ocr/process`, `mlservice-production-4d52.up.railway.app/visual/analyze`, `mlservice-production-4d52.up.railway.app/xray/classify`) are **deprecated**. All AI processing must now go through the Unified Triage API path shown above.

### 1.2 Endpoints

#### A) Register Kiosk Terminal (One-Time Provisioning)

| Item | Value |
|---|---|
| **Target** | Firestore collection `kiosks` |
| **Action** | `setDoc` (create) |
| **Auth** | Firebase Auth + admin role (set via `firestore.rules`) |
| **SDK** | Firebase Admin SDK (Node.js) or Client SDK (kiosk-side) |

**Request document:**

```json
{
  "hardwareId": "HW-AMD-IX01",
  "name": "Main ER Intake A",
  "facilityId": "fac_northeast_01",
  "facilityName": "Apex Health Main",
  "regionName": "Northeast Regional Hub",
  "status": "online",
  "ipAddress": "10.142.12.4",
  "softwareVersion": "v2.4.1-build82",
  "currentQueue": 0,
  "thermalStatus": "cool",
  "createdAt": "<ISO-8601>",
  "updatedAt": "<ISO-8601>"
}
```

**Firebase SDK snippet (Node.js):**
```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

await db.collection('kiosks').doc('kiosk_er_alpha').set({
  hardwareId: 'HW-AMD-IX01',
  name: 'Main ER Intake A',
  facilityId: 'fac_northeast_01',
  facilityName: 'Apex Health Main',
  regionName: 'Northeast Regional Hub',
  status: 'online',
  ipAddress: '10.142.12.4',
  softwareVersion: 'v2.4.1-build82',
  currentQueue: 0,
  thermalStatus: 'cool',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

**Firestore Rules Gate:** Only `admin` role can create kiosk documents.

---

#### B) Publish Heartbeat / Status Update (Recurring)

| Item | Value |
|---|---|
| **Target** | Firestore `kiosks/{kioskId}` — partial update |
| **Action** | `updateDoc` — only `status`, `currentQueue`, `updatedAt` fields |
| **Auth** | Firebase Auth + any authenticated user (operator or admin) |
| **Frequency** | Every 60 seconds |

**Request (partial update in Firestore SDK):**
```javascript
await db.collection('kiosks').doc('kiosk_er_alpha').update({
  status: 'online',        // 'online' | 'degraded' | 'offline'
  currentQueue: 3,          // Number of patients waiting
  thermalStatus: 'nominal', // 'cool' | 'nominal' | 'hot'
  updatedAt: new Date().toISOString(),
});
```

**Firestore Rules Gate:** Any authenticated user can update `status`, `currentQueue`, `updatedAt`. Full updates require `admin`.

**Error handling:**
- `403 PERMISSION_DENIED` — Trying to update fields other than `status`, `currentQueue`, `updatedAt`
- `404 NOT_FOUND` — Kiosk not provisioned yet (must register first)

---

#### C) Submit Patient Triage Record

| Item | Value |
|---|---|
| **Target** | Firestore `patients/{autoId}` |
| **Action** | `runTransaction` — create patient + create trace event atomically |
| **Auth** | Firebase Auth + `clinician` role |
| **SDK** | Firebase Client SDK (kiosk browser/app) |

**Request document:**

```json
{
  "patientName": "Michael Chen",
  "triageCategory": "Emergency",
  "confidence": 0.98,
  "timestamp": "2026-06-08T08:00:00.000Z",
  "status": "Registered",
  "traceEvents": [
    {
      "entityType": "PATIENT",
      "entityId": "<auto-generated>",
      "action": "CREATE",
      "performedBy": "kiosk_er_alpha",
      "role": "OPERATOR",
      "timestamp": "2026-06-08T08:00:00.000Z",
      "toState": "Registered",
      "reason": "Patient checked in via ER kiosk"
    }
  ]
}
```

**Required fields:**
| Field | Type | Valid Values |
|---|---|---|
| `patientName` | string | Any (PHI — access controlled) |
| `triageCategory` | string | `Self-care`, `Doctor`, `Urgent`, `Emergency` |
| `confidence` | number | 0.0 – 1.0 |
| `timestamp` | string | ISO-8601 |
| `status` | string | `Registered`, `In Triage`, `Needs Review`, `Escalated`, `Resolved` |

**Valid status transitions:**
```
Registered → In Triage → Needs Review → Escalated → Resolved
                ↕            ↕
```

**Error handling:**
- `400` — Missing required fields or invalid `triageCategory` value
- `403` — Unauthenticated or unauthorized role
- Trace event ID must be unique (use `doc(collection(...)).id` pattern)

---

### 1.3 End-to-End Flow: Kiosk Triage (Unified API Path)

This is the **recommended** modern flow for kiosks using the consolidated Unified Triage API. See the [migration guide §3](UNIFIED_API_MIGRATION_GUIDE.md#3-kiosk-complete-triage-workflow) for code examples.

```
Kiosk Terminal                       Unified Triage API                   Admin Portal
     │                                      │                                   │
     │  1. POST /health                     │                                   │
     │     ────────────────────────────────▶│                                   │
     │     ← { status: "ok", model: ... }   │                                   │
     │                                      │                                   │
     │  2. POST /triage                     │                                   │
     │     { symptoms, vitals? }            │                                   │
     │     ────────────────────────────────▶│                                   │
     │     ← { session_id, urgency_level }  │                                   │
     │                                      │                                   │
     │  3. POST /patient                    │                                   │
     │     { session_id, name, age, ... }   │                                   │
     │     ────────────────────────────────▶│                                   │
     │                                      │                                   │
     │  4. POST /symptoms                   │                                   │
     │     { session_id, patient_id, ... }  │                                   │
     │     ────────────────────────────────▶│                                   │
     │                                      │                                   │
     │  5. POST /vitals                     │                                   │
     │     { session_id, patient_id, ... }  │                                   │
     │     ────────────────────────────────▶│                                   │
     │                                      │                                   │
     │  6. POST /visual-scan (optional)     │                                   │
     │     [multipart: image + session_id]  │                                   │
     │     ────────────────────────────────▶│                                   │
     │                                      │                                   │
     │  7. POST /reports (optional)         │                                   │
     │     [multipart: files + types]       │                                   │
     │     ────────────────────────────────▶│                                   │
     │                                      │                                   │
     │  8. POST /analyse?session_id=...     │                                   │
     │     ────────────────────────────────▶│                                   │
     │     ← { status, result }             │                                   │
     │                                      │                                   │
     │                                      │  (Portal subscribes to Firestore  │
     │                                      │   for real-time dashboard updates)│
```

### 1.4 Legacy End-to-End Flow: Firestore Direct Check-In

For basic patient record submission (without AI triage), kiosks can still write directly to Firestore:

```
Kiosk Terminal                          Firestore                         Express Server          Admin Portal
     │                                      │                                   │                       │
     │  1. update({ status: "online",       │                                   │                       │
     │     currentQueue: 0 }) ─────────────▶│                                   │                       │
     │                                      │  onSnapshot('kiosks')             │                       │
     │                                      │ ◀──────────────────────────────────────────────────────▶│
     │                                      │                                   │                       │
     │  2. Patient checks in                │                                   │                       │
     │                                      │                                   │                       │
     │  3. setDoc(patients/{id}, {           │                                   │                       │
     │       patientName, triageCategory,    │                                   │                       │
     │       confidence, status, ... }) ────▶│                                   │                       │
     │     setDoc(traceEvents/{id}, ...) ────▶                                   │                       │
     │                                      │  onSnapshot('patients')           │                       │
     │                                      │ ◀──────────────────────────────────────────────────────▶│
     │                                      │                                   │                       │
     │                                      │  4. Cloud Function auto-triggers  │                       │
     │                                      │     indexPatientOnWrite() ───────▶│                       │
     │                                      │                                   │  embed → Pinecone    │
     │                                      │                                   │                       │
     │                                      │                                   │  5. Portal: new      │
     │                                      │                                   │     patient in queue  │
     │                                      │                                   │     EventBus: CASE_CHANGED
```

> **Note:** When a kiosk creates a patient document in Firestore, the `indexPatientOnWrite` Cloud Function auto-triggers to generate embeddings and index them into Pinecone. This happens asynchronously — the portal reflects the new patient via `onSnapshot` immediately, while the vector index updates within seconds.

---

## 2. EMR / Lab Systems Team

**Goal:** Submit diagnostic reports, link reports to patients, trigger golden dataset export.

### 2.1 Integration Model

EMRs use **Firestore Direct Access** for real-time writes and **File Ingestion** for batch exports.

```
EMR System
     │
     ├── Submit Report:  Firestore  reports/{id}              (real-time, per-report)
     ├── Batch Upload:   ingestion/incoming/                   (flat file drop)
     └── Export Data:    Cloud Function  exportGoldenDataset   (callable)
```

### 2.2 Endpoints

#### A) Submit Diagnostic Report

| Item | Value |
|---|---|
| **Target** | Firestore `reports/{autoId}` |
| **Action** | `setDoc` (create) |
| **Auth** | Firebase Auth + `clinician` role |
| **SDK** | Firebase Admin or Client SDK |

**Request document:**

```json
{
  "patientId": "CASE-1001",
  "patientName": "Michael Chen",
  "category": "radiology",
  "subType": "x-ray",
  "status": "pending",
  "confidence": 0.92,
  "content": {
    "rawText": "Chest X-ray shows cardiomegaly with pulmonary congestion.",
    "aiAnalysis": "Findings consistent with acute heart failure. Recommend immediate cardiology consult."
  },
  "createdAt": "2026-06-08T10:30:00.000Z"
}
```

**Required fields:**

| Field | Type | Valid Values |
|---|---|---|
| `patientId` | string | Must reference an existing patient |
| `patientName` | string | Patient display name |
| `category` | string | `radiology`, `lab`, `ocr`, `stt`, `symptom` |
| `subType` | string | e.g., `x-ray`, `blood_panel`, `transcript` |
| `status` | string | `pending`, `verified`, `flagged` |
| `confidence` | number | 0.0 – 1.0 |
| `createdAt` | string | ISO-8601 |

**Firebase SDK snippet (Python example for EMR integration):**
```python
from google.cloud import firestore

db = firestore.Client()
report_ref = db.collection('reports').document()

report_ref.set({
    'patientId': 'CASE-1001',
    'patientName': 'Michael Chen',
    'category': 'lab',
    'subType': 'blood_panel',
    'status': 'pending',
    'confidence': 0.88,
    'content': {
        'rawText': 'WBC: elevated, CRP: 45 mg/L',
        'aiAnalysis': 'Indicators consistent with systemic inflammation'
    },
    'createdAt': firestore.SERVER_TIMESTAMP,
})
```

**Error handling:**
- `400` — Missing required fields or invalid `category`
- `403` — Insufficient role permissions
- Reports with duplicate `patientId + createdAt` combos are allowed (multiple reports per patient)

---

#### B) Batch Upload via File Ingestion

See **[§4 Legacy File Integration Team](#4-legacy-file-integration-team)** for full details.

Quick summary for EMR teams:
```
Drop file → ingestion/incoming/ → parse → validate → index → archive/
                                        → error/ + .error.log
```

Supported formats: JSON (single, array, or `{ patients, reports }` structure) and CSV.

---

#### C) Export Golden Dataset (ML Training Data)

| Item | Value |
|---|---|
| **Target** | Firebase Callable Function `exportGoldenDataset` |
| **Trigger** | HTTPS (callable) — authenticated |
| **Required Role** | `admin` or `clinician` |
| **PHI Handling** | All PHI stripped before export (see `src/lib/pii.ts`) |
| **Output** | JSONL download stream (verified reports only) |

**Request parameters (TypeScript):**
```typescript
interface ExportParams {
  filterOverridesOnly?: boolean;  // Only export reports with clinician overrides
  maxRecords?: number;            // Limit export size (default: all)
}
```

**Call from Firebase SDK:**
```javascript
const functions = firebase.functions();
const exportFn = functions.httpsCallable('exportGoldenDataset');
const result = await exportFn({ filterOverridesOnly: false, maxRecords: 100 });
// result.data → JSONL text blob
```

---

### 2.3 End-to-End Flow: Report Submission

```
EMR System                           Firestore                     Admin Portal
     │                                    │                              │
     │  1. setDoc(reports/{id}, {         │                              │
     │       patientId, category,          │                              │
     │       status: "pending", ... }) ───▶│                              │
     │                                    │  onSnapshot('reports')       │
     │                                    │ ◀────────────────────────────▶│
     │                                    │                              │
     │                                    │  2. Report appears in        │
     │                                    │     ReportManagementView     │
     │                                    │     Status: "pending"        │
     │                                    │                              │
     │  ─ ─ ─ (clinician verifies) ─ ─    │                              │
     │                                    │                              │
     │  3. updateDoc(reports/{id}, {      │                              │
     │       status: "verified",           │                              │
     │       clinicianAgreement: true })   │                              │
     │       ←─────────────────────────    │                              │
     │                                    │  4. Golden dataset export    │
     │                                    │     available via Function   │
```

---

## 3. AI / ML Engineering Team

**Goal:** Perform semantic vector search, manage the Pinecone index, evaluate model performance.

### 3.1 Integration Model

AI/ML teams use the **Express REST API** (port 5001) for all vector operations. All routes require `ADMIN_API_KEY` Bearer token.

```
AI Service
     │
     ├── Search:        POST /api/vector/search         (semantic search)
     ├── Similar Cases:  POST /api/vector/similar        (clinical decision support)
     ├── Index Batch:    POST /api/vector/index-all      (bulk re-index)
     ├── Index Single:   POST /api/vector/index          (single upsert)
     ├── Delete:         DELETE /api/vector              (remove vectors)
     ├── Stats:          GET  /api/vector/stats          (vector count)
     ├── Health:         GET  /health                    (liveness)
     └── Ready:          GET  /ready                     (readiness)
```

### 3.2 Base Configuration

| Property | Value |
|---|---|
| **Base URL (Dev)** | `http://localhost:5001` |
| **Base URL (Prod)** | `https://api.apexhealth.internal` |
| **Auth** | `Authorization: Bearer <ADMIN_API_KEY>` |
| **Embedding Model** | `text-embedding-3-small` (1536 dimensions) |
| **Vector Index** | Pinecone — `triage-cases` index, cosine metric |
| **Timeout** | 30s for search, 60s for batch index |

### 3.3 Endpoints (Express REST API)

#### A) Semantic Search — `POST /api/vector/search`

**Purpose:** Find triage cases matching a natural language query.

**curl:**
```bash
curl -X POST http://localhost:5001/api/vector/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{
    "query": "chest pain with shortness of breath",
    "topK": 10,
    "filter": {
      "triageCategory": { "$eq": "Emergency" }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "query": "chest pain with shortness of breath",
  "matches": [
    {
      "id": "CASE-1001",
      "score": 0.89,
      "metadata": {
        "patientName": "Michael Chen",
        "triageCategory": "Emergency",
        "status": "Escalated",
        "confidence": 0.98,
        "timestamp": "2026-06-08T10:00:00.000Z",
        "sourceType": "patient"
      }
    }
  ]
}
```

**Error cases:**
- `400` — `query` is empty or missing
- `401` — No auth header
- `403` — Invalid API key
- `500` — OpenAI or Pinecone API failure (check quota)

**Python SDK snippet:**
```python
import requests

response = requests.post(
    "http://localhost:5001/api/vector/search",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer <ADMIN_API_KEY>",
    },
    json={
        "query": "chest pain with shortness of breath",
        "topK": 10,
        "filter": {"triageCategory": {"$eq": "Emergency"}},
    },
    timeout=30,
)
result = response.json()
for match in result["matches"]:
    print(f"{match['id']} — {match['score']:.2f} — {match['metadata']['patientName']}")
```

---

#### B) Similar Cases — `POST /api/vector/similar`

**Purpose:** Find cases textually similar to a given case (clinical decision support).

**curl:**
```bash
curl -X POST http://localhost:5001/api/vector/similar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{
    "caseText": "Patient: Michael Chen\nTriage Category: Emergency\nStatus: Escalated\nReason: ECG abnormal",
    "topK": 5
  }'
```

**Response:** Same structure as search, `matches` array with scores.

---

#### C) Batch Index — `POST /api/vector/index-all`

**Purpose:** Bulk-index or re-index all triage cases. Two modes:

**Mode A — Send data in request body:**
```bash
curl -X POST http://localhost:5001/api/vector/index-all \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{
    "patients": [
      {
        "id": "CASE-1001",
        "text": "Patient: Michael Chen\nTriage Category: Emergency\nStatus: Escalated",
        "metadata": {
          "patientName": "Michael Chen",
          "triageCategory": "Emergency",
          "status": "Escalated",
          "confidence": 0.98,
          "timestamp": "2026-06-08T10:00:00.000Z",
          "sourceType": "patient"
        }
      }
    ],
    "reports": []
  }'
```

**Mode B — Fetch from Firestore:** Send empty object `{}`. Requires `FIREBASE_PROJECT_ID` and service account credentials.

**Response:**
```json
{
  "success": true,
  "indexedCount": 14,
  "totalInIndex": 42,
  "patientsIndexed": 6,
  "reportsIndexed": 8
}
```

---

#### D) Single Index — `POST /api/vector/index`

**Purpose:** Index or update one vector.

**curl:**
```bash
curl -X POST http://localhost:5001/api/vector/index \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{
    "id": "CASE-1001",
    "text": "Patient: Michael Chen\nTriage Category: Emergency",
    "metadata": {
      "patientName": "Michael Chen",
      "triageCategory": "Emergency",
      "status": "Escalated",
      "confidence": 0.98,
      "timestamp": "2026-06-08T10:00:00.000Z",
      "sourceType": "patient"
    }
  }'
```

**Response:** `{ "success": true }`

---

#### E) Delete Vectors — `DELETE /api/vector`

**Purpose:** Remove vectors from the index by ID.

**curl:**
```bash
curl -X DELETE http://localhost:5001/api/vector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{
    "ids": ["CASE-1001", "report_CASE-2001"]
  }'
```

**Response:**
```json
{
  "success": true,
  "deletedCount": 2
}
```

---

#### F) Vector Stats — `GET /api/vector/stats`

**curl:**
```bash
curl http://localhost:5001/api/vector/stats \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "totalVectors": 42
}
```

---

#### G) Health & Readiness Probes

```bash
# Liveness — always returns 200
curl http://localhost:5001/health
# → { "status": "ok", "timestamp": "..." }

# Readiness — returns 200 if OpenAI and Pinecone keys configured
curl http://localhost:5001/ready
# → { "status": "healthy|degraded", "checks": { "openaiKeySet": true, ... } }
```

### 3.4 Error Handling Quick Reference

| Status | Error Code | Meaning | Retry? |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | Missing or invalid request fields | No |
| 401 | `UNAUTHORIZED` | No Authorization header | No |
| 403 | `FORBIDDEN` | Invalid API key | No |
| 500 | `INTERNAL_SERVER_ERROR` | OpenAI/Pinecone failure | Yes (3x, exp backoff) |
| 503 | `FIRESTORE_UNAVAILABLE` | Firestore not configured (Mode B only) | Yes (2x, linear) |

### 3.5 Rate Limits

| Service | Limit | Reference |
|---|---|---|
| OpenAI Embeddings | 3,000 RPM (tier 5) | `text-embedding-3-small` |
| Pinecone | Auto-scaling (serverless) | Tied to usage |
| Express API | No built-in limit (single VM) | Deploy behind NGINX for production |

---

## 4. Legacy File Integration Team

**Goal:** Batch-upload patient and report data by dropping flat files on the server.

### 4.1 Integration Model

Legacy EMRs and export systems drop files into a monitored directory. A chokidar-based watcher daemon processes them automatically.

```
Legacy EMR Export
     │
     │  (FTP/SCP or direct filesystem mount)
     ▼
ingestion/incoming/  ←────────  Drop JSON or CSV files here
     │
     ▼
[File Watcher Daemon]
     │
     ├── Parse (auto-detect JSON or CSV)
     ├── Validate (schema check per ingestionValidator.ts)
     ├── Index (POST to Pinecone via Express API)
     └── Archive or Quarantine
```

### 4.2 Directory Structure

```
ingestion/
├── incoming/     ← Drop files here (watched by chokidar)
├── archive/      ← Successfully indexed files (timestamp-prefixed)
└── error/        ← Failed files + sidecar .error.log
```

The file watcher runs as part of the Express server. Set `DISABLE_FILE_WATCHER=1` in `.env` to disable it.

### 4.3 Supported File Formats

#### JSON — Single Patient Record

```json
{
  "patientName": "Test Patient",
  "triageCategory": "Urgent",
  "confidence": 0.85,
  "status": "Registered",
  "timestamp": "2026-06-08T12:00:00.000Z",
  "traceEvents": []
}
```

#### JSON — Array of Records

```json
[
  {
    "patientName": "Patient A",
    "triageCategory": "Emergency",
    "confidence": 0.98,
    "status": "Registered",
    "timestamp": "2026-06-08T12:00:00.000Z",
    "traceEvents": []
  },
  {
    "patientName": "Patient B",
    "triageCategory": "Self-care",
    "confidence": 0.92,
    "status": "Registered",
    "timestamp": "2026-06-08T12:00:00.000Z",
    "traceEvents": []
  }
]
```

#### JSON — Pre-structured (Patients + Reports)

```json
{
  "patients": [
    {
      "patientName": "Patient A",
      "triageCategory": "Emergency",
      "confidence": 0.98,
      "status": "Registered",
      "timestamp": "2026-06-08T12:00:00.000Z",
      "traceEvents": []
    }
  ],
  "reports": [
    {
      "patientId": "CASE-1001",
      "patientName": "Patient A",
      "category": "lab",
      "subType": "blood_panel",
      "status": "pending",
      "confidence": 0.88,
      "createdAt": "2026-06-08T12:30:00.000Z"
    }
  ]
}
```

#### CSV Format

```csv
patientName,triageCategory,confidence,status,timestamp
"Test Patient","Urgent",0.85,"Registered","2026-06-08T12:00:00.000Z"
```

### 4.4 Validation Rules

**Patient required fields:**
| Field | Type | Valid Values |
|---|---|---|
| `patientName` | string | Any |
| `triageCategory` | string | `Self-care`, `Doctor`, `Urgent`, `Emergency` |
| `confidence` | number | 0.0 – 1.0 |
| `timestamp` | string | ISO-8601 |
| `status` | string | `Registered`, `In Triage`, `Needs Review`, `Escalated`, `Resolved` |

**Report required fields:**
| Field | Type | Valid Values |
|---|---|---|
| `patientId` | string | Any |
| `patientName` | string | Any |
| `category` | string | `radiology`, `lab`, `ocr`, `stt`, `symptom` |
| `subType` | string | Any |
| `status` | string | `pending`, `verified`, `flagged` |
| `confidence` | number | 0.0 – 1.0 |
| `createdAt` | string | ISO-8601 |

### 4.5 Error Sidecar Log

When a file fails validation, it is moved to `ingestion/error/` with a `.error.log` sidecar:

```
Failed at: 2026-06-08T12:00:00.000Z
Original file: test-patient.json
Reason: patientName: required string field missing or invalid.
```

### 4.6 Smoke Test

```bash
# Drop a test patient file
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"patients\":[{\"id\":\"test-001\",\"patientName\":\"Test Patient\",\"triageCategory\":\"Urgent\",\"confidence\":0.85,\"status\":\"Registered\",\"timestamp\":\"$TIMESTAMP\"}]}" > ingestion/incoming/verify-test.json

# Check the server log for processing output
tail -20 /tmp/express-server.log | grep -E "fileWatcher|Processing|Done|Archived|Error"
# Expected: "[fileWatcher] Done: verify-test.json | records: 1 found, 1 valid | indexed: true | archived: true"
```

---

## 5. Mobile App / Partner Portal Team

**Goal:** Enable patient triage via mobile app, consume analytics, view notifications.

Mobile apps have **two integration paths**:

| Path | Purpose | Documentation |
|------|---------|---------------|
| **Unified Triage API** | OTP auth, triage, chat follow-up | **[docs/UNIFIED_API_MIGRATION_GUIDE.md §4](UNIFIED_API_MIGRATION_GUIDE.md#4-mobile-app-otp-based-integration)** |
| **Firestore Read-Only** | Dashboard, notifications, analytics | See below (this section) |

### 5.1 Triage Integration (Unified API)

Mobile apps use **OTP-based authentication** to initiate triage sessions:

```
Mobile App
     │
     ├── POST /api/v1/otp/send       → Send OTP to patient's mobile
     ├── POST /api/v1/otp/verify      → Verify OTP code
     ├── POST /api/v1/triage          → Submit symptoms + vitals for triage
     └── POST /api/v1/chat            → Follow-up questions (optional)
```

See the **[migration guide §4](UNIFIED_API_MIGRATION_GUIDE.md#4-mobile-app-otp-based-integration)** for complete React Native code examples and the OTP flow.

> **⚠️ Migration Note:** Previously, mobile apps may have integrated directly with individual AI services. Those endpoints are now deprecated. All AI triage operations must route through the unified API at `https://medical-triage-production.up.railway.app/api/v1`.

### 5.2 Firestore Read-Only Access

For partner portals and internal apps, use Firebase Client SDK with **Firestore read subscriptions**:

```
Partner App
     │
     ├── Dashboard: Firestore  analytics/latest       (read-only)
     ├── Patients:  Firestore  patients/{id}           (read-only, filtered by role)
     ├── Alerts:    Firestore  notifications/{id}      (read-only, can acknowledge)
     └── Models:    Firestore  modelWeights/{id}       (read-only)
```

### 5.3 Firestore Collection Access by Partner Role

| Role | Can Read | Cannot Write | Notes |
|---|---|---|---|
| `public_health` | `analytics/latest` | All collections | Aggregate stats only |
| `insurance_partner` | `reports/*` | All collections | Verified reports only |
| `clinician` | `patients/*`, `reports/*` | Needs admin for mutations | Full read access |

### 5.4 Read-Only Subscriptions

#### Analytics Snapshot

```javascript
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const unsubscribe = onSnapshot(doc(db, 'analytics', 'latest'), (snap) => {
  if (snap.exists()) {
    const data = snap.data();
    console.log('Total sessions:', data.totalTriageSessions);
    console.log('Urgency breakdown:', data.urgencyBreakdown);
    console.log('AI accuracy:', data.aiAccuracyMetrics);
  }
});
```

> **⚠️ First-15-minute gap:** The `analytics/latest` document is written by the `computeAnalyticsSnapshot` Cloud Function which runs every 15 minutes. For the first 15 minutes after initial seeding (or after a Firestore reset), this document may not exist. The Admin Portal SPA has a fallback that aggregates data client-side — partner apps using raw Firestore SDK should implement a similar fallback or wait for the first scheduled write.

#### Notifications (with acknowledgment)

```javascript
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';

// Subscribe to live notifications
const unsubscribe = onSnapshot(
  collection(db, 'notifications'),
  (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        showNotification(change.doc.data());
      }
    });
  }
);

// Acknowledge a notification
await updateDoc(doc(db, 'notifications', 'NOTIF-001'), {
  acknowledged: true,
  acknowledgedBy: '<user-id>',
});
```

#### Patient Status (filtered view)

```javascript
import { collection, query, where, onSnapshot } from 'firebase/firestore';

// Watch only escalated cases
const q = query(
  collection(db, 'patients'),
  where('status', '==', 'Escalated')
);

const unsubscribe = onSnapshot(q, (snapshot) => {
  snapshot.forEach((doc) => {
    console.log('Escalated:', doc.id, doc.data().patientName);
  });
});
```

### 5.4 Data Format (Read-Only)

All response documents follow the schemas in `docs/API_CONTRACT.md §2`. Key highlights for partners:

| Collection | Key Fields | Volume |
|---|---|---|
| `analytics/latest` | `totalTriageSessions`, `urgencyBreakdown`, `aiAccuracyMetrics` | 1 document |
| `notifications` | `category`, `severity`, `title`, `message`, `acknowledged` | ~50 active |
| `patients` | `patientName`, `triageCategory`, `status`, `confidence` | Variable |
| `modelWeights` | `tag`, `type`, `accuracyRate`, `status` | ~5 models |

---

## 6. Admin Portal SPA Team (Internal)

**Goal:** Develop and maintain the React frontend that consumes all integration surfaces.

### 6.1 Architecture

```
React SPA (src/)
     │
     ├── src/lib/api.ts           ←─ Centralized Firestore + REST abstraction
     ├── src/lib/rbac.ts           ←─ Permission matrix (8 roles × 22 actions)
     ├── src/lib/eventBus.ts       ←─ Cross-module pub/sub
     ├── src/lib/pii.ts            ←─ PHI de-identification
     ├── src/context/AuthContext.tsx ←─ Firebase Auth wrapper
     └── src/components/           ←─ 40+ React components
```

### 6.2 Client-Side API Patterns

All data access goes through `src/lib/api.ts`. Components **must not** access Firestore directly per architecture rules (see `AGENTS.md`).

#### Authentication

```typescript
import { api } from '../lib/api';

// Login
await api.auth.login('admin@apexhealth.com', 'password');
// AuthContext handles token lifecycle automatically
```

#### CRUD Operations

```typescript
// Read all patients
const patients = await api.patients.getAll();

// Create patient with audit trail
const id = await api.patients.create(patientData, userId, userRole);

// Update status (auto-generates trace event + EventBus emit)
await api.patients.updateStatus('CASE-1001', 'Escalated', userId, userRole, 'Clinical override');

// Subscribe to real-time updates
const unsubscribe = api.kiosks.subscribeToKiosks((kiosks) => {
  setKiosks(kiosks);
});
```

#### Vector Search (REST API)

```typescript
// Semantic search
const result = await api.vectorSearch.search('chest pain', 10, {
  triageCategory: 'Emergency',
  minConfidence: 0.8,
});

// Batch re-index
const stats = await api.vectorSearch.indexAll(
  [{ id: 'CASE-1001', text: 'Patient: Michael Chen...' }],
  []
);
console.log(`Indexed: ${stats.indexedCount}/${stats.totalInIndex}`);
```

#### Report Verification

```typescript
// Verify a report with optional clinician override
await api.reports.verify(
  'report-2001',
  userId,
  'clinician',
  'Context Insufficiency',     // Override reason (or null for agreement)
  'Missing ECG data for full assessment',
  'Context Insufficiency'
);
```

### 6.3 EventBus Subscriptions

Cross-module events flow through `src/lib/eventBus.ts`:

| Event Type | Payload | Triggered By |
|---|---|---|
| `CASE_STATUS_CHANGED` | `{ patientId, newStatus, event: TraceEvent }` | `api.patients.updateStatus()` |
| `EMERGENCY_ALERT_TRIGGERED` | `{ alertId, urgency, message }` | System |
| `FACILITY_CHANGED` | `{ action, data: Facility }` | `api.organizations.*` |

```typescript
import { eventBus } from '../lib/eventBus';

eventBus.on('CASE_STATUS_CHANGED', ({ payload }) => {
  console.log(`Patient ${payload.patientId} → ${payload.newStatus}`);
  // Update local state, refresh chart, show toast
});
```

### 6.4 RBAC Enforcement

Every component must gate admin/clinical actions via `can(userRole, action)`:

```typescript
import { can } from '../lib/rbac';

const userRole = 'clinician'; // From AuthContext

{can(userRole, 'VERIFY_REPORT') && (
  <button onClick={verifyReport}>Verify Report</button>
)}

{can(userRole, 'MANAGE_SETTINGS') && (
  <button onClick={updateSettings}>Update Settings</button>
)}
```

### 6.5 Key Component → API Mapping

| View Component | API Methods Used | Data Source |
|---|---|---|
| `DashboardView` | `api.patients.getAll`, `analyticsService.getSnapshot` | Firestore |
| `TriageQueue` | `api.patients.getAll`, `api.patients.updateStatus` | Firestore |
| `ReportManagementView` | `api.reports.subscribeToReports`, `api.reports.verify` | Firestore |
| `VectorSearchView` | `api.vectorSearch.search`, `api.vectorSearch.getSimilarCases` | Express REST |
| `KioskManagementView` | `api.kiosks.subscribeToKiosks` | Firestore |
| `SettingsManagementView` | `api.settings.get`, `api.settings.update` | Firestore |
| `NotificationCenterView` | `api.notifications.getAll`, `api.notifications.acknowledge` | Firestore |
| `AnalyticsDashboardView` | `api.analytics.getSnapshot` | Firestore |
| `UserManagementView` | `api.users.getAll`, `api.users.create`, `api.users.update` | Firestore |
| `SystemHealthDashboardView` | `api.health.subscribe` | Firestore |
| `AuditLogView` | `api.auditLogs.subscribeToAuditLogs` | Firestore |

---

## Quick Reference Card

| Team | Integration Model | Auth Method | Primary Endpoints | Doc Section |
|---|---|---|---|---|
| **Kiosk** | Firestore Direct + **Unified Triage API** | Firebase Auth + Bearer | `kiosks/*`, `patients/*`, `POST /api/v1/*` | [§1](#1-kiosk-hardware-team) + [Migration Guide](UNIFIED_API_MIGRATION_GUIDE.md) |
| **EMR** | Firestore Direct + File Ingest | Firebase Auth + Bearer | `reports/*`, `ingestion/incoming/` | [§2](#2-emr--lab-systems-team) |
| **AI/ML** | Express REST API | `Bearer <ADMIN_API_KEY>` | `POST /api/vector/*`, `GET /health` | [§3](#3-ai--ml-engineering-team) |
| **Legacy File** | File System | Server file access | `ingestion/incoming/` directory | [§4](#4-legacy-file-integration-team) |
| **Mobile App** | **Unified Triage API** + Firestore Read-Only | OTP + Firebase Auth | `POST /api/v1/otp/*`, `POST /api/v1/triage`, `POST /api/v1/chat` | [§5](#5-mobile-app--partner-portal-team) + [Migration Guide](UNIFIED_API_MIGRATION_GUIDE.md) |
| **Portal SPA** | Firestore + REST (internal) | Firebase Auth + Bearer | All via `src/lib/api.ts` | [§6](#6-admin-portal-spa-team-internal) |

---

*Document version 2.0.0 — Updated June 2026 (API consolidation).*
*Corresponding files: `docs/API_CONTRACT.md` (comprehensive reference), `docs/openapi.yaml` (machine-readable OpenAPI spec),
`docs/UNIFIED_API_MIGRATION_GUIDE.md` (mobile + kiosk migration guide)*
