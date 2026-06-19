# AI Medical Triage Engine

An AI-powered triage platform that guides patients through a structured kiosk flow — collecting consent, demographics, symptoms, vitals, and medical reports — then classifies urgency using a **BM25 RAG + LLM pipeline** and stores every session in Supabase.

> **This system is NOT a diagnostic tool and does NOT replace a licensed medical professional.** It is designed to assist in triage prioritisation only.

---

## System Overview

The platform is split into two independent FastAPI services:

| Service | Port | Purpose |
|---|---|---|
| **Triage API** (`api/`) | 8000 | Kiosk flow, triage engine, chat, OTP auth |
| **ML Service** (`ml_service/`) | 8001 | Blood report OCR, chest X-ray classification |

Both services are deployed on Railway and communicate over HTTP.

---

## Architecture

```
Patient (Kiosk / Mobile)
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Triage API  (port 8000)                  │
│                                                                 │
│  /otp/*  ──► Auth (Supabase users table)                        │
│  /consent, /patient, /symptoms, /vitals  ──► Supabase tables    │
│  /visual-scan, /reports  ──► ML Service (port 8001)             │
│  /analyse  ──► RAG Pipeline + LLM (OpenRouter / Nemotron)       │
│  /voice-triage  ──► STT Service ──► /analyse                    │
│  /triage, /chat  ──► RAG Pipeline + LLM (direct)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────┐      ┌─────────────────────────────────┐
│   ML Service (8001)  │      │         Supabase (DB)            │
│                      │      │                                  │
│  POST /ocr/process   │      │  consent, patients, symptoms,    │
│  POST /xray/classify │      │  vitals, reports, users,         │
│  POST /visual/analyze│      │  triage_sessions                 │
└──────────────────────┘      └─────────────────────────────────┘
```

---

## Project Structure

```
triage-engine/
├── api/
│   └── main.py                  # FastAPI app — all endpoints, schemas, middleware
├── triage/
│   └── triage_chain.py          # RAG context injection + LLM prompt + response parsing
├── rag/
│   └── rag_pipeline.py          # BM25 retriever built from knowledge base
├── knowledge_base/
│   └── medical_guidelines.py    # Clinical triage guideline documents
├── db/
│   └── client.py                # Supabase client + async persistence helpers
├── ml_service/
│   ├── main.py                  # ML FastAPI service (OCR + X-ray)
│   ├── ocr_engine.py            # EasyOCR extraction + regex metric parsing
│   ├── xray_engine.py           # ViT-based pneumonia classifier
│   └── templates/index.html     # ML service web dashboard
├── railway.toml                 # Railway deployment config
├── requirements.txt
├── env.example
└── README.md
```

---

## Quickstart

### Prerequisites

