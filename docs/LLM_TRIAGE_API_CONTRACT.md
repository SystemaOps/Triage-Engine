# LLM Triage Automation — API Contract

> **Binding interface specification between the Medical Triage Admin Portal and the AI Inference Layer.**
> All Cloud Functions, microservices, or external LLM endpoints MUST adhere to this contract.
> Violations MUST be rejected at the CI/CD gate and audit-logged.

---

## 1. System Architecture

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────────────┐
│              │     │                             │     │                      │
│  Edge Layer  │────▶│  Firestore                  │────▶│  Cloud Function      │
│  (Kiosks /   │     │  - patients/{id}            │     │  (onPatientCreate)   │
│   Mobile)    │     │  - modelWeights/{id}         │     │                      │
│              │     │  - settings/global           │     │  1. Read doc         │
│              │     │  - auditLogs/{id}            │     │  2. De-identify PHI  │
│              │     │                             │     │  3. Invoke LLM       │
│              │     │                             │     │  4. Write result     │
│              │     │                             │     │  5. Audit log        │
└──────────────┘     └──────────┬──────────────────┘     └──────────┬───────────┘
                                │                                   │
                                ▼                                   ▼
                     ┌─────────────────────┐              ┌──────────────────┐
                     │   Admin Portal      │              │   LLM Provider   │
                     │  (React / Vite)     │              │  (Vertex AI /    │
                     │                     │              │   OpenAI / etc.) │
                     │  Real-time updates  │              │                  │
                     │  via subscription   │              │  De-identified   │
                     │  polling            │              │  payload only    │
                     └─────────────────────┘              └──────────────────┘
```

### Data Flow

1. **Trigger**: A `patients/{id}` document is created (by kiosk, mobile app, or admin portal)
2. **Cloud Function**: `onPatientCreate` fires, reads the document
3. **De-identification**: All PHI fields are stripped from the payload
4. **LLM Invocation**: De-identified payload + model config is sent to the LLM
5. **Response Validation**: LLM response is validated against the strict output schema
6. **Firestore Write**: Validated results are written back to the patient document + audit logs
7. **Portal Update**: Admin portal picks up the change via `api.patients.getAll()` polling

---

## 2. PHI De-identification Boundary

Protected Health Information (PHI) MUST be stripped from the payload **before** it leaves the Firebase secure boundary.

### Explicitly Stripped Fields

| Field | Source | Replacement |
|---|---|---|
| `patientName` | `TriageRecord.patientName` | `PATIENT_${patientId.substring(0,8)}` |
| `patientId` | `TriageRecord.id` | Hashed to `pid_${sha256(id).substring(0,16)}` |
| Any free-text `rawText` | `DiagnosticReport.content.rawText` | Removed entirely |
| `verifiedBy` | `DiagnosticReport.verifiedBy` | Removed | 

### De-identified Payload (Outbound to LLM)

```typescript
interface LLMTriageInferenceRequest {
  /** Idempotency key — prevents duplicate scoring on retry */
  idempotencyKey: string;
  
  /** De-identified patient reference */
  patientRef: string; // e.g., "pid_a1b2c3d4e5f6g7h8"
  
  /** Clinical context — vitals and symptoms only, no PII */
  vitals: {
    spo2?: number;
    heartRate?: number;
    bloodPressure?: string; // e.g., "120/80"
    temperature?: number;
    glucose?: number;
  };
  
  /** Symptom keywords extracted at the kiosk (free of PII) */
  symptoms: string[];
  
  /** Model version to use for inference */
  modelVersion: string; // e.g., "triage-v2.1-shadow"
  
  /** Confidence threshold from portal settings */
  confidenceThreshold: number; // default 0.8
  
  /** Timestamp of the triage event */
  eventTimestamp: string; // ISO-8601
}
```

### Enforcement Mechanism

The de-identification step runs inside the Cloud Function **before** any external HTTP call. This is enforced by:
- A `sanitizeForLLM()` utility that strips known PHI fields
- A structural type check that rejects the payload if any `patientName`, `rawText`, or `verifiedBy` field leaks through
- Audit logging of each de-identification pass with field-count verification

---

## 3. Idempotency

Cloud Functions may retry on failure. The contract guarantees exactly-once triage scoring.

### Idempotency Key

```typescript
idempotencyKey: `${patientId}_${eventTimestamp}_${modelVersion}`
```

### Protocol

1. **Before LLM invocation**: The Cloud Function checks the `auditLogs` collection for an existing entry with `action === 'LLM_INFERENCE_COMPLETED'` and matching `idempotencyKey`
2. **If found**: Skip inference entirely — return cached result
3. **If not found**: Proceed with LLM invocation
4. **After inference**: Write the audit entry with the `idempotencyKey` as part of the transaction
5. **Atomicity**: The result write and audit log write are wrapped in a single `runTransaction` — if either fails, both roll back

### Duplicate Detection

| Scenario | Detection | Action |
|---|---|---|
| Cloud Function retry (same invocation) | Check `auditLogs` for matching `idempotencyKey` | Return cached result, no LLM cost |
| Manual re-trigger by operator | Same key check | Gracefully skipped |
| Kiosk resubmits same event | Same key based on `patientId + timestamp` | No duplicate patient created |

---

## 4. Deterministic Output Enforcements

The LLM response MUST conform to a strict JSON schema. Any deviation MUST be caught, logged, and escalated.

### Enforced Response Schema

```typescript
interface LLMTriageInferenceResponse {
  /** Must be one of the four locked enums */
  triageCategory: 'EMERGENCY' | 'URGENT' | 'ROUTINE' | 'SELF_CARE';
  
