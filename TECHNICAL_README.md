# Clinical Operations Control Plane

## Overview
The Clinical Operations Control Plane is a secure, role-based, traceable, real-time-ready clinical admin frontend portal designed for AI-assisted triage ecosystems. It serves as the primary control plane for hospital operations, enabling medical staff to orchestrate patient workflows, manage AI-assisted triage outputs, oversee hospital kiosks, and monitor clinical telemetry.

## System Architecture (4-Layer Model)

The system is designed with a strict separation of concerns to allow independent development between frontend, backend, and AI integration teams.

### 1. Presentation Layer (Admin Portal UI)
Houses the modular view components:
- **Dashboard**: Real-time operational oversight.
- **Patient Module**: Workflow state management and triage queue.
- **Kiosk Module**: Device status and remote management.
- **Models/Reports/Audit**: System transparency and regulatory compliance views.

### 2. Control Layer (Frontend Intelligence)
Handles state, logic, and security:
- **AuthContext**: Firebase Auth gating.
- **RBAC System**: Enforces role-based authority on UI actions (Admin vs. Operator).
- **EventBus**: System-wide message propagation for real-time reactivity.
- **Traceability System**: Real-time event logging.
- **API Service Layer**: Abstraction of data fetching and persistence.

### 3. Integration Layer
The bridge to backend infrastructure:
- **Firestore**: Durable metadata and state storage.
- **API Service Layer**: Firestore abstraction for CRUD operations.
- **External Integration Points**: Secure hooks for future backend APIs, LLM/RAG pipelines, imaging services, and device streams.

### 4. Clinical Systems Layer (External Infrastructure)
- External EHR (Electronic Health Record) systems.
- Emergency escalation mechanisms (e.g., paging systems).
- Medical diagnostic devices/systems.

## Data Flow
- **Patient Flow**: Kiosk → API → EventBus → UI → Traceability → Dashboard.
- **AI Flow**: Clinical Data → API Service → AI Inference Pipeline → Decision Payload → Trace/Alert.
- **Admin Flow**: User Action → RBAC Validation → API Service → State Update → Traceability.

## System Boundary Responsibility
> **Note**: The frontend acts strictly as a **Control Plane only**. No clinical decisions are executed client-side. All AI inference, escalation logic, and medical decisions are externalized to validated backend services and clinical infrastructure.
