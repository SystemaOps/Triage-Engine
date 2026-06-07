# AGENTS.md - Clinical Operations Control Plane Rule Contract

This file constitutes the binding architectural and operational rule contract for the Clinical Operations Control Plane. All future development, refactoring, and feature additions MUST strictly adhere to these invariants.

## 1. Architectural Invariants
- **Control Plane Separation**: The frontend acts exclusively as a control plane. It shall not contain core clinical decision logic. All critical processing (AI, RAG, workflow escalation) must reside on validated backend systems.
- **No Business Logic in UI**: React components MUST only handle layout and event binding. Business rules, data transformations, and workflow logic MUST reside in the `lib` service layer or custom hooks.
- **Strict API-Layer Access**: Components are FORBIDDEN from interacting directly with Firebase/Firestore. All data operations MUST pass through the `src/lib/api.ts` abstraction layer.

## 2. Security & Access Control
- **Identity Source of Truth**: Firebase Authentication is the sole source of identity.
- **Mandatory RBAC**: Every administrative or clinical action MUST be gated by a Role-Based Access Control (RBAC) check (e.g., `can(userRole, action)`) before execution.
- **No Bypasses**: Bypassing the service layer to manipulate global state or database records directly is prohibited.

## 3. System Design Constraints
- **EventBus Communication**: For all cross-module communication (e.g., dashboard updating due to a patient state change), the system-wide `EventBus` MUST be used. Direct component-to-component prop drilling for event handling is forbidden for cross-boundary communication.
- **Mutation Traceability**: All state mutations that alter a patient record or critical system state MUST generate a `TraceEvent` log entry to ensure regulatory compliance and clinical auditability.

## 4. Clinical operational integrity
- **No Silent Mutations**: No state change shall occur without explicit user intent and associated tracing.
- **Externalized Inference**: The system SHALL NOT perform medical diagnostic inference or escalation logic calculations client-side.
