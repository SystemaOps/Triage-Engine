# Developer Guide - Clinical Operations Control Plane

## Overview
Welcome to the Clinical Operations Control Plane development environment. This guide outlines the system architecture, access protocols, data flows, and operational boundaries.

## I. Architecture & System Principles
- **Control Plane Pattern**: The frontend is a UI-only control plane. Business/Clinical logic is strictly prohibited here.
- **Service Layer Abstraction**: Direct Firebase interaction is forbidden. Use `/src/lib/api.ts` for all data operations.
- **Immutability & Traceability**: All state-mutating actions must generate a `TraceEvent`. This is mandatory for clinical auditability.

## II. Data & API Contracts
### 1. Patient Data (`/patients`)
All patient records follow the `TriageRecord` interface defined in `/src/types.ts`.
- **API Entry Points**:
  - `api.patients.getAll()`: Fetches all triage records.
  - `api.patients.updateStatus(patientId, newStatus, userId, userRole, reason)`: Performs atomic update of status and creation of `TraceEvent`.

### 2. RBAC Model (`/src/lib/rbac.ts`)
Access control is enforced via the `can(role: Role, action: Action)` function. All UI actions MUST guard against this check.

| Role | Actions Allowed |
| :--- | :--- |
| **ADMIN** | All actions |
| **DOCTOR** | Triage, Update Status, Assign, Resolve, View Models/Logs |
| **OPERATOR** | View Case/Status, Restart Kiosks, View Models/Logs |
| **ANALYST** | View Case/Status, View Models, View/Export Logs |

## III. Event Flow Specification
For real-time cross-module communication, use the system-wide `EventBus` (`/src/lib/eventBus.ts`).
- **Standard Protocol**:
  1. API mutation succeeds (via Atomic Firestore Transaction).
  2. `eventBus.emit()` is called with appropriate `AppEvent` payload.
  3. UI components subscribe via `useEffect` hook to update local dashboard state.

## IV. Deployment & Security Checklist
### Security Hardening
- [ ] Firestore rules are `default deny` for all undefined collections.
- [ ] Auth context is provided by Firebase Auth.
- [ ] All API mutations require authentication and authorization (via `rbac`).
- [ ] Role information is derived from `/users/{uid}`, never implicitly trusted.

### Deployment Checklist
- [ ] Ensure valid Google Cloud project credentials for Firestore and Auth.
- [ ] Set `FIREBASE_API_KEY`, `AUTH_DOMAIN`, etc., in `.env` (excluding sensitive secrets).
- [ ] Run `npm run build` to ensure integrity of production bundle.
- [ ] Verify `firestore.rules` are deployed before site launch.

## V. Failure Modes & Recovery
- **Firestore Transaction Failure**: API method `updateStatus` is atomic. If the trace event write fails, the patient status update is rolled back automatically. The UI should display an explicit error to the user.
- **EventBus Desync**: If a UI component misses an event, it should refresh current data from the `api` layer upon its next mount.
