# ARCHITECTURE.md — Medical Triage Admin Portal

> **Canonical engineering truth for the Clinical Operations Control Plane.**
> This document supersedes all informal design notes. Every developer, auditor, and operator MUST read and adhere to the rules herein.

---

## 1. System Overview

The Medical Triage Admin Portal is a **zero-trust, high-fidelity clinical operations control plane**. It provides administrative visibility and control over a distributed triage infrastructure spanning AI inference, edge kiosk terminals, and human-in-the-loop clinical workflows.

### Core Identity

| Property | Value |
|---|---|
| **Platform Type** | Frontend Control Plane (no clinical decision logic client-side) |
| **Auth Layer** | Firebase Authentication (sole identity source of truth) |
| **Data Layer** | Firestore (accessed exclusively through `src/lib/api.ts`) |
| **Runtime** | React 19 + Vite 6, served via Express |
| **Styling** | Tailwind CSS v4 |
| **Charts** | Recharts |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React 19)                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ Auth     │  │ Components   │  │ lib/           │ │
│  │ Context  │  │ (Views)      │  │ api.ts         │ │
│  │          │  │              │  │ rbac.ts        │ │
│  │          │  │              │  │ pii.ts         │ │
│  │          │  │              │  │ eventBus.ts    │ │
│  └────┬─────┘  └──────┬───────┘  └───────┬────────┘ │
│       │               │                  │          │
│       └───────────────┼──────────────────┘          │
│                       │  Firebase SDK                │
│                       ▼                              │
│            ┌──────────────────┐                      │
│            │  Firebase Auth   │                      │
│            │  + Firestore     │                      │
│            └──────────────────┘                      │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              Backend / Cloud Functions                │
│   (AI Inference, RAG, Workflow Escalation —           │
│    resides on validated backend systems)              │
└─────────────────────────────────────────────────────┘
```

---

## 2. Architectural Invariants

These rules are **binding** — derived from `AGENTS.md` and enforced by code review. Violations MUST be rejected.

### 2.1 Control Plane Separation

The frontend acts **exclusively** as a control plane. It **shall not** contain core clinical decision logic. All critical processing (AI, RAG, workflow escalation) must reside on validated backend systems.

### 2.2 No Business Logic in UI

React components MUST only handle layout and event binding. Business rules, data transformations, and workflow logic MUST reside in the `lib/` service layer or custom hooks.

### 2.3 Strict API-Layer Access

**Components are FORBIDDEN from importing Firebase or Firestore directly.** All data operations MUST route through:

```typescript
import { api } from '../lib/api';
```

The only exception is authentication (`firebase/auth`), which is handled in:
- `src/App.tsx` — Firebase initialization and config
- `src/context/AuthContext.tsx` — Auth state provider
- `src/components/LoginPage.tsx` — Login form (uses `signInWithEmailAndPassword` from `firebase/auth`)

### 2.4 Mandatory RBAC

Every administrative or clinical action MUST be gated by a Role-Based Access Control (RBAC) check:

```typescript
import { can } from '../lib/rbac';
if (can(userRole, 'MANAGE_USERS')) { /* execute action */ }
```

### 2.5 EventBus Communication

For all **cross-module communication** (e.g., dashboard updating due to a patient state change), the system-wide `EventBus` MUST be used:

```typescript
import { eventBus } from '../lib/eventBus';

// Subscribe
eventBus.subscribe('CASE_STATUS_CHANGED', (event) => { /* react */ });

// Emit
eventBus.emit({ type: 'CASE_STATUS_CHANGED', payload: { ... } });
```

Direct component-to-component prop drilling for cross-boundary event handling is forbidden.

### 2.6 Mutation Traceability

All state mutations that alter a patient record or critical system state MUST generate a `TraceEvent` log entry to ensure regulatory compliance and clinical auditability. This is enforced atomically via Firestore `runTransaction`:

```
api.patients.updateStatus(id, status, userId, role, reason)
  → runTransaction {
      transaction.update(patientRef, { status })
      transaction.set(traceEventRef, traceEvent)
    }
