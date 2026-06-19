# ARCHITECTURE.md — Medical Triage Admin Portal

> **Canonical engineering reference for the Clinical Operations Control Plane.**
> Covers every layer from the browser to the vector database, including data flows, security boundaries, and deployment topology.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend — Express Server](#4-backend--express-server)
5. [Cloud Functions](#5-cloud-functions)
6. [File Watcher Daemon](#6-file-watcher-daemon)
7. [Vector Search Pipeline](#7-vector-search-pipeline)
8. [Data Layer — Firestore Collections](#8-data-layer--firestore-collections)
9. [Security & RBAC](#9-security--rbac)
10. [Key End-to-End Data Flows](#10-key-end-to-end-data-flows)
11. [Testing Strategy](#11-testing-strategy)
12. [Deployment Architecture](#12-deployment-architecture)
13. [Technology Stack](#13-technology-stack)

---

## 1. System Overview

The **Medical Triage Admin Portal** is a zero-trust, high-fidelity clinical operations control plane. It provides administrative visibility and control over a distributed triage infrastructure spanning AI inference, edge kiosk terminals, and human-in-the-loop clinical workflows.

### Core Identity

| Property | Value |
|---|---|
| **Platform Type** | Frontend Control Plane (no clinical decision logic client-side) |
| **Auth Layer** | Firebase Authentication (sole identity source of truth) |
| **Data Layer** | Firestore (accessed exclusively through `src/lib/api.ts`) |
| **Runtime** | React 19 + Vite 6, served via Express |
| **Styling** | Tailwind CSS v4 |
| **Charts** | Recharts |
| **Vector Database** | Pinecone (1536d OpenAI embeddings, cosine metric) |
| **Embeddings** | OpenAI text-embedding-3-small |
| **CI/CD** | GitHub Actions → Firebase Hosting |

### Core Principles

- **Control Plane Separation**: The frontend acts exclusively as a control plane. No clinical decisions are executed client-side.
- **Strict API-Layer Access**: Components are FORBIDDEN from importing Firebase/Firestore directly — all data operations route through `src/lib/api.ts`.
- **Mandatory RBAC**: Every administrative or clinical action is gated by a Role-Based Access Control check.
- **Mutation Traceability**: All state mutations that alter a patient record or critical system state generate a `TraceEvent` log entry.
- **Immutable Audit Ledger**: The `auditLogs` collection is append-only — updates and deletions are permanently blocked by Firestore security rules.

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER (Browser)                          │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        React 19 + Vite 6 SPA                               │  │
│  │                                                                              │  │
│  │  ┌─────────────────────┐  ┌─────────────────┐  ┌────────────────────────┐   │  │
│  │  │ AdminPortalShell    │  │ Legacy Tabbed UI │  │ PremiumHeaderLayout   │   │  │
│  │  │ (admin/clinician)   │  │ (other roles)    │  │ (Role switcher, tour) │   │  │
│  │  └──────────┬──────────┘  └────────┬────────┘  └────────────────────────┘   │  │
│  │             │                       │                                        │  │
│  │             ▼                       ▼                                         │  │
│  │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                        View Components                                 │  │  │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐   │  │  │
│  │  │  │Dashboard │ │TriageQueue│ │CommandCnt│ │Patients │ │Reports    │   │  │  │
│  │  │  └──────────┘ └───────────┘ └──────────┘ └─────────┘ └───────────┘   │  │  │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐   │  │  │
│  │  │  │Kiosks    │ │UserMgmt   │ │Models    │ │Settings │ │AuditLogs  │   │  │  │
│  │  │  └──────────┘ └───────────┘ └──────────┘ └─────────┘ └───────────┘   │  │  │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────────┐    │  │  │
│  │  │  │OrgMgmt   │ │SysHealth  │ │Analytics │ │VectorSearch          │    │  │  │
│  │  │  └──────────┘ └───────────┘ └──────────┘ └──────────────────────┘    │  │  │
│  │  └────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                              │  │
│  │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Service Layer (lib/)                                │  │  │
│  │  │  ┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐   │  │  │
│  │  │  │ api.ts   │ │rbac.ts │ │pii.ts   │ │eventBus  │ │firebase.ts    │   │  │  │
│  │  │  │(CRUD)    │ │(perms) │ │(redact) │ │(pub/sub) │ │(init SDK)     │   │  │  │
│  │  │  └────┬─────┘ └────────┘ └─────────┘ └──────────┘ └───────┬───────┘   │  │  │
│  │  └────────────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                          │              ▲              │                           │
│                          │              │              │                           │
│               ┌──────────┘    Firebase  │  Firebase    └──────────┐                │
│               ▼               Auth       │  Subscriptions         ▼                │
│                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                      INTEGRATION & BACKEND LAYER                                    │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                       Firestore (NoSQL Database)                             │  │
│  │                                                                              │  │
│  │  users  patients  reports  kiosks  modelWeights  auditLogs  settings         │  │
│  │  notifications  organizations  regions  facilities  systemHealth             │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                     │                           ▲                                  │
│                     │                           │                                  │
│                     ▼                           │                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                  Express Server (Port 5001)                                │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐  │  │
│  │  │ Auth MW     │  │ Vector API   │  │ File Watcher   │  │ Health Probes │  │  │
│  │  │ (BearerKey) │  │ /api/vector/*│  │ (chokidar)     │  │ /health,/ready│  │  │
│  │  └─────────────┘  └──────┬───────┘  └────────────────┘  └───────────────┘  │  │
│  └──────────────────────────┼────────────────────────────────────────────────────┘  │
│                             │                                                        │
│                             ▼                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │               Firebase Cloud Functions (2nd Gen)                            │  │
│  │                                                                              │  │
│  │  ┌──────────────────┐  ┌────────────────┐  ┌────────────────────────────┐  │  │
│  │  │ computeAnalytics │  │ Vector Search  │  │ exportGoldenDataset       │  │  │
│  │  │ (scheduled/15min)│  │ (callable)     │  │ (callable)                 │  │  │
│  │  └──────────────────┘  └───────┬────────┘  └────────────────────────────┘  │  │
│  └──────────────────────────────────┼──────────────────────────────────────────────┘  │
│                                     │                                                  │
│                                     ▼                                                  │
│  │                       External AI Services                                   │  │
│  │  ┌────────────────────────────────────────┐  ┌────────────────┐               │  │
│  │  │  Unified Triage API                    │  │ OpenAI API     │               │  │
│  │  │  (medical-triage-production.up.railway │  │ (embeddings)   │               │  │
│  │  │   .app/api/v1)                         │  └────────────────┘               │  │
│  │  │                                        │  ┌────────────────┐               │  │
│  │  │  ┌──────────────────────┐              │  │ Pinecone       │               │  │
│  │  │  │ LLM + RAG Pipeline   │              │  │ Vector Database│               │  │
│  │  │  │ Triage / Chat        │              │  └────────────────┘               │  │
│  │  │  └──────────────────────┘              │  ┌──────────────────────────────┐ │  │
│  │  │  ┌──────────────────────┐              │  │ STT / TTS Services          │ │  │
│  │  │  │ OCR Reports          │              │  │ (separate, no unified API   │ │  │
│  │  │  │ Visual Scan / X-Ray  │              │  │  equivalent)                │ │  │
│  │  │  └──────────────────────┘              │  └──────────────────────────────┘ │  │
│  │  └────────────────────────────────────────┘                                   │  │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                   File Watcher Daemon                                        │  │
│  │                                                                              │  │
│  │  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐                   │  │
│  │  │ ingestion/     │→│ validator    │→│ archive/      │                   │  │
│  │  │ incoming/      │  │ (schema + PHI)│  │ (success)     │                   │  │
│  │  └────────────────┘  └──────┬───────┘  └────────────────┘                   │  │
│  │                             │                                               │  │
│  │                             ▼                                               │  │
│  │                     ┌────────────────┐                                      │  │
│  │                     │ error/         │                                      │  │
│  │                     │ (.error.log)   │                                      │  │
│  │                     └────────────────┘                                      │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Architecture

### 3.1 Component Hierarchy

```
App.tsx
├── AuthProvider (context/AuthContext.tsx)
│   └── AuthenticatedApp
│       ├── LoginPage (unauthenticated)
│       │
│       └── [Authenticated]
│           ├── AdminPortalShell (admin/clinician)
│           │   ├── Sidebar Navigation (TriageOS)
│           │   │   ├── Operations: Command Center, Live Triage Queue
│           │   │   ├── Edge & AI: Kiosk Fleet, LLM Pipelines, RAG, Mobile
│           │   │   ├── Intelligence: Vector Search
│           │   │   └── System: Notifications, User Roles, Audit Logs, Settings
│           │   ├── Top Header
│           │   │   ├── Global Search (placeholder)
│           │   │   ├── AI Status indicator
│           │   │   ├── Notification Bell → navigates to Notifications
│           │   │   ├── Settings Gear → navigates to Settings
│           │   │   └── User avatar
│           │   └── Main Content (activeNav-driven routing)
│           │
│           ├── Legacy Tabbed UI (other roles)
│           │   ├── Sidebar (role-filtered tabs)
│           │   └── PremiumHeaderLayout
│           │       ├── Role Switcher (with audit logging)
│           │       └── Interactive Tour
│           │
│           └── DebugChaosDrawer (dev only)
│               ├── Kiosk Outage Injection
│               ├── Triage Flood (1.5s interval)
│               └── SimulationPanel
│                   ├── High-Urgency Wave
│                   ├── Poison Pill Injection
│                   └── Token Corruption Toggle
```

### 3.2 Service Layer (`src/lib/`)

| File | Responsibility | Key Exports |
|---|---|---|
| `api.ts` | **Sole data access layer** — all Firestore CRUD, transactions, subscriptions | `api` object (patients, reports, kiosks, settings, etc.), `analyticsService` |
| `rbac.ts` | Permission matrix for all 8 roles | `can(role, action): boolean` |
| `pii.ts` | PII redaction boundary | `patientDisplayName(role, name)`, `stripPhiFromText()` |
| `eventBus.ts` | Cross-module pub/sub system | `eventBus.subscribe()`, `eventBus.emit()` |
| `firebase.ts` | Firebase SDK singleton | `db`, `auth` |

### 3.3 Routing

Two routing systems coexist:

1. **AdminPortalShell** (admin/clinician): Uses `NavItem` type with `onNavChange` callback. Navigation is driven by sidebar buttons and header icons.
2. **Legacy Tabbed UI** (all other roles): Uses `roleTabs` mapping with `activeTab` state. Each role sees a filtered subset of tabs.

### 3.4 UI Component Libraries

| Library | Usage |
|---|---|
| **Recharts** | Area charts (Dashboard), Bar charts (Reports) |
| **Lucide React** | Icon set across all views |
| **Motion** | Animations and transitions |
| **Tailwind CSS v4** | All styling |

---

## 4. Backend — Express Server

### 4.1 Overview

A standalone Express HTTP server that runs alongside the Vite dev server. It handles:

- **Consolidated external API proxy** — routes LLM/RAG triage, OCR, visual analysis, and X-ray through a single [Unified Triage API](#45-unified-triage-api-client)
- Vector search API operations (proxied from the browser)
- File ingestion daemon
- Health/readiness probes
- API authentication via shared secret

### 4.2 Server Structure

```
server/
├── index.ts                     # Entry point, middleware, route mounting
├── controllers/
│   └── vectorController.ts      # Vector search orchestration
├── routes/
│   ├── vectorRoutes.ts          # /api/vector/* endpoints
│   ├── llmRoutes.ts             # /api/llm/* → Unified Triage API
│   ├── ocrRoutes.ts             # /api/ocr/* → Unified Triage API
│   ├── visualRoutes.ts          # /api/visual/* → Unified Triage API
│   ├── xrayRoutes.ts            # /api/xray/* → Unified Triage API
│   ├── sttRoutes.ts             # /api/stt/* → separate STT service
│   ├── ttsRoutes.ts             # /api/tts/* → OpenAI directly
│   └── externalServicesRoutes.ts # Health check aggregator
├── middleware/
│   └── auth.ts                  # Bearer token validation
├── services/
│   ├── triageApiClient.ts       # ★ Shared client for Unified Triage API
│   ├── llmClient.ts             # LLM + RAG via triageApiClient
│   ├── ocrClient.ts             # Report upload via triageApiClient
│   ├── visualClient.ts          # Visual scan via triageApiClient
│   ├── xrayClient.ts            # X-ray via triageApiClient (same endpoint)
│   ├── sttClient.ts             # STT — separate service (no unified equivalent)
│   ├── ttsClient.ts             # TTS — OpenAI directly (no unified equivalent)
│   ├── openaiClient.ts          # OpenAI embeddings (no unified equivalent)
│   ├── pineconeClient.ts        # Pinecone SDK client
│   ├── healthMonitor.ts         # Unified external service health checker
│   ├── fileWatcher.ts           # File ingestion daemon
│   ├── ingestionValidator.ts    # Schema validation for ingested files
│   └── firebaseAdmin.ts         # Firebase Admin SDK singleton
└── safety/
    └── triageRules.ts           # Clinical rules engine (fallback)
```

### 4.3 API Endpoints (Express Server)

| Method | Path | Proxies To | Description | Auth Required |
|---|---|---|---|---|
| `GET` | `/health` | — | Liveness probe | No |
| `GET` | `/ready` | — | Readiness probe (checks OpenAI + Pinecone) | No |
| `POST` | `/api/vector/search` | Pinecone | Semantic vector search | If `ADMIN_API_KEY` set |
| `POST` | `/api/vector/similar` | Pinecone | Find similar cases | If `ADMIN_API_KEY` set |
| `POST` | `/api/vector/index-all` | Pinecone | Batch index all cases | If `ADMIN_API_KEY` set |
| `POST` | `/api/vector/index` | Pinecone | Index a single case | If `ADMIN_API_KEY` set |
| `DELETE` | `/api/vector/` | Pinecone | Delete vectors by IDs | If `ADMIN_API_KEY` set |
| `GET` | `/api/vector/stats` | Pinecone | Vector count stats | If `ADMIN_API_KEY` set |
| `GET` | `/api/llm/health` | Unified Triage `GET /health` | LLM health status | If `ADMIN_API_KEY` set |
| `POST` | `/api/llm/triage` | Unified Triage `POST /triage` | Triage analysis | If `ADMIN_API_KEY` set |
| `POST` | `/api/llm/chat` | Unified Triage `POST /chat` | Follow-up chat | If `ADMIN_API_KEY` set |
| `POST` | `/api/llm/rebuild-index` | Unified Triage `POST /admin/rebuild-index` | Rebuild BM25 index | If `ADMIN_API_KEY` set |
| `POST` | `/api/ocr/process` | Unified Triage `POST /reports` | OCR blood report upload | If `ADMIN_API_KEY` set |
| `POST` | `/api/visual/analyze` | Unified Triage `POST /visual-scan` | Visual symptom analysis | If `ADMIN_API_KEY` set |
| `POST` | `/api/xray/classify` | Unified Triage `POST /visual-scan` | X-ray classification | If `ADMIN_API_KEY` set |
| `POST` | `/api/stt/transcribe` | STT Service (separate) | Audio transcription | If `ADMIN_API_KEY` set |
| `POST` | `/api/tts/synthesize` | OpenAI (separate) | Text-to-speech | If `ADMIN_API_KEY` set |
| `GET` | `/api/external-services/health` | All services | Consolidated health check | If `ADMIN_API_KEY` set |

> **Note on consolidation:** The Express server maintains the same `/api/llm/*`, `/api/ocr/*`, `/api/visual/*`, `/api/xray/*` route paths for backward compatibility with the frontend. Only the underlying service implementations have been updated to route through the single Unified Triage API (`https://medical-triage-production.up.railway.app/api/v1`).

### 4.4 Auth Middleware

When `ADMIN_API_KEY` is set in `.env`, all vector, LLM, OCR, STT, TTS, visual, and X-ray routes require `Authorization: Bearer <key>`. If not set, authentication is skipped (local dev mode).

| Scenario | Response |
|---|---|
| No `ADMIN_API_KEY` set | Allow all (dev mode) |
| Missing/malformed header | `401 UNAUTHORIZED` |
| Invalid key | `403 FORBIDDEN` |
| Valid key | `200` with `authenticated: true` |

---

### 4.5 Unified Triage API Client

The `server/services/triageApiClient.ts` module is a **shared HTTP client** that provides typed access to the consolidated backend at `https://medical-triage-production.up.railway.app/api/v1`. It replaces the previous practice of maintaining separate service-specific base URLs.

#### Architecture

```
Frontend (src/lib/api.ts)
       │
       ▼  (same Express routes — no frontend changes)
Express Routes (server/routes/*.ts)
       │
       ▼
Service Clients (server/services/*.ts)
       │
       ├── triageApiClient.ts ──→ Unified Triage API (/api/v1/*)
       │       ├── /triage           ← LLM triage analysis
       │       ├── /chat             ← Follow-up chat
       │       ├── /health           ← Health check
       │       ├── /reports          ← OCR report upload
       │       ├── /visual-scan      ← Visual / X-ray analysis
       │       ├── /analyse          ← Final session analysis
       │       └── /admin/rebuild-index
       │
       ├── sttClient.ts ──→ Separate STT service (no unified equiv.)
       ├── ttsClient.ts ──→ OpenAI TTS (no unified equiv.)
       ├── openaiClient.ts ──→ OpenAI embeddings (no unified equiv.)
       └── pineconeClient.ts ──→ Pinecone (no unified equiv.)
```

#### Services Consolidated into the Unified API

| Previous Service | Previous Endpoint | Unified API Endpoint | Field Mapping |
|---|---|---|---|
| **LLM + RAG** | `medical-triage-production.up.railway.app/triage` | `POST /api/v1/triage` | `patient_case` → `report_text`, `chief_complaint` → `visual_notes`, `vitals.hr` → `vitals.heart_rate` |
| **OCR** | `mlservice-production-4d52.up.railway.app/ocr/process` | `POST /api/v1/reports` | Single file upload → multipart with `session_id`, `patient_id`, `files`, `types` |
| **Visual Analysis** | `mlservice-production-4d52.up.railway.app/visual/analyze` | `POST /api/v1/visual-scan` | Image upload → multipart with `session_id`, `patient_id`, `image` |
| **X-Ray** | `mlservice-production-4d52.up.railway.app/xray/classify` | `POST /api/v1/visual-scan` | Same endpoint as visual (backend differentiates by context) |

#### Services Kept Separate

| Service | Reason |
|---|---|
| **STT (Speech-to-Text)** | No `/transcribe` endpoint exists in the unified API |
| **TTS (Text-to-Speech)** | No `/speech` endpoint exists; uses OpenAI directly |
| **OpenAI Embeddings** | No embedding endpoint; used for vector search index |
| **Pinecone** | Vector database is separate infrastructure from the triage pipeline |

#### Configuration

Set a single environment variable to configure all consolidated services:

```bash
TRIAGE_API_BASE_URL="https://medical-triage-production.up.railway.app/api/v1"
```

For backward compatibility, if `LLM_API_BASE_URL` is set (without the `/api/v1` suffix), `triageApiClient` automatically appends `/api/v1`.

---

## 5. Cloud Functions

### 5.1 Function Inventory

| Function | Trigger | Purpose | Secrets |
|---|---|---|---|
| `computeAnalyticsSnapshot` | Scheduled (every 15 min) | Aggregates triage metrics → writes to `analytics/latest` | — |
| `exportGoldenDataset` | Callable (HTTPS) | Exports verified reports as JSONL for ML training | — |
| `searchTriageCases` | Callable (HTTPS) | Semantic search via Pinecone + OpenAI | `PINECONE_API_KEY`, `OPENAI_API_KEY` |
| `getSimilarCases` | Callable (HTTPS) | Finds cases similar to a given case | `PINECONE_API_KEY`, `OPENAI_API_KEY` |
| `indexAllTriageCases` | Callable (HTTPS) | Batch (re-)indexes all patients + reports | `PINECONE_API_KEY`, `OPENAI_API_KEY` |
| `indexPatientOnWrite` | Firestore `onDocumentWritten` | Auto-indexes patient documents on create/delete | `PINECONE_API_KEY`, `OPENAI_API_KEY` |

### 5.2 Analytics Pipeline

The `computeAnalyticsSnapshot` function runs every 15 minutes and:

1. Queries all 4 source collections in parallel: `patients`, `reports`, `modelWeights`, `kiosks`
2. Computes: urgency breakdown, AI accuracy metrics, disagreement category breakdown, model consensus rate, kiosk uptime rate
3. Writes the result to `analytics/latest` (single document, overwritten each cycle)
4. The frontend reads this document via `api.analytics.getSnapshot(periodId)` with a fallback to live client-side aggregation

### 5.3 Golden Dataset Export

The `exportGoldenDataset` callable function:

1. Authenticates the caller via Firebase Auth
2. Authorizes via Firestore `users/{uid}.role` (admin/clinician only)
3. Reads verified reports from Firestore
4. Strips PHI using the same `stripPhiFromText()` utility
5. Returns JSONL-formatted data for ML training pipelines

### 5.4 Vector Search Functions

See [Vector Search Pipeline](#7-vector-search-pipeline) for details.

---

## 6. File Watcher Daemon

### 6.1 Overview

A Node.js file watcher daemon that monitors `./ingestion/incoming/` for new JSON/CSV files, validates them against the clinical schema, and moves processed files to `./ingestion/archive/` or `./ingestion/error/`.

### 6.2 Directory Layout

```
ingestion/
├── incoming/     # Drop zone — watch for new files
├── archive/      # Successfully processed files
└── error/        # Files that failed validation (with .error.log sidecar)
```

### 6.3 Processing Pipeline

```
File dropped in incoming/
         │
         ▼
┌─────────────────────┐
│  Detect file type   │
│  (JSON vs CSV)      │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Parse content      │
└─────────┬───────────┘
          │
          ▼
┌──────────────────────────────┐
│  Validate schema             │
│  ─ Required fields           │
│  ─ Field types               │
│  ─ Enum values               │
│  ─ PHI strip                 │
└─────────┬────────────────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
  Valid       Invalid
    │           │
    ▼           ▼
┌────────┐ ┌───────────────────┐
│Archive │ │ Move to error/    │
│→ Move  │ │ Write .error.log  │
│to /    │ │ with timestamp,   │
│archive/│ │ filename, reason  │
└────────┘ └───────────────────┘
```

### 6.4 Supported Schemas

| Record Type | Required Fields | Validated |
|---|---|---|
| `patient` | `patientName`, `triageCategory` | Enum: Self-care, Doctor, Urgent, Emergency |
| `report` | `patientId`, `category`, `subType` | Category: radiology, lab, ocr, stt, symptom |

---

## 7. Vector Search Pipeline

### 7.1 Architecture

```
              ┌──────────────┐
              │  User Query  │
              │  (natural    │
              │   language)  │
              └──────┬───────┘
                     │
                     ▼
         ┌─────────────────────┐
         │  Express Server     │
         │  POST /api/vector/  │
         │  search             │
         └──────────┬──────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  OpenAI Embeddings │
         │  (text-embedding-  │
         │   3-small, 1536d)  │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Pinecone Index    │
         │  (cosine metric)   │
         │  → top K matches   │
         └──────────┬─────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  Response:         │
         │  { matches: [{     │
         │    id, score,      │
         │    metadata }] }   │
         └────────────────────┘
```

### 7.2 Indexed Data Sources

| Source | Prefix | Metadata |
|---|---|---|
| **Patients** | `{patientId}` | patientName, triageCategory, status, confidence, timestamp, sourceType: "patient" |
| **Reports** | `report_{reportId}` | patientName, category, status, confidence, reportCategory, subType, verified, clinicianOverride, sourceType: "report" |

### 7.3 Embedding Strategy

- **Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Search Text Construction**: `buildCaseSearchText()` concatenates patient name, triage category, status, AI analysis, clinical text, review notes, and reason into a single searchable string
- **Batch Processing**: `generateEmbeddings()` processes texts in batches of 20 to stay within API limits

---

## 8. Data Layer — Firestore Collections

### 8.1 Collection Map

```
firestore/
├── users/{uid}
│   ├── name: string
│   ├── email: string
│   ├── role: Role
│   └── status: 'active' | 'inactive' | 'suspended'
│
├── patients/{patientId}
│   ├── patientName: string
│   ├── triageCategory: 'Self-care' | 'Doctor' | 'Urgent' | 'Emergency'
│   ├── confidence: number (0.0–1.0)
│   ├── timestamp: string (ISO-8601)
│   ├── status: CaseStatus
│   ├── traceEvents: TraceEvent[]
│   └── subcollection: traceEvents/{eventId}
│
├── reports/{reportId}
│   ├── patientId: string
│   ├── patientName: string
│   ├── category: ReportCategory
│   ├── subType: string
│   ├── status: 'pending' | 'verified' | 'flagged'
│   ├── confidence: number
│   ├── content: { rawText?, structuredData?, aiAnalysis? }
│   ├── verifiedBy?: string
│   ├── verifiedAt?: string
│   ├── clinicianTriageOverride?: string | null
│   ├── reviewNote?: string
│   ├── clinicianAgreement?: boolean
│   ├── disagreementCategory?: DisagreementCategory | null
│   └── createdAt: string
│
├── kiosks/{kioskId}
│   ├── hardwareId: string
│   ├── name: string
│   ├── facilityId: string
│   ├── status: 'online' | 'degraded' | 'offline'
│   ├── ipAddress: string
│   ├── softwareVersion: string
│   ├── currentQueue: number
│   ├── thermalStatus: 'cool' | 'nominal' | 'hot'
│   └── ...
│
├── modelWeights/{modelId}
│   ├── tag: string
│   ├── type: 'triage' | 'classifier' | 'fallback'
│   ├── contextWindow: string
│   ├── avgInferenceTime: number
│   ├── accuracyRate: number
│   ├── status: 'active' | 'shadow' | 'deprecated'
│   └── tokenCostPerM: number
│
├── auditLogs/{logId}           ← IMMUTABLE (append-only)
│   ├── timestamp: string
│   ├── actor: string (UID)
│   ├── role: string
│   ├── action: string
│   ├── targetResource: string
│   ├── severity: 'info' | 'warning' | 'critical'
│   ├── txHash: string
│   └── createdAt: string
│
├── settings/global
│   ├── clinicalThresholds: { spo2, heartRate, bloodPressure, temperature, glucose }
│   ├── escalationRules: { selfCare, doctorConsultation, urgentCare, emergency }
│   ├── aiConfig: { confidenceThreshold, humanReviewThreshold, autoEscalation, retrainThresholds }
│   ├── notificationSettings: { emailAlerts, smsAlerts, criticalOnly }
│   └── auditSettings: { retentionDays, exportPolicy }
│
├── notifications/{notificationId}
├── organizations/{orgId}
├── regions/{regionId}
├── facilities/{facilityId}
├── systemHealth/{healthId}
└── analytics/latest            ← Pre-computed snapshot (overwritten every 15 min)
```

### 8.2 Key Design Decisions

| Decision | Rationale |
|---|---|
| **TraceEvents as subcollection** | Keeps patient-scoped audit data co-located for transaction atomicity |
| **Analytics as single document** | Avoids expensive client-side aggregation; updated by Cloud Function every 15 min |
| **Settings as single document** | Global configuration — no need for per-document granularity |
| **Audit logs append-only** | Compliance requirement — enforced by both code (`setDoc` not `updateDoc`) and Firestore rules |
| **No custom claims for roles** | Roles stored in Firestore `users/{uid}` for auditable role management |

---

## 9. Security & RBAC

### 9.1 The 8-Role RBAC Matrix

| Action | patient | caregiver | clinician | kiosk_op | device_prov | insurance | public_health | admin |
|---|---|---|---|---|---|---|---|---|
| `VIEW_STATUS` | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `START_TRIAGE` | — | — | ✓ | — | — | — | — | — |
| `VIEW_CASE` | — | — | ✓ | — | — | — | — | — |
| `ASSIGN_DOCTOR` | — | — | ✓ | — | — | — | — | — |
| `UPDATE_STATUS` | — | — | ✓ | — | — | — | — | — |
| `RESOLVE_CASE` | — | — | ✓ | — | — | — | — | — |
| `VIEW_PATIENTS` | — | — | ✓ | — | — | — | — | — |
| `VIEW_REPORTS` | — | — | ✓ | — | — | ✓ | — | ✓ |
| `VERIFY_REPORT` | — | — | ✓ | — | — | — | — | — |
| `VIEW_MODELS` | — | — | ✓ | — | — | — | — | ✓ |
| `ACTIVATE_MODEL` | — | — | ✓ | — | — | — | — | — |
| `ROLLBACK_MODEL` | — | — | ✓ | — | — | — | — | — |
| `VIEW_LOGS` | — | — | ✓ | — | ✓ | — | — | ✓ |
| `EXPORT_LOGS` | — | — | — | — | — | — | — | ✓ |
| `RESTART_DEVICE` | — | — | — | ✓ | ✓ | — | — | ✓ |
| `CONFIGURE_DEVICE` | — | — | — | ✓ | ✓ | — | — | ✓ |
| `VIEW_SYSTEM_HEALTH` | — | — | — | — | ✓ | — | — | ✓ |
| `MANAGE_USERS` | — | — | — | — | — | — | — | ✓ |
| `MANAGE_SETTINGS` | — | — | — | — | — | — | — | ✓ |
| `MANAGE_ORGANIZATION` | — | — | — | — | — | — | — | ✓ |
| `ACKNOWLEDGE_NOTIFICATION` | — | — | ✓ | ✓ | ✓ | — | — | ✓ |
| `VIEW_ANALYTICS` | — | — | ✓ | — | — | ✓ | ✓ | ✓ |

### 9.2 Role Access Tiers

| Tier | Roles | Scope |
|---|---|---|
| **Clinical** | `clinician` | Full patient data, triage workflow, report verification |
| **Operations** | `kiosk_operator`, `device_provider` | Device/infrastructure only — zero patient data |
| **Analytics** | `insurance_partner`, `public_health` | Aggregate/redacted analytics only |
| **Administration** | `admin` | User management, settings, audit, system health — explicitly NO patient data |
| **Consumer** | `patient`, `caregiver` | MVP: No portal access (empty permission arrays) |

### 9.3 PII Redaction Boundary

Only `clinician` role sees real patient names. All other roles, including `admin`, see a redacted placeholder:

```typescript
export function patientDisplayName(role: Role, name: string): string {
  return CLINICAL_ROLES.includes(role)  // ['clinician']
    ? name
    : '[REDACTED — CLINICAL PRIVILEGE REQUIRED]';
}
```

This is enforced at the component level via the `patientDisplayName()` function from `src/lib/pii.ts`. No non-clinical component should circumvent this function.

### 9.4 Firestore Security Rules

Key rules enforced in `firestore.rules`:

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| `organizations` | All Auth | Admin | Admin | Admin |
| `regions` | All Auth | Admin | Admin | Admin |
| `kiosks` | All Auth | Admin | Auth (metrics) | Admin |
| `modelWeights` | All Auth | Admin | Admin | Admin |
| **`auditLogs`** | **All Auth** | **Auth (+ txHash)** | **❌ Blocked** | **❌ Blocked** |
| `patients` | Clinician+ | Clinician | Clinician | Admin |
| `reports` | Clinician+ | System | System | Admin |
| `settings` | Admin | Admin | Admin | Admin |

---

## 10. Key End-to-End Data Flows

### 10.1 Patient Triage Flow

```
1. Kiosk creates patient record in Firestore
         │
         ▼
2. Cloud Function (indexPatientOnWrite):
   ├─ Reads patient doc
   ├─ Generates embedding via OpenAI
   └─ Upserts vector to Pinecone
         │
         ▼
3. Frontend polls (5s interval):
   ├─ api.patients.getAll() → Firestore
   ├─ TriageQueue shows new patient
   └─ Dashboard metrics update
         │
         ▼
4. Clinician action (e.g., "Start Triage"):
   ├─ RBAC check: can(userRole, 'START_TRIAGE')
   ├─ api.patients.updateStatus() → runTransaction:
   │   ├─ update patient.status
   │   └─ set TraceEvent in subcollection
   ├─ eventBus.emit('CASE_STATUS_CHANGED')
   └─ UI updates optimistically
```

### 10.2 Report Verification Flow

```
1. Diagnostic report arrives in Firestore
         │
         ▼
2. Frontend subscription picks up new report:
   api.reports.subscribeToReports()
         │
         ▼
3. ReportManagementView displays in queue
         │
         ▼
4. Clinician clicks "Verify & Approve":
   ├─ RBAC check: can(userRole, 'VERIFY_REPORT')
   ├─ api.reports.verify() → runTransaction:
   │   ├─ update report.status = 'verified'
   │   ├─ set verifiedBy, verifiedAt, agreement
   │   └─ set audit entry (REPORT_VERIFIED)
   └─ UI updates via subscription
         │
         ▼
5. DriftMonitor picks up the verification:
   ├─ Recalculates AI accuracy rate
   ├─ Evaluates retrain thresholds
   └─ Triggers warning if drift detected
```

### 10.3 Vector Search Flow

```
1. User types natural language query
         │
         ▼
2. Vite dev server proxies POST /api/vector/search
   → Express server (port 5001)
         │
         ▼
3. Auth middleware validates Bearer token
         │
         ▼
4. Express server:
   ├─ Calls OpenAI embedding API (text-embedding-3-small)
   └─ Queries Pinecone index (cosine similarity, top K)
         │
         ▼
5. Results returned to frontend:
   └─ VectorSearchView displays matches with score, metadata
```

### 10.4 File Ingestion Flow

```
1. Operator drops file in ./ingestion/incoming/
         │
         ▼
2. File watcher (chokidar) detects new file
         │
         ▼
3. Ingestion validator:
   ├─ Parses JSON or CSV
   ├─ Auto-detects record type (patient/report)
   ├─ Validates required fields and enums
   ├─ Strips PHI from text fields
   └─ Returns valid/invalid with errors
         │
    ┌────┴────┐
    ▼         ▼
  Valid     Invalid
    │         │
    ▼         ▼
  Archive   Error directory
  file     + .error.log sidecar
```

### 10.5 Analytics Aggregation Flow

```
1. Cloud Function: computeAnalyticsSnapshot (every 15 min)
         │
         ▼
2. Queries 4 collections in parallel:
   ├─ patients → urgency breakdown, volume
   ├─ reports → AI accuracy, disagreement categories
   ├─ modelWeights → consensus rate
   └─ kiosks → uptime rate
         │
         ▼
3. Writes to analytics/latest (single doc, overwrite)
         │
         ▼
4. Frontend reads analytics/latest via:
   api.analytics.getSnapshot(periodId)
   └─ Falls back to live client-side aggregation if
      Cloud Function hasn't run yet
```

### 10.6 Chaos Testing Flow

```
1. DebugChaosDrawer (dev-only button)
   └── "⚠️ Open Chaos Panel"
         │
         ├── "💥 Drop Random Kiosk Offline"
         │   ├─ api.kiosks.updateKioskStatus() → offline
         │   ├─ Audit entry written
         │   └─ Auto-recovery scheduled (8s)
         │
         ├── "🌊 Ingest High-Velocity Influx"
         │   ├─ setInterval (1.5s) → api.patients.create()
         │   ├─ 5 rapid patient ingestions
         │   └─ Tests transaction lock isolation
         │
         └── SimulationPanel
             ├── "⚡ Trigger High-Urgency Wave"
             │   ├─ generateHighUrgencyWave(4)
             │   └─ POST /api/vector/index-all
             │
             ├── "☣️ Inject Malformed Document"
             │   ├─ generateMalformedPayload()
             │   └─ POST /api/vector/index-all → 400 error
             │
             └── Token corruption toggle
                 ├─ Swaps adminToken to invalid JWT
                 └─ Tests 401 handling on next request
```

---

## 11. Testing Strategy

### 11.1 Test Pyramid

```
          ╱─────╲
         ╱  E2E  ╲          ← Playwright (27 tests)
        ╱─────────╲
       ╱ Integration╲        ← Vitest (60 tests)
      ╱───────────────╲
     ╱   Unit Tests    ╲     ← Vitest (288 tests)
    ╱─────────────────────╲
   ╱  TypeScript Check     ╲  ← tsc --noEmit
  ╱───────────────────────────╲
```

### 11.2 Test Inventory

| Layer | Tool | Count | Location |
|---|---|---|---|
| **Unit — Components** | Vitest + Testing Library | 178 | `src/components/__tests__/` |
| **Unit — Lib** | Vitest | 60 | `src/lib/__tests__/` |
| **Unit — Views** | Vitest | 50 | `src/views/__tests__/` |
| **Integration — REST API** | Vitest + supertest | 20 | `tests/integration/rest-api.test.ts` |
| **Integration — Firestore CRUD** | Vitest (mocked) | 22 | `tests/integration/firestore-crud.test.ts` |
| **Integration — File Ingestion** | Vitest (mocked) | 18 | `tests/integration/file-ingestion.test.ts` |
| **E2E — Playwright** | Playwright | 27 | `e2e/*.spec.ts` |
| **Chaos Stress** | Node script | 5 phases | `scripts/chaos-stress-test.mjs` |

### 11.3 Test Scripts

```bash
npm test                    # Run all unit + integration tests
npm run test:integration    # Integration tests only
npm run test:e2e            # Playwright E2E tests
npm run test:e2e:integration # New integration flow E2E tests
npm run lint                # TypeScript type check
```

---

## 12. Deployment Architecture

### 12.1 Production Topology

```
                          ┌─────────────────────┐
                          │   GitHub Actions     │
                          │   (CI/CD pipeline)   │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  Vite Build → dist/ │
                          └──────────┬──────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  │                  │                   │
                  ▼                  ▼                   ▼
         ┌────────────────┐ ┌──────────────┐ ┌─────────────────────┐
         │ Firebase        │ │ Express      │ │ Firebase Cloud     │
         │ Hosting (SPA)   │ │ Server       │ │ Functions (2nd gen)│
         │ [CDN]          │ │ [Proxmox VM] │ │ [Google Cloud Run] │
         └────────────────┘ └──────┬───────┘ └─────────────────────┘
                                   │
                                   ▼
                          ┌────────────────┐
                          │   Pinecone     │
                          │   Index        │
                          └────────────────┘
```

### 12.2 Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | No | Firebase analytics |
| `VITE_ADMIN_API_KEY` | No* | Express server auth key |
| `VITE_API_BASE_URL` | No | Express server URL (default: `http://localhost:5001`) |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (for embeddings + TTS) |
| `PINECONE_API_KEY` | Yes* | Pinecone API key |
| `PINECONE_INDEX` | No | Pinecone index name |
| `TRIAGE_API_BASE_URL` | No | Unified Triage API base URL (default: `https://medical-triage-production.up.railway.app/api/v1`) |
| `STT_API_BASE_URL` | No | STT service URL (default: `https://stt-tts-service-production.up.railway.app`) |
| `LLM_ADMIN_KEY` | No | Admin key for unified API operations (default: `medtriage2026`) |
| `PORT` | No | Express server port (default: 5001) |

*Required for vector search functionality.

> **Deprecated env vars:** `LLM_API_BASE_URL`, `OCR_API_BASE_URL`, `VISUAL_API_BASE_URL`, `XRAY_API_BASE_URL` are no longer read by the service layer. Configure `TRIAGE_API_BASE_URL` instead to control the consolidated unified API endpoint.

### 12.3 Deployment Commands

```bash
# Frontend
npm run build                          # Vite build → dist/
npm run build:production               # Production build
firebase deploy --only hosting         # Deploy to Firebase Hosting

# Backend
npm run server                         # Express server (tsx)
pm2 start server/index.ts --name portal # PM2 on Proxmox

# Cloud Functions
firebase deploy --only functions       # Deploy Cloud Functions

# Firestore Rules
firebase deploy --only firestore:rules # Deploy security rules
```

---

## 13. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | React | 19.0.1 | UI framework |
| **Build** | Vite | 6.2.3 | Dev server + bundler |
| **Language** | TypeScript | 5.8.2 | Type safety |
| **Styling** | Tailwind CSS | 4.1.14 | Utility-first CSS |
| **Charts** | Recharts | 3.8.1 | Data visualization |
| **Icons** | Lucide React | 0.546.0 | UI icons |
| **Animation** | Motion | 12.23.24 | Animations |
| **Backend** | Express | 5.2.1 | HTTP server |
| **Database** | Firestore | 12.14.0 | NoSQL + real-time |
| **Auth** | Firebase Auth | 12.14.0 | Authentication |
| **Vector DB** | Pinecone | 7.2.0 | Semantic search index |
| **Embeddings** | OpenAI API | — | Text embeddings |
| **Cloud Runtime** | Firebase Functions | 2nd gen | Serverless backend |
| **E2E Testing** | Playwright | 1.60.0 | Browser automation |
| **Unit Testing** | Vitest | 4.1.8 | Test runner |
| **Testing Library** | @testing-library/react | 16.3.2 | Component testing |
| **File Watch** | chokidar | 5.0.0 | File ingestion daemon |
| **Lint** | tsc | 5.8.2 | Type checking |

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **Control Plane** | A UI-only layer that orchestrates and visualizes backend operations without executing business logic |
| **RBAC** | Role-Based Access Control — permission system with 8 roles |
| **PII** | Protected Health Information — patient-identifiable data |
| **PHI** | Protected Health Information (HIPAA terminology) |
| **TraceEvent** | An auditable log entry for patient-level state mutations |
| **Drift Monitor** | Component that tracks AI accuracy degradation over time |
| **Chaos Monkey** | Stress testing methodology that intentionally injects failures |
| **Shadow Model** | A model deployed in parallel with the active model for A/B testing |
| **RunTransaction** | Atomic Firestore operation that couples data writes with audit entries |
| **txHash** | Pseudo-transaction hash used for chain-of-custody in audit logs |
| **Golden Dataset** | Curated set of verified reports used for ML training |
