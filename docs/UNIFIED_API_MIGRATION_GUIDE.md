# Unified Triage API — Migration Guide

> **For Mobile Application and Kiosk System teams.**
> This guide explains how to integrate with the consolidated AI Medical Triage API
> at `https://medical-triage-production.up.railway.app/api/v1`.
>
> **Previous separate APIs (now consolidated):**
> - LLM + RAG Pipeline (separate triage endpoint)
> - OCR ML Service (separate microservice)
> - Visual Symptom Analysis (separate microservice)
> - X-Ray Classification (separate microservice)
>
> **Still separate (no unified equivalent):**
> - STT (Speech-to-Text) — remains on `stt-tts-service-production.up.railway.app`
> - TTS (Text-to-Speech) — remains on OpenAI directly

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Authentication](#2-authentication)
3. [Kiosk: Complete Triage Workflow](#3-kiosk-complete-triage-workflow)
4. [Mobile App: OTP-Based Integration](#4-mobile-app-otp-based-integration)
5. [Legacy Endpoint Migration Matrix](#5-legacy-endpoint-migration-matrix)
6. [Error Handling](#6-error-handling)
7. [Rate Limits & Performance](#7-rate-limits--performance)
8. [Testing & Validation](#8-testing--validation)

---

## 1. API Overview

### Base URL

```
https://medical-triage-production.up.railway.app/api/v1
```

### Available Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| `GET` | `/health` | System health check (RAG readiness, model version) | No |
| `POST` | `/triage` | Initialize a triage session | No |
| `POST` | `/chat` | Send follow-up messages to an existing session | No |
| `POST` | `/consent` | Save patient consent forms | No |
| `POST` | `/patient` | Save patient demographic info | No |
| `POST` | `/symptoms` | Log patient symptoms | No |
| `POST` | `/vitals` | Record patient vital signs | No |
| `POST` | `/visual-scan` | Submit an image for visual triage/scan | No |
| `POST` | `/reports` | Upload medical report files | No |
| `POST` | `/analyse` | Trigger the final analysis for a session | No |
| `POST` | `/otp/send` | Send a One-Time Password to a mobile number | No |
| `POST` | `/otp/verify` | Verify a One-Time Password | No |
| `POST` | `/admin/rebuild-index` | Rebuild the search index (requires `x-admin-key` header) | Yes |

### Standard Response Format

All successful responses return JSON with the expected schema (see §3-4 for per-endpoint details).

Error responses follow this format:

```json
{
  "detail": [
    {
      "loc": ["body", "symptoms"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

HTTP status codes:
- `200` — Success
- `422` — Validation error (check `detail` array for field-level errors)
- `500` — Server error

---

## 2. Authentication

### Kiosk Systems

Kiosk terminals use the **session-based** flow. No persistent auth is required:
1. Call `POST /triage` to get a `session_id`
2. Pass this `session_id` to all subsequent calls (`/patient`, `/symptoms`, `/vitals`, `/visual-scan`, `/reports`)
3. Call `POST /analyse?session_id=...` at the end to trigger the final triage analysis

### Mobile Applications

Mobile apps use **OTP-based authentication**:

#### Step 1: Send OTP

```http
POST /api/v1/otp/send
Content-Type: application/json

{
  "mobile": "+1234567890"
}
```

**Success Response (200):**
```json
{
  "status": "otp_sent",
  "message": "OTP sent successfully"
}
```

#### Step 2: Verify OTP

```http
POST /api/v1/otp/verify
Content-Type: application/json

{
  "mobile": "+1234567890",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "status": "verified",
  "message": "OTP verified successfully"
}
```

After OTP verification, the mobile app can proceed with the triage workflow using the same session-based flow described in §3.

### Admin Operations

For `POST /admin/rebuild-index`, include the admin key header:

```http
POST /api/v1/admin/rebuild-index
x-admin-key: your-admin-key-here
Content-Type: application/json
```

---

## 3. Kiosk: Complete Triage Workflow

This is the **recommended flow** for kiosk terminals. The API is designed to follow this exact sequence:

```
POST /triage        → session_id
        ↓
POST /consent       (optional — save consent)
        ↓
POST /patient       (save demographics)
        ↓
POST /symptoms      (log symptoms)
        ↓
POST /vitals        (record vitals)
        ↓
POST /visual-scan   (optional — upload images)
        ↓
POST /reports       (optional — upload medical reports)
        ↓
POST /analyse       → final triage result
        ↓
POST /chat          (optional — follow-up questions)
```

### 3.1 Health Check

Before starting, verify the API is reachable:

**Request:**
```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "ok",
  "rag_ready": true,
  "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "version": "1.0.0"
}
```

**Python:**
```python
import requests

resp = requests.get("https://medical-triage-production.up.railway.app/api/v1/health")
health = resp.json()
print(f"API status: {health['status']}, RAG ready: {health['rag_ready']}")
```

---

### 3.2 Initialize Triage Session

**Request:**
```http
POST /api/v1/triage
Content-Type: application/json

{
  "symptoms": "Severe chest pain radiating to left arm, started 20 minutes ago. Patient is sweating and feels nauseated.",
  "vitals": {
    "heart_rate": 118,
    "spo2": 94,
    "blood_pressure": {
      "systolic": 88,
      "diastolic": 60
    },
    "temperature": 37.2
  },
  "report_text": "Previous ECG shows ST elevation in leads V1-V4. Patient has history of hypertension.",
  "visual_notes": "Patient appears pale and diaphoretic"
}
```

**Request Fields:**

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `symptoms` | string | **Yes** | 4000 chars | Patient's symptom description |
| `vitals` | object | No | — | Measured vital signs (see below) |
| `report_text` | string | No | 8000 chars | OCR-extracted text from medical reports |
| `visual_notes` | string | No | 2000 chars | Visual / physical observation notes |

**Vitals Object:**

| Field | Type | Valid Range | Description |
|-------|------|-------------|-------------|
| `heart_rate` | integer | 20–300 bpm | Heart rate in beats per minute |
| `spo2` | number | 50–100% | Oxygen saturation |
| `blood_pressure` | object | — | `{ systolic: 40-300, diastolic: 20-200 }` |
| `temperature` | number | 30–45°C | Body temperature |

**Response:**
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "urgency_level": "emergency_referral",
  "reasoning": "Patient presents with classic cardiac chest pain (radiating to left arm) accompanied by diaphoresis and nausea. Hypotensive with narrow pulse pressure suggests possible cardiogenic shock. ECG findings of ST elevation confirm STEMI.",
  "next_steps": "Immediate EMS activation. Administer aspirin 325mg chewed. Prepare for primary PCI. Notify cardiology team.",
  "red_flags": [
    "Chest pain radiating to left arm",
    "Hypotension (88/60 mmHg)",
    "ST elevation on ECG",
    "Diaphoresis and nausea"
  ],
  "disclaimer": "⚠️ This is an AI-assisted triage assessment. It does NOT replace a licensed medical professional's judgment.",
  "latency_ms": 1247
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Session ID — pass to all subsequent calls |
| `urgency_level` | string | One of: `self_care`, `doctor_consultation`, `urgent_care`, `emergency_referral` |
| `reasoning` | string | 2-3 sentence clinical reasoning |
| `next_steps` | string | Recommended next steps |
| `red_flags` | string[] | List of detected red-flag symptoms |
| `disclaimer` | string | Mandatory medical disclaimer |
| `latency_ms` | int | Pipeline latency in milliseconds |

**curl:**
```bash
curl -X POST https://medical-triage-production.up.railway.app/api/v1/triage \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "Severe chest pain radiating to left arm",
    "vitals": {
      "heart_rate": 118,
      "spo2": 94,
      "blood_pressure": { "systolic": 88, "diastolic": 60 },
      "temperature": 37.2
    }
  }'
```

---

### 3.3 Save Patient Consent (Optional)

**Request:**
```http
POST /api/v1/consent
Content-Type: application/json

{
  "consent_items": [
    "I consent to telemedicine consultation",
    "I consent to sharing my medical data for AI-assisted triage",
    "I consent to contacting emergency contacts if needed"
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | No | User identifier (optional for kiosk flow) |
| `consent_items` | string[] | **Yes** | List of consent items agreed to |

---

### 3.4 Save Patient Demographics

**Request:**
```http
POST /api/v1/patient
Content-Type: application/json

{
  "session_id": "sess_a1b2c3d4e5f6",
  "name": "Michael Chen",
  "age": 58,
  "gender": "male",
  "mobile": "+1234567890",
  "conditions": ["hypertension", "type-2 diabetes"],
  "allergies": "penicillin"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | From `POST /triage` response |
| `name` | string | **Yes** | Patient's full name |
| `age` | integer | **Yes** | Patient's age |
| `gender` | string | **Yes** | Patient's gender |
| `mobile` | string | **Yes** | Mobile number |
| `conditions` | string[] | No | Pre-existing conditions (default: []) |
| `allergies` | string | No | Known allergies |

**Python:**
```python
import requests

resp = requests.post(
    "https://medical-triage-production.up.railway.app/api/v1/patient",
    json={
        "session_id": "sess_a1b2c3d4e5f6",
        "name": "Michael Chen",
        "age": 58,
        "gender": "male",
        "mobile": "+1234567890",
        "conditions": ["hypertension"],
    },
)
print(f"Status: {resp.status_code}")
```

---

### 3.5 Log Symptoms

**Request:**
```http
POST /api/v1/symptoms
Content-Type: application/json

{
  "session_id": "sess_a1b2c3d4e5f6",
  "patient_id": "pat_abc123",
  "symptoms": ["chest pain", "shortness of breath", "nausea"],
  "duration": "20 minutes",
  "severity": "severe"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | From `POST /triage` |
| `patient_id` | string | **Yes** | Patient identifier |
| `symptoms` | string[] | **Yes** | List of symptoms |
| `duration` | string | No | How long symptoms have persisted |
| `severity` | string | No | Severity description |

---

### 3.6 Record Vital Signs

**Request:**
```http
POST /api/v1/vitals
Content-Type: application/json

{
  "session_id": "sess_a1b2c3d4e5f6",
  "patient_id": "pat_abc123",
  "heart_rate": 118,
  "spo2": 94,
  "blood_pressure": "88/60",
  "temperature": 37.2,
  "respiration_rate": 22,
  "glucose": 145
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | From `POST /triage` |
| `patient_id` | string | **Yes** | Patient identifier |
| `heart_rate` | int | No | Heart rate in bpm |
| `spo2` | number | No | Oxygen saturation % |
| `blood_pressure` | string | No | BP as string (e.g., "120/80") |
| `temperature` | number | No | Body temperature in °C |
| `respiration_rate` | int | No | Respiratory rate (breaths/min) |
| `glucose` | number | No | Blood glucose level |

---

### 3.7 Upload Visual Scan / Image

Accepts an image for visual triage (skin, eyes, nails, tongue, or general imaging).

**Request:**
```http
POST /api/v1/visual-scan
Content-Type: multipart/form-data

session_id: sess_a1b2c3d4e5f6
patient_id: pat_abc123
image: [binary image file]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | From `POST /triage` |
| `patient_id` | string | **Yes** | Patient identifier |
| `image` | file | **Yes** | Image file (JPEG, PNG, WebP, TIFF) |

**Python (with file upload):**
```python
import requests

resp = requests.post(
    "https://medical-triage-production.up.railway.app/api/v1/visual-scan",
    files={
        "session_id": (None, "sess_a1b2c3d4e5f6"),
        "patient_id": (None, "pat_abc123"),
        "image": ("skin_rash.jpg", open("skin_rash.jpg", "rb"), "image/jpeg"),
    },
)
print(resp.json())
```

**Kotlin (Android Kiosk):**
```kotlin
val client = OkHttpClient()
val requestBody = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("session_id", "sess_a1b2c3d4e5f6")
    .addFormDataPart("patient_id", "pat_abc123")
    .addFormDataPart("image", "skin_rash.jpg",
        RequestBody.create(MediaType.parse("image/jpeg"), imageFile))
    .build()

val request = Request.Builder()
    .url("https://medical-triage-production.up.railway.app/api/v1/visual-scan")
    .post(requestBody)
    .build()

client.newCall(request).execute().use { response ->
    println(response.body()?.string())
}
```

---

### 3.8 Upload Medical Reports

Uploads one or more medical report files (lab results, X-rays, blood reports).

**Request:**
```http
POST /api/v1/reports
Content-Type: multipart/form-data

session_id: sess_a1b2c3d4e5f6
patient_id: pat_abc123
files: [binary file 1]
files: [binary file 2]
types: blood_report
types: xray
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | **Yes** | From `POST /triage` |
| `patient_id` | string | **Yes** | Patient identifier |
| `files` | file[] | **Yes** | Array of report files |
| `types` | string[] | **Yes** | Array of report type labels (one per file) |

**Python (multiple files):**
```python
import requests

resp = requests.post(
    "https://medical-triage-production.up.railway.app/api/v1/reports",
    files=[
        ("session_id", (None, "sess_a1b2c3d4e5f6")),
        ("patient_id", (None, "pat_abc123")),
        ("files", ("blood_report.png", open("blood_report.png", "rb"), "image/png")),
        ("files", ("xray.png", open("xray.png", "rb"), "image/png")),
        ("types", (None, "blood_report")),
        ("types", (None, "xray")),
    ],
)
```

---

### 3.9 Trigger Final Analysis

After all data has been submitted, trigger the final analysis to receive the triage result.

**Request:**
```http
POST /api/v1/analyse?session_id=sess_a1b2c3d4e5f6
```

**Response:**
```json
{
  "status": "analysis_complete",
  "session_id": "sess_a1b2c3d4e5f6",
  "result": {
    "urgency_level": "emergency_referral",
    "reasoning": "...",
    "next_steps": "...",
    "red_flags": ["..."],
    "disclaimer": "⚠️ ..."
  }
}
```

---

### 3.10 Follow-Up Chat (Optional)

After the analysis, users can ask follow-up questions.

**Request:**
```http
POST /api/v1/chat
Content-Type: application/json

{
  "session_id": "sess_a1b2c3d4e5f6",
  "message": "What should I do while waiting for the ambulance?"
}
```

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `session_id` | string | **Yes** | — | From `POST /triage` response |
| `message` | string | **Yes** | 2000 chars | Follow-up message from the patient |

**Response:**
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "reply": "While waiting for emergency services:\n\n1. Sit or lie down in a comfortable position\n2. Take one aspirin (325mg) if not allergic\n3. Loosen tight clothing\n4. If available, take prescribed nitroglycerin\n5. Keep the door unlocked for paramedics\n\nDo NOT drive yourself — wait for the ambulance."
}
```

**JavaScript (React Native Mobile App):**
```javascript
const response = await fetch(
  'https://medical-triage-production.up.railway.app/api/v1/chat',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'sess_a1b2c3d4e5f6',
      message: 'What should I do while waiting?',
    }),
  }
);
const data = await response.json();
console.log(data.reply);
```

---

## 4. Mobile App: OTP-Based Integration

Mobile applications can follow an **abbreviated flow** using OTP authentication:

### 4.1 Complete Mobile Flow

```
1. POST /otp/send      → Send OTP to patient's mobile
2. POST /otp/verify     → Verify OTP code
3. POST /triage         → Initialize triage (can include symptoms + vitals)
4. POST /chat           → Ask follow-up questions
```

Since mobile apps typically collect symptoms and vitals through a guided UI, the full kiosk flow (consent → patient → symptoms → vitals → reports → analyse) can often be simplified. The `/triage` endpoint accepts `symptoms` and `vitals` directly, making it a single-call operation for mobile.

### 4.2 Mobile-First Example (React Native)

```javascript
// Step 1: Send OTP
await fetch('https://medical-triage-production.up.railway.app/api/v1/otp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mobile: '+1234567890' }),
});

// Step 2: Verify OTP
const verifyResp = await fetch(
  'https://medical-triage-production.up.railway.app/api/v1/otp/verify',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: '+1234567890', otp: '123456' }),
  }
);

// Step 3: Triage (single call with symptoms + vitals)
const triageResp = await fetch(
  'https://medical-triage-production.up.railway.app/api/v1/triage',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symptoms: 'Headache for 3 days, fever of 101°F, sensitivity to light',
      vitals: { temperature: 38.3, heart_rate: 102 },
    }),
  }
);
const triage = await triageResp.json();
// → { session_id, urgency_level, reasoning, next_steps, red_flags }

// Step 4: Follow-up chat
const chatResp = await fetch(
  'https://medical-triage-production.up.railway.app/api/v1/chat',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: triage.session_id,
      message: 'Should I go to the ER or can I wait for a doctor appointment?',
    }),
  }
);
const chat = await chatResp.json();
```

---

## 5. Legacy Endpoint Migration Matrix

If your team was previously using any of these separate endpoints, here is the migration path:

### 5.1 LLM + RAG Triage

| Legacy | Unified API | Changes Needed |
|--------|-------------|----------------|
| `POST /triage` (separate service) | `POST /api/v1/triage` | Add `/api/v1` prefix. Map `patient_case` → `report_text`, `chief_complaint` → `visual_notes`. Vitals: `hr` → `heart_rate`, `o2_sat` → `spo2`, `bp` → `blood_pressure` (structured). |
| `POST /chat` | `POST /api/v1/chat` | Add `/api/v1` prefix. Response no longer includes `disclaimer` field. |
| `GET /health` | `GET /api/v1/health` | Add `/api/v1` prefix. |
| `POST /admin/rebuild-index` | `POST /api/v1/admin/rebuild-index` | Add `/api/v1` prefix. Uses `x-admin-key` header. |

### 5.2 OCR / Report Upload

| Legacy | Unified API | Changes Needed |
|--------|-------------|----------------|
| `POST /ocr/process` (separate ML service) | `POST /api/v1/reports` | Requires `session_id` and `patient_id`. Files are uploaded as `files[]` array with associated `types[]`. No separate OCR extraction response — analysis is returned via `/analyse`. |

### 5.3 Visual / Imaging Analysis

| Legacy | Unified API | Changes Needed |
|--------|-------------|----------------|
| `POST /visual/analyze` (separate ML service) | `POST /api/v1/visual-scan` | Requires `session_id` and `patient_id`. Image field is named `image` (not `file`). |
| `POST /xray/classify` (separate ML service) | `POST /api/v1/visual-scan` | Same endpoint as visual scan. The backend differentiates by context. |

### 5.4 What NOT to Migrate

| Service | Reason |
|---------|--------|
| **STT (Speech-to-Text)** | No `/transcribe` equivalent exists in the unified API. Continue using the existing STT service. |
| **TTS (Text-to-Speech)** | No `/speech` equivalent exists. Continue using OpenAI TTS directly. |

---

## 6. Error Handling

### 6.1 Validation Errors

The API returns `422 Unprocessable Entity` with field-level validation details:

```json
{
  "detail": [
    {
      "loc": ["body", "symptoms"],
      "msg": "ensure this value has at least 3 characters",
      "type": "value_error.any_str.min_length"
    }
  ]
}
```

### 6.2 Common Error Scenarios

| Scenario | Status | Detail | Fix |
|----------|--------|--------|-----|
| Missing required field | `422` | `"msg": "field required"` | Add the missing field |
| Value too short | `422` | `"msg": "ensure this value has at least N characters"` | Increase input length |
| Value too long | `422` | `"msg": "ensure this value has at most N characters"` | Truncate input |
| Invalid enum | `422` | `"msg": "value is not a valid enumeration member"` | Use correct value |
| Invalid vital range | `422` | `"msg": "ensure this value is greater than or equal to N"` | Fix out-of-range value |
| Session not found | `422` | `"msg": "session_id not found"` | Get a new session via `/triage` |
| Server error | `500` | Internal error | Retry with exponential backoff |

### 6.3 Retry Strategy

| Status Code | Retry? | Strategy |
|-------------|--------|----------|
| `422` | ❌ No | Fix the request and retry |
| `500` | ✅ Yes | Exponential backoff: 1s, 2s, 4s, max 3 retries |
| Timeout | ✅ Yes | Retry once after 5s |

---

## 7. Rate Limits & Performance

### 7.1 Recommended Timeouts

| Operation | Recommended Timeout |
|-----------|-------------------|
| Health check (`GET /health`) | 5s |
| Triage (`POST /triage`) | 30s |
| Chat (`POST /chat`) | 15s |
| Visual scan / Reports upload | 30s |
| Analyse (`POST /analyse`) | 60s |
| OTP send/verify | 10s |

### 7.2 Best Practices

1. **Always check `/health` first** — verify the API is reachable before starting a session
2. **Reuse `session_id`** — one session per patient, not one session per step
3. **Upload files last** — collect all patient data first, then upload images/reports, then call `/analyse`
4. **Handle `422` gracefully** — validation errors contain field-level `loc` paths that tell you exactly which field is wrong
5. **Store session IDs** — the `session_id` from `/triage` is needed for the entire workflow and for `/chat` follow-ups

### 7.3 Request Size Limits

| Constraint | Limit |
|------------|-------|
| Symptoms text | 4000 characters |
| Report text (`report_text`) | 8000 characters |
| Visual notes | 2000 characters |
| Chat message | 2000 characters |

---

## 8. Testing & Validation

### 8.1 Smoke Test Script

```bash
#!/bin/bash
# Quick smoke test — verifies the API is reachable and responsive

BASE="https://medical-triage-production.up.railway.app/api/v1"

echo "1. Health check"
curl -s "$BASE/health" | jq .

echo ""
echo "2. Start triage session"
SESSION=$(curl -s -X POST "$BASE/triage" \
  -H "Content-Type: application/json" \
  -d '{"symptoms": "Mild headache for 2 hours"}' | jq -r '.session_id')
echo "Session: $SESSION"

echo ""
echo "3. Save patient"
curl -s -X POST "$BASE/patient" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION\", \"name\": \"Test Patient\", \"age\": 30, \"gender\": \"male\", \"mobile\": \"+1234567890\"}" | jq .

echo ""
echo "4. Log symptoms"
curl -s -X POST "$BASE/symptoms" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION\", \"patient_id\": \"test-001\", \"symptoms\": [\"headache\"]}" | jq .

echo ""
echo "5. Analyse"
curl -s -X POST "$BASE/analyse?session_id=$SESSION" | jq .

echo ""
echo "✅ Smoke test complete"
```

### 8.2 Integration Checklist

| Check | Description | Verified |
|-------|-------------|----------|
| Health check | `GET /api/v1/health` returns `200` with `status: "ok"` | ☐ |
| Triage session | `POST /api/v1/triage` returns a `session_id` | ☐ |
| Patient save | `POST /api/v1/patient` returns `200` | ☐ |
| Symptoms log | `POST /api/v1/symptoms` returns `200` | ☐ |
| Vitals record | `POST /api/v1/vitals` returns `200` | ☐ |
| Report upload | `POST /api/v1/reports` with multipart file upload returns `200` | ☐ |
| Visual scan | `POST /api/v1/visual-scan` with image upload returns `200` | ☐ |
| Analyse | `POST /api/v1/analyse` returns final triage result | ☐ |
| Chat | `POST /api/v1/chat` returns a `reply` | ☐ |
| OTP send | `POST /api/v1/otp/send` returns `"otp_sent"` | ☐ |
| OTP verify | `POST /api/v1/otp/verify` returns `"verified"` | ☐ |

### 8.3 Migration Verification

After migrating from legacy endpoints, verify:

- [ ] Requests that previously went to `mlservice-production-4d52.up.railway.app` now go to the unified API
- [ ] All requests include the new required fields (`session_id`, `patient_id` where applicable)
- [ ] The `session_id` from `POST /triage` is threaded through the entire workflow
- [ ] File uploads use the correct field names (`image`, `files[]`, `types[]`)
- [ ] Error responses are handled according to §6

---

## Appendix: Quick Reference

### Base URL
```
https://medical-triage-production.up.railway.app/api/v1
```

### Kiosk Flow (Minimal)
```bash
# 1. Start session
curl -X POST $BASE/triage -H "Content-Type: application/json" \
  -d '{"symptoms": "chest pain"}'
# → { "session_id": "sess_...", ... }

# 2. Save patient
curl -X POST $BASE/patient -H "Content-Type: application/json" \
  -d '{"session_id": "sess_...", "name": "...", "age": 30, "gender": "male", "mobile": "+..."}'

# 3. Analyse (after all data submitted)
curl -X POST "$BASE/analyse?session_id=sess_..."
```

### Mobile Flow (Minimal)
```bash
# 1. Send OTP
curl -X POST $BASE/otp/send -H "Content-Type: application/json" \
  -d '{"mobile": "+1234567890"}'

# 2. Verify OTP
curl -X POST $BASE/otp/verify -H "Content-Type: application/json" \
  -d '{"mobile": "+1234567890", "otp": "123456"}'

# 3. Triage (single call)
curl -X POST $BASE/triage -H "Content-Type: application/json" \
  -d '{"symptoms": "fever and cough for 3 days", "vitals": {"temperature": 38.5}}'

# 4. Follow-up
curl -X POST $BASE/chat -H "Content-Type: application/json" \
  -d '{"session_id": "sess_...", "message": "Should I go to the ER?"}'
```

---

### OpenAPI Spec

For the complete machine-readable specification, visit:
```
https://medical-triage-production.up.railway.app/openapi.json
```

---

*Document version 1.0.0 — June 2026*
*Corresponding files: `docs/INTEGRATION_ENDPOINTS.md`, `docs/API_CONTRACT.md`, `server/services/triageApiClient.ts`*