  /** Confidence score 0.0–1.0 */
  confidence: number;
  
  /** Brief clinical rationale (≤500 chars, no PII) */
  rationale: string;
  
  /** Recommended escalation path */
  recommendedAction: 'immediate_care' | 'urgent_review' | 'schedule_consult' | 'self_care';
  
  /** Key indicators that drove the decision */
  contributingFactors: string[];
  
  /** Model metadata */
  modelInfo: {
    modelVersion: string;
    inferenceTimeMs: number;
    tokenCount: number;
  };
}
```

### Schema Enforcement Pipeline

```
LLM Response (raw JSON)
  │
  ▼
JSON.parse()                     ──▶ Failure → log error, set Needs Review
  │
  ▼
TypeScript structural validation ──▶ Failure → log error, set Needs Review
  │     (zod schema or io-ts)
  ▼
Enum domain check                ──▶ Failure → log error, set Needs Review
  │     (triageCategory must be one of 4)
  ▼
Confidence range check           ──▶ Out of range → clamp to [0, 1], log warning
  │     (0.0 ≤ confidence ≤ 1.0)
  ▼
Rationale length check           ──▶ Exceeds 500 chars → truncate, log warning
  │
  ▼
Write to Firestore
```

### Hallucination Guardrails

| Guardrail | Threshold | Action |
|---|---|---|
| `triageCategory` not in enum | Any deviation | Reject response, fall back to rules engine |
| `confidence` < `humanReviewThreshold` (0.5) | Any | Set status to `Needs Review` |
| Empty `contributingFactors` | Array length 0 | Log warning, but accept response |
| `rationale` contains PHI patterns | Matches name/email/SSN regex | Strip PHI, log security event |

### Mapping to Existing Types

The validated response maps to existing Firestore schemas:

```typescript
// TriageRecord fields updated by Cloud Function
TriageRecord.triageCategory  = mapCategory(response.triageCategory)
//   'EMERGENCY'    → 'Emergency'
//   'URGENT'       → 'Urgent'
//   'ROUTINE'      → 'Doctor'
//   'SELF_CARE'    → 'Self-care'

TriageRecord.confidence      = response.confidence
TriageRecord.status          = response.confidence >= settings.aiConfig.confidenceThreshold
                               ? 'In Triage'
                               : 'Needs Review'
```

---

## 5. Latency & Timeout Fallbacks

The LLM inference pipeline has a finite budget for clinical responsiveness.

### Timing Specification

| Parameter | Value | Enforced By |
|---|---|---|
| Max acceptable latency | **5,000 ms** (5s) | Cloud Function timeout config |
| Warning threshold | **3,000 ms** (3s) | Logged to audit as severity `warning` |
| Portal polling interval | 3,000–5,000 ms | Client-side `setInterval` |
| Spurious retry cadence | Up to 3 retries, 1s apart | Cloud Function retry policy |

### Timeout Protocol

```
LLM invocation sent at t=0
  │
  ├── t=3000ms → Log warning to audit: "LLM_INFERENCE_LATENCY_WARNING"
  │
  ├── t=5000ms → Timeout triggered
  │               │
  │               ├── Cancel LLM request
  │               │
  │               ├── Execute Fallback Path (see below)
  │               │
  │               └── Write audit: "LLM_INFERENCE_TIMEOUT" with severity critical
  │
  └── t=5000ms+ → If LLM response arrives late → Discard, log warning
```

### Fallback Path: Rules Engine

When the LLM times out, the system falls back to the deterministic rules engine in `src/server/safety/triageRules.ts`:

```typescript
// Simplified fallback logic — maps vitals to conservative triage assignment
function fallbackTriage(vitals: Vitals): LLMTriageInferenceResponse {
  if (vitals.spO2 < 90 || vitals.chestPain) {
    return {
      triageCategory: 'EMERGENCY',
      confidence: 0.6,          // Lower confidence for rules-based
      rationale: 'Fallback: Rules engine detected critical vital signs.',
      recommendedAction: 'immediate_care',
      contributingFactors: ['rules_engine_fallback', 'llm_timeout'],
      modelInfo: { modelVersion: 'rules-engine-v1', inferenceTimeMs: 0, tokenCount: 0 },
    };
  }
  // ... additional rules for urgent/routine/self-care
}
```

| Fallback Priority | Source | Trigger |
|---|---|---|
| 1 (best) | LLM inference | Normal operation |
| 2 | Rules engine (`triageRulesEngine`) | LLM timeout or hallucination |
| 3 | Human-in-the-loop (`Needs Review`) | Rules engine also indeterminate |

### Result Status After Fallback

| Route | `TriageRecord.status` | `confidence` |
|---|---|---|
| LLM success, confidence ≥ threshold | `In Triage` | As-scored |
| LLM success, confidence < threshold | `Needs Review` | As-scored |
| LLM timeout → rules engine | `Needs Review` | Capped at 0.6 |
| LLM hallucination → rules engine | `Needs Review` | Capped at 0.5 |

---

## 6. Cloud Function Contract

### Trigger

```typescript
// Firebase Cloud Function — triggers on patient document creation
export const onPatientCreate = functions.firestore
  .document('patients/{patientId}')
  .onCreate(async (snap, context) => {
    // Contract implementation
  });