```

### 2.7 No Silent Mutations

No state change shall occur without explicit user intent and associated tracing. Every mutation must be bound to a user action (click, form submit, etc.) and produce an auditable trace.

### 2.8 Externalized Inference

The system **SHALL NOT** perform medical diagnostic inference or escalation logic calculations client-side. All inference is delegated to backend AI services.

---

## 3. The 8-Role RBAC Matrix

The system defines eight distinct roles with granular permission boundaries. The permission matrix is the single source of truth:

```
FILE: src/lib/rbac.ts
```

### Full Matrix

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

### PII Redaction Boundary

Patient-identifiable information (PII) is gated through a single function in `src/lib/pii.ts`:

```typescript
export function patientDisplayName(role: Role, name: string): string {
  const CLINICAL_ROLES: Role[] = ['clinician'];
  return CLINICAL_ROLES.includes(role)
    ? name
    : '[REDACTED — CLINICAL PRIVILEGE REQUIRED]';
}
```

Only `clinician` role sees real patient names. All other roles, including `admin`, see the redacted placeholder. This is the **zero-PII boundary** — no non-clinical component should circumvent this function.

### Role Access Tiers Summary

| Tier | Roles | Scope |
|---|---|---|
| **Clinical** | `clinician` | Full patient data, triage workflow, report verification |
| **Operations** | `kiosk_operator`, `device_provider` | Device/infrastructure only — zero patient data |
| **Analytics** | `insurance_partner`, `public_health` | Aggregate/redacted analytics only |
| **Administration** | `admin` | User management, settings, audit, system health — explicitly NO patient data |
| **Consumer** | `patient`, `caregiver` | MVP: No portal access (empty permission arrays) |

---

## 4. Mutation Traceability & Audit Pipeline

Every state mutation that alters clinical or security-critical data is executed through an **atomic Firestore `runTransaction`** that couples the data write with an immutable audit entry.

### The `runTransaction` Pipeline

```
User Action → Component → api.method()
  → runTransaction(db, (transaction) => {
      transaction.set(dataRef, data)       // Primary data write
      transaction.set(auditRef, auditEntry) // Immutable audit record
    })
  → eventBus.emit()                        // Cross-module notification