- Python 3.11+
- [OpenRouter API key](https://openrouter.ai/keys)
- Supabase project (URL + anon key)

### 1. Clone and enter the project

```bash
git clone https://github.com/SystemaOps/Triage-Engine.git
cd Triage-Engine
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment

```bash
cp env.example .env
# Fill in the values below
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key |
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | Your Supabase anon/service key |
| `ADMIN_API_KEY` | Yes | Key for `/admin/rebuild-index` |
| `LLM_MODEL` | No | Defaults to `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` |
| `RAG_TOP_K` | No | Guidelines to retrieve per query (default: `4`) |
| `LOG_LEVEL` | No | Logging verbosity (default: `INFO`) |

### 5. Run the Triage API

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Run the ML Service (separate terminal)

```bash
cd ml_service
python main.py          # runs on port 8001
```

Swagger docs available at `http://localhost:8000/docs` and `http://localhost:8001/docs`.

---

## API Reference

All Triage API routes are prefixed with `/api/v1` in production (via `root_path`).

### Auth

#### `POST /otp/send`
Send a one-time password to a mobile number.

```json
{ "mobile": "+919876543210" }
```

#### `POST /otp/verify`
Verify the OTP and receive a user token.

```json
{ "mobile": "+919876543210", "otp": "482910" }
```

Response:
```json
{ "success": true, "userId": "uuid", "token": "temp_token_uuid" }
```

---

### Kiosk Flow

The kiosk collects patient data across these steps in order:

#### `POST /consent`
Record consent items. Returns a new `session_id` that ties the rest of the session together.

```json
{
  "user_id": "optional-user-id",
  "consent_items": ["I agree to terms", "I consent to data processing"]
}
```

#### `POST /patient`
Save patient demographics.

```json
{
  "session_id": "uuid",
  "name": "Jane Doe",
  "age": 34,
  "gender": "Female",
  "mobile": "+919876543210",
  "conditions": ["diabetes", "hypertension"],
  "allergies": "penicillin"
}
```

#### `POST /symptoms`
Record presenting symptoms.

```json
{
  "session_id": "uuid",
  "patient_id": "uuid",
  "symptoms": ["chest pain", "shortness of breath"],
  "duration": "2 hours",
  "severity": "severe"
}
```

#### `POST /vitals`
Record patient vitals.

```json
{
  "session_id": "uuid",
  "patient_id": "uuid",
  "heart_rate": 110,
  "spo2": 94.5,
  "blood_pressure": "140/90",
  "temperature": 37.8,
  "respiration_rate": 22,
  "glucose": 180.0
}
```

#### `POST /visual-scan`
Multipart upload — sends the image to the ML service for eye/visual analysis.

```
Form fields: session_id, patient_id
File field:  image (PNG/JPG)
```

#### `POST /reports`
Upload one or more medical reports for processing. Supports `blood` (OCR) and `xray` (classification).

```
Form fields: session_id, patient_id, types[] (e.g. ["blood", "xray"])
File field:  files[] (PNG/JPG)
```

#### `POST /analyse?session_id=uuid`
Runs the full triage engine on data already saved for the session — pulls symptoms and vitals from Supabase, builds the triage request, and returns an urgency classification.

---

### Triage Engine (Direct)

#### `POST /triage`

```json
{
  "symptoms": "Severe chest pain radiating to left arm, started 20 minutes ago.",
  "vitals": {
    "heart_rate": 118,
    "spo2": 94,
    "blood_pressure": { "systolic": 88, "diastolic": 60 },
    "temperature": 37.2
  },
  "report_text": "ECG: ST elevation in leads II, III, aVF.",
  "visual_notes": "Patient appears pale and diaphoretic."
}
```

Response:

```json
{
  "urgency_level": "emergency_referral",
  "reasoning": "...",
  "next_steps": "Call 911 immediately...",
  "red_flags": ["Chest pain radiating to left arm", "Hypotension: BP 88/60"],
  "disclaimer": "...",
  "latency_ms": 8521
}
```

**Urgency levels**

| Level | Meaning |
|---|---|
| `self_care` | Manageable at home |
| `doctor_consultation` | GP within 24–48 hours |
| `urgent_care` | Same-day urgent care or ED walk-in |
| `emergency_referral` | Call 911 / go to ED immediately |

#### `POST /chat`
Continue a conversation within an existing triage session using the `session_id` from `/triage`.

```json
{ "session_id": "uuid", "message": "The pain is getting worse." }
```

---

### Voice Triage

#### `POST /voice-triage`
Accepts a patient's spoken symptoms as audio, transcribes via an external STT service, then runs triage.

```
Form fields: session_id
File field:  audio (WAV/MP3/etc.)
```

Response includes both the transcript and the full triage result.

---

### System

#### `GET /health`

```json
{ "status": "ok", "rag_ready": true, "model": "nvidia/...", "version": "1.0.0" }
```

#### `POST /admin/rebuild-index`
Force-rebuilds the BM25 index from the knowledge base. Requires `X-Admin-Key` header.

---

## ML Service API

The ML service runs independently on port 8001.

#### `POST /ocr/process`
Upload a blood report image. Returns extracted text and parsed metrics (glucose, WBC, haemoglobin).

#### `POST /xray/classify`
Upload a chest X-ray. Returns pathology classification and confidence score (ViT model, 92% confidence on pneumonia).

#### `GET /`
Interactive web dashboard for drag-and-drop testing.

---

## Database (Supabase)

| Table | Purpose |
|---|---|
| `users` | Mobile number + OTP for auth |
| `consent` | Consent records keyed by session |
| `patients` | Demographics per session |
| `symptoms` | Symptom list, duration, severity |
| `vitals` | Physiological measurements |
| `reports` | Uploaded report metadata |
| `triage_sessions` | Full triage output + message history |

---

## Deployment (Railway)

The `railway.toml` configures the Triage API start command:

```toml
[deploy]
startCommand = "uvicorn api.main:app --host 0.0.0.0 --port 8000"
```

The ML service is deployed as a separate Railway service at `https://mlservice-production-4d52.up.railway.app`.

---

## Extending the Knowledge Base

Add entries to `knowledge_base/medical_guidelines.py`:

```python
{
    "id":       "unique_id",
    "title":    "Document Title",
    "category": "specialty_tag",
    "content":  "Full text of the clinical guideline...",
}
```

Then call `POST /admin/rebuild-index` or restart the server.

---

## Disclaimer

This software is provided for research and educational purposes. It has not been validated as a medical device and must not be used as the sole basis for clinical decisions. Always consult a licensed healthcare professional.