```

### Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `LLM_ENDPOINT_URL` | Firebase Config / Secrets | URL of the LLM inference endpoint |
| `LLM_API_KEY` | Firebase Secrets | Authentication for the LLM provider |
| `ACTIVE_MODEL_VERSION` | Firestore `modelWeights` where `status === 'active'` | Model version to use |
| `CONFIDENCE_THRESHOLD` | Firestore `settings/global.aiConfig.confidenceThreshold` | Minimum confidence for auto-accept |
| `HUMAN_REVIEW_THRESHOLD` | Firestore `settings/global.aiConfig.humanReviewThreshold` | Threshold below which requires human review |

### Runtime

- **Platform**: Cloud Functions (2nd gen) or Cloud Run
- **Timeout**: 60s (with 5s internal LLM timeout)
- **Memory**: 512 MB
- **Min instances**: 1 (to avoid cold-start latency for clinical events)

---

## 7. Error Handling & Audit Traceability

### Audit Entry Actions

| Action | Severity | Trigger |
|---|---|---|
| `LLM_INFERENCE_STARTED` | info | De-identified payload sent to LLM |
| `LLM_INFERENCE_COMPLETED` | info | Valid response received and written |
| `LLM_INFERENCE_LATENCY_WARNING` | warning | Response time > 3,000ms |
| `LLM_INFERENCE_TIMEOUT` | critical | Response time > 5,000ms |
| `LLM_INFERENCE_HALLUCINATION` | critical | Response failed schema validation |
| `LLM_MODEL_FALLBACK_ACTIVATED` | warning | Rules engine fallback engaged |
| `LLM_INFERENCE_RETRY` | info | Cloud Function retry detected |

### Trace Event (Patient-Level)

For each completed inference (success or fallback), a `TraceEvent` is appended to the patient's subcollection:

```typescript
{
  entityType: 'PATIENT',
  entityId: patientId,
  action: 'LLM_TRIAGE_SCORED',  // or 'LLM_TRIAGE_FALLBACK'
  performedBy: 'system:cloud-function',
  role: 'clinician',             // System acts with clinician privilege for writes
  timestamp: new Date().toISOString(),
  fromState: 'Registered',
  toState: 'In Triage' | 'Needs Review',
  reason: `LLM scored as ${triageCategory} with ${confidence} confidence. Model: ${modelVersion}`
}
```

---

## 8. Model Management Integration

The contract integrates with the existing model lifecycle:

### Model Selection

The active model is read from Firestore at invocation time:

```typescript
const activeModel = await getDocs(query(
  collection(db, 'modelWeights'),
  where('status', '==', 'active'),
  limit(1)
));
```

### Shadow Model Testing

When a shadow model is deployed (via `api.modelWeights.promoteModel`), the Cloud Function can:
1. **Run dual inference** — invoke both the active and shadow models
2. **Compare outputs** — if the shadow model outperforms (higher confidence, lower latency), log the delta
3. **Auto-promote** — if shadow model shows >5% accuracy improvement over 100 inferences, trigger promotion

### Accuracy Tracking

Each inference result updates the model's running accuracy metrics:

```typescript
interface ModelAccuracyEvent {
  modelVersion: string;
  inferenceCount: number;
  doctorAgreementRate: number;  // Updated when clinician verifies/rejects
  avgLatencyMs: number;
  hallucinationRate: number;
}
```

---

## 9. Implementation Checklist

- [ ] Cloud Function `onPatientCreate` deployed
- [ ] `sanitizeForLLM()` utility implemented and tested
- [ ] Zod schema (or equivalent) for LLM response validation
- [ ] Rules engine fallback implementation (`src/server/safety/triageRules.ts` expanded)
- [ ] Idempotency check via `auditLogs` collection
- [ ] Audit log entries for all LLM lifecycle events
- [ ] TraceEvent append for each inference (success and fallback)
- [ ] Model selection logic reading from `modelWeights` collection
- [ ] Shadow model comparison pipeline (optional, phase 2)
- [ ] Firebase Secrets configured for `LLM_ENDPOINT_URL` and `LLM_API_KEY`
- [ ] Chaos Stress Test extended with LLM timeout/hallucination scenarios
- [ ] Portal `ReportManagementView` updated to display `aiAnalysis` from LLM results