```

### Audit Entry Schema

```typescript
interface AuditEntry {
  id: string;           // Auto-generated Firestore doc ID
  timestamp: string;    // ISO-8601
  actor: string;        // UID of the user performing the action
  role: string;         // Role of the user at time of action
  action: string;       // e.g. 'ROLE_SWITCH', 'KIOSK_STATUS_CHANGED'
  targetResource: string;
  severity: 'info' | 'warning' | 'critical';
  txHash: string;       // Pseudo-transaction hash for chain-of-custody
  createdAt: string;    // ISO-8601
}
```

### The ROLE_SWITCH Audit Ledger

Role transitions are specifically tracked with action type `ROLE_SWITCH` and target resource formatted as `security-token:{fromRole}→{toRole}`. This creates an immutable, chronologically ordered ledger of every privilege escalation or de-escalation event, which the chaos stress test validates.

### TraceEvent (Clinical-Level)

For patient-level mutations, a separate `TraceEvent` schema provides clinical audit context:

```typescript
interface TraceEvent {
  id: string;
  entityType: 'PATIENT' | 'KIOSK' | 'MODEL' | 'REPORT';
  entityId: string;
  action: string;
  performedBy: string;
  role: Role;
  timestamp: string;
  fromState?: string;   // Previous status
  toState?: string;     // New status
  reason?: string;      // Human-readable justification
}
```

---

## 5. The Chaos Testing Methodology

The system includes a **Chaos Monkey Stress Test** harness at `scripts/chaos-stress-test.mjs` that validates system resilience and audit integrity under simulated clinical meltdown conditions.

### Purpose

Validate that refactors, schema changes, and infrastructure updates do not break:
1. Atomic transaction guarantees
2. Audit log completeness and ordering
3. Role-switch ledger integrity
4. Kiosk outage recovery workflows

### Phases

| Phase | Name | What It Tests |
|---|---|---|
| 1 | Database State Check | Initial patient/kiosk/audit counts |
| 2 | 💥 Kiosk Outage Injection | Forces a kiosk offline, writes audit entry, schedules auto-recovery after 8s |
| 3 | 🌊 Triage Flood | 5 rapid patient ingestions at 1.5s intervals — tests transaction lock isolation |
| 4 | ⚡ Rapid Role-Switch Overs | 10 consecutive `ROLE_SWITCH` audit entries with no delay — tests ledger throughput |
| 5 | 🔍 Audit Integrity Verification | Validates timestamp ordering, txHash presence, role-switch chain continuity |

### Running the Test

```bash
# Requires Firebase credentials configured in .env.local
node scripts/chaos-stress-test.mjs
```

If no real Firebase credentials are configured, the test safely skips with an informational message. For local validation, use the **Debug Chaos Drawer** (`DebugChaosDrawer.tsx`) which provides a UI equivalent of the chaos tests, accessible in dev mode via the floating "⚠️ Open Chaos Panel" button.

### Validation Criteria

The audit integrity check (Phase 5) passes when:
- `ROLE_SWITCH` entries count ≥ 10
- Zero entries missing `txHash`
- Timestamp chain is monotonically ordered
- All kiosk outage events are recoverable

---

## 6. Project Structure

```
src/
├── App.tsx                      # Root: Firebase init, routing, role-based tab rendering
├── main.tsx                     # Entry point
├── types.ts                     # All TypeScript interfaces and type aliases
├── index.css                    # Global styles / Tailwind
├── vite-env.d.ts                # Vite client type declarations
│
├── components/                  # React view components (UI only — no business logic)
│   ├── common/                  #   Shared UI primitives (Card, Table, StatusBadge, etc.)
│   ├── DashboardView.tsx        #   Clinical Command Center
│   ├── PatientManagementView.tsx #   Patient Triage Registry
│   ├── ReportManagementView.tsx  #   Diagnostic & Audit Ledger
│   ├── KioskManagementView.tsx   #   Edge Terminal Management
│   ├── UserManagementView.tsx    #   Identity Access Control
│   ├── SystemHealthDashboardView.tsx  # Subsystem Telemetry
│   ├── AnalyticsDashboardView.tsx     # Analytics & Clinical Intelligence
│   ├── ...                      #   Additional views
│   └── DebugChaosDrawer.tsx      #   Chaos testing UI
│
├── context/
│   └── AuthContext.tsx           # Firebase Auth state provider
│
├── lib/
│   ├── api.ts                   # **Sole data access layer** — all Firestore operations
│   ├── rbac.ts                  # Permission matrix and can() guard function
│   ├── pii.ts                   # PII redaction boundary
│   └── eventBus.ts              # Cross-module publish/subscribe system
│
├── server/
│   ├── middleware/auth.ts        # Express auth middleware
│   ├── routes/api.ts             # Express API routes
│   └── safety/triageRules.ts     # Server-side clinical rules engine
│
scripts/
└── chaos-stress-test.mjs        # Chaos Monkey stress test harness
```

### Layer Responsibilities

| Directory | Responsibility | Forbidden |
|---|---|---|
| `components/` | UI rendering, event handling, layout | Direct Firebase imports, business logic |
| `lib/api.ts` | All Firestore CRUD, subscriptions, transactions | UI rendering |
| `lib/rbac.ts` | Permission checks | Data mutations |
| `lib/eventBus.ts` | Cross-module event distribution | Direct component coupling |
| `context/` | React context providers | Database access |
| `server/` | Express server, middleware, backend rules | Frontend imports |
| `scripts/` | Test harnesses, seed scripts | Runtime dependencies |

---

## 7. Package Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `tsx server.ts` | Development server with HMR |
| `build` | `vite build && esbuild server.ts` | Production build |
| `lint` | `tsc --noEmit` | TypeScript type checking |
| `seed` | `tsx seed-db.js` | Database seeding (env-specific) |
| `start` | `node dist/server.cjs` | Production start |

---

## 8. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 19.0.1 |
| Build | Vite | 6.2.3 |
| Styling | Tailwind CSS | 4.1.14 |
| Backend | Express | 4.21.2 |
| Database | Firestore (via Firebase) | 12.14.0 |
| Auth | Firebase Auth | 12.14.0 |
| Charts | Recharts | 3.8.1 |
| Icons | Lucide React | 0.546.0 |
| Animations | Motion | 12.23.24 |
| Language | TypeScript | 5.8.2 |
| Runtime | Node (via tsx) | — |

---

## 9. Security & Compliance Checklist

- [x] Zero direct Firestore imports in components
- [x] All data operations routed through `src/lib/api.ts`
- [x] PII redacted for non-clinical roles
- [x] RBAC gating on every administrative action
- [x] Atomic `runTransaction` for all mutations
- [x] Immutable audit log entries with txHash
- [x] No client-side clinical inference
- [x] Firebase Auth as sole identity source
- [x] EventBus for cross-module communication
- [x] Chaos-tested audit integrity pipeline
