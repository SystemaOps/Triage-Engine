<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Medical Triage Admin Portal

> Clinical Operations Control Plane — secure, role-based, real-time AI-assisted triage management system.

## 📚 Documentation

| Document | Description |
|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 🏗 Complete system architecture, data flows, and deployment topology |
| **[AGENTS.md](AGENTS.md)** | 📋 Binding architectural and operational rules for all development |
| **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** | 🔧 Setup guide, coding standards, and access protocols |
| **[TECHNICAL_README.md](TECHNICAL_README.md)** | 📐 4-layer system model and technical overview |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | 🚀 Production hardening, security checklist, and Firebase deploy |
| **[docs/LLM_TRIAGE_API_CONTRACT.md](docs/LLM_TRIAGE_API_CONTRACT.md)** | 📄 Binding API contract between portal and AI inference layer |

## Quick Start

```bash
# Install dependencies
npm install

# Start the Vite dev server (port 3000)
npm run dev

# In a separate terminal, start the Express server (port 5001)
npm run server
```

### Prerequisites
- Node.js 20+
- Firebase project with Firestore and Auth enabled
- `VITE_FIREBASE_*` env vars configured (copy `.env.example` to `.env.local`)

## Test Suite

```bash
npm test                    # 288 unit + 60 integration tests
npm run test:e2e            # 27 Playwright E2E tests
npm run test:integration    # Integration tests only
npm run lint                # TypeScript type check
```

## Key Architecture at a Glance

```
React 19 + Vite 6  ──►  Express Server (vector API, file watcher)
       │
       ▼
Firestore  ──►  Cloud Functions (analytics, vector search)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│             Unified Triage API                               │
│  (https://medical-triage-production.up.railway.app/api/v1)   │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ LLM/RAG  │  │ OCR      │  │ Visual   │                    │
│  │ Triage   │  │ Reports  │  │ Scan     │                    │
│  └──────────┘  └──────────┘  └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
       │
       ├── OpenAI Embeddings + Pinecone (semantic search)
       └── STT/TTS Services (separate — no unified equivalent)
```

> **Integration consolidation:** LLM triage, OCR report processing, visual analysis, and X-ray classification now all route through a **single Unified Triage API** (`https://medical-triage-production.up.railway.app/api/v1`). STT and TTS remain on separate services as they have no equivalent in the unified API. See [ARCHITECTURE.md §4.5](ARCHITECTURE.md#45-unified-triage-api-client) for details.

View the full architecture in **[ARCHITECTURE.md](ARCHITECTURE.md)** with detailed diagrams, data flows, RBAC matrix, and deployment topology.
