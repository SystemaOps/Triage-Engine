export type Role =
  | 'patient'
  | 'caregiver'
  | 'clinician'
  | 'kiosk_operator'
  | 'device_provider'
  | 'insurance_partner'
  | 'public_health'
  | 'admin';

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface SubsystemHealth {
  id: string;
  name: string;
  type: 'core_service' | 'ai_model' | 'kiosk_hardware';
  status: HealthStatus;
  latencyMs?: number;
  lastSeen: string;
  errorMessage?: string;
}

export interface SystemHealthSnapshot {
  timestamp: string;
  overallStatus: HealthStatus;
  services: SubsystemHealth[];
}

export interface Organization {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Region {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
}

export interface Facility {
  id: string;
  orgId: string;
  regionId: string;
  name: string;
  type: 'hospital' | 'clinic' | 'kiosk_hub';
  address: string;
  createdAt: string;
}

export interface Department {
  id: string;
  orgId: string;
  facilityId: string;
  name: string;
  createdAt: string;
}

export interface KioskGroup {
  id: string;
  orgId: string;
  facilityId: string;
  departmentId: string;
  name: string;
  kioskIds: string[];
  createdAt: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive' | 'suspended';
  facilityId?: string;
  departmentId?: string;
}

export interface AppSettings {
  clinicalThresholds: {
    spo2: number;
    heartRate: number;
    bloodPressure: number;
    temperature: number;
    glucose: number;
  };
  escalationRules: {
    selfCare: string;
    doctorConsultation: string;
    urgentCare: string;
    emergency: string;
  };
  aiConfig: {
    confidenceThreshold: number;
    humanReviewThreshold: number;
    autoEscalation: boolean;
    retrainThresholds: RetrainThresholds;
  };
  notificationSettings: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    criticalOnly: boolean;
  };
  auditSettings: {
    retentionDays: number;
    exportPolicy: string;
  };
}

export interface AppNotification {
  id: string;
  category: "clinical" | "device" | "ai" | "security";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  createdAt: string;
}

export type Action = 
  | 'START_TRIAGE'
  | 'VIEW_CASE'
  | 'ASSIGN_DOCTOR'
  | 'UPDATE_STATUS'
  | 'RESOLVE_CASE'
  | 'VIEW_STATUS'
  | 'RESTART_DEVICE'
  | 'CONFIGURE_DEVICE'
  | 'VIEW_MODELS'
  | 'ACTIVATE_MODEL'
  | 'ROLLBACK_MODEL'
  | 'VIEW_LOGS'
  | 'EXPORT_LOGS'
  | 'ACKNOWLEDGE_NOTIFICATION'
  | 'VIEW_REPORTS'
  | 'VERIFY_REPORT'
  | 'VIEW_PATIENTS'
  | 'VIEW_ANALYTICS'
  | 'MANAGE_USERS'
  | 'MANAGE_SETTINGS'
  | 'MANAGE_ORGANIZATION'
  | 'VIEW_SYSTEM_HEALTH';

export type EntityType = "PATIENT" | "KIOSK" | "MODEL" | "REPORT";

export interface TraceEvent {
  id: string;
  entityType: EntityType;
  entityId: string;
  action: string;
  performedBy: string;
  role: Role;
  timestamp: string;
  fromState?: string;
  toState?: string;
  reason?: string;
}

export type AppEvent = 
    | { type: 'CASE_STATUS_CHANGED', payload: { patientId: string; newStatus: string; event: TraceEvent } }
    | { type: 'EMERGENCY_ALERT_TRIGGERED', payload: { alertId: string; urgency: string; message: string } }
    | { type: 'FACILITY_CHANGED', payload: { action: 'CREATE' | 'UPDATE' | 'DELETE', data: Facility } };

export type CaseStatus = 'Registered' | 'In Triage' | 'Needs Review' | 'Escalated' | 'Resolved';

export interface TriageAnalyticsSnapshot {
  periodId: string;
  totalTriageSessions: number;
  urgencyBreakdown: {
    critical: number;
    urgent: number;
    routine: number;
  };
  aiAccuracyMetrics: {
    totalInferences: number;
    doctorAgreements: number;
    doctorOverrules: number;
  };
  averageWaitTimeSec: number;
  facilityPerformance: {
    facilityId: string;
    patientVolume: number;
    avgProcessingTimeSec: number;
  }[];
  /** Extension fields from the server-side Cloud Function aggregation */
  disagreementCategoryBreakdown?: Record<string, number>;
  kioskUptimeRate?: number;
  modelConsensusRate?: number;
  computedAt?: string;
}

export interface TriageRecord {
  id: string;
  patientName: string;
  triageCategory: 'Self-care' | 'Doctor' | 'Urgent' | 'Emergency';
  confidence: number;
  timestamp: string;
  status: CaseStatus;
  traceEvents: TraceEvent[];
}

export interface KioskTerminal {
  id: string;
  hardwareId: string;
  name: string;
  facilityId: string;
  facilityName: string;
  regionName: string;
  status: 'online' | 'degraded' | 'offline';
  ipAddress: string;
  softwareVersion: string;
  currentQueue: number;
  thermalStatus: 'cool' | 'nominal' | 'hot';
  createdAt: string;
  updatedAt: string;
}

export interface ModelWeight {
  id: string;
  tag: string;
  type: 'triage' | 'classifier' | 'fallback';
  contextWindow: string;
  avgInferenceTime: number;
  accuracyRate: number;
  status: 'active' | 'shadow' | 'deprecated';
  tokenCostPerM: number;
  createdAt: string;
  promotedAt?: string;
}

export interface RetrainThresholds {
  minAgreementRate: number;
  minVerifiedSampleSize: number;
  maxCategoryDriftShare: number;
  evaluationWindowDays: number;
}

export type DisagreementCategory =
  | 'Hallucination'
  | 'Context Insufficiency'
  | 'Threshold Mismatch'
  | 'Policy Evolution'
  | 'Other';

export type ReportCategory = 'radiology' | 'lab' | 'ocr' | 'stt' | 'symptom';
export type ReportStatus = 'pending' | 'verified' | 'flagged';

export interface DiagnosticReport {
  id: string;
  patientId: string;
  patientName: string;
  category: ReportCategory;
  subType: string;
  status: ReportStatus;
  confidence: number;
  content: {
    rawText?: string;
    structuredData?: Record<string, unknown>;
    aiAnalysis?: string;
  };
  verifiedBy?: string;
  verifiedAt?: string;
  flagReason?: string;
  /** Drift-tracking fields — set when a clinician verifies the report */
  clinicianTriageOverride?: string | null;
  reviewNote?: string;
  clinicianAgreement?: boolean;
  disagreementCategory?: DisagreementCategory | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  targetResource: string;
  severity: 'info' | 'warning' | 'critical';
  txHash: string;
  createdAt: string;
}

// ── Vector Search Types ──

export interface VectorSearchMatchMetadata {
  patientName: string;
  triageCategory: string;
  status: string;
  confidence: number;
  timestamp: string;
  reportCategory?: string;
  subType?: string;
  verified?: boolean;
  clinicianOverride?: string;
  sourceType: 'patient' | 'report';
}

export interface VectorSearchMatch {
  id: string;
  score: number;
  metadata: VectorSearchMatchMetadata;
}

export interface VectorSearchResult {
  matches: VectorSearchMatch[];
  query: string;
}

export interface VectorSearchFilters {
  triageCategory?: string;
  status?: string;
  sourceType?: 'patient' | 'report';
  minConfidence?: number;
}

// ── LLM + RAG Types ──

export interface LLMHealth {
  status: string;
  rag_ready: boolean;
  model: string;
  version: string;
}

export interface TriageResult {
  session_id: string;
  urgency_level: string;
  reasoning: string;
  next_steps: string;
  red_flags: string[];
  disclaimer: string;
  latency_ms: number;
}

export interface ChatResult {
  session_id: string;
  reply: string;
  disclaimer: string;
}

export interface TriageHistoryEntry {
  id: string;
  patientId: string;
  patientName: string;
  symptoms: string;
  result: TriageResult;
  timestamp: string;
}

// ── OCR Types ──

export interface OcrProcessResponse {
  success: boolean;
  /** Extracted lab values from the OCR service */
  data: Record<string, unknown>;
  /** Processing metadata */
  processedAt: string;
  source: string;
}

export interface OcrSaveReportRequest {
  patientId: string;
  patientName: string;
  extractedData: Record<string, unknown>;
  rawText: string;
  confidence: number;
}

export interface OcrSaveReportWithTriageRequest extends OcrSaveReportRequest {
  /** The LLM triage result to include in the report */
  triageResult: TriageResult;
}

// ── STT (Speech-to-Text) Types ──

/** Available Whisper model sizes from the STT service */
export type SttModel = "tiny" | "base" | "small" | "medium" | "large" | "turbo";

/** STT model options with display labels for the UI */
export const STT_MODELS: Array<{ id: SttModel; label: string; description: string }> = [
  { id: "tiny", label: "Tiny", description: "Fastest, lowest resource (~500MB)" },
  { id: "base", label: "Base", description: "Fast, ~1GB" },
  { id: "small", label: "Small", description: "Balanced speed/accuracy" },
  { id: "medium", label: "Medium", description: "Accurate, ~3GB" },
  { id: "large", label: "Large", description: "Most accurate, highest quality" },
  { id: "turbo", label: "Turbo", description: "Latest optimized, fast + accurate" },
];

export interface SttTranscribeResponse {
  success: boolean;
  /** Transcribed text (clinical reasoning from voice-triage pipeline) */
  text: string;
  /** Detected or requested language */
  language: string | null;
  /** Processing timestamp */
  timestamp: string;
  /** Model used for transcription */
  model: string;
  /** Processing time in seconds */
  processingTime: number | null;
  /** Session ID for follow-up queries */
  sessionId: string;
  /** Path to the stored audio file on the server */
  audioFile: string | null;
  /** Path to the stored transcript file on the server */
  transcriptFile: string | null;
  /** Path to the stored metadata file on the server */
  metadataFile: string | null;
  /** Triage result from the unified voice-triage pipeline (included when routed through unified API) */
  triage?: {
    session_id: string;
    urgency_level: string;
    reasoning: string;
    next_steps: string;
    red_flags: string[];
    disclaimer: string;
    latency_ms: number | null;
  };
}

export interface SttHealthResponse {
  reachable: boolean;
  status: string;
  model: string;
  service: string;
}

export interface SttSaveTranscriptRequest {
  patientId: string;
  patientName: string;
  transcriptText: string;
  language: string | null;
  model: string;
  sessionId: string;
  confidence: number;
}

export interface SttSaveTranscriptWithTriageRequest extends SttSaveTranscriptRequest {
  /** The LLM triage result to include in the report */
  triageResult: TriageResult;
}

// ── TTS (Text-to-Speech) Types ──

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type TtsModel = "tts-1" | "tts-1-hd";
export type TtsAudioFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

/** TTS voice options with display labels for the UI */
export const TTS_VOICES: Array<{ id: TtsVoice; label: string; description: string }> = [
  { id: "alloy", label: "Alloy", description: "Versatile, balanced voice" },
  { id: "echo", label: "Echo", description: "Warm, expressive voice" },
  { id: "fable", label: "Fable", description: "Bright, engaging voice" },
  { id: "onyx", label: "Onyx", description: "Deep, authoritative voice" },
  { id: "nova", label: "Nova", description: "Clear, professional voice" },
  { id: "shimmer", label: "Shimmer", description: "Soft, calm voice" },
];

/** TTS model options with display labels for the UI */
export const TTS_MODELS: Array<{ id: TtsModel; label: string; description: string }> = [
  { id: "tts-1", label: "tts-1", description: "Low latency, optimized for real-time" },
  { id: "tts-1-hd", label: "tts-1-hd", description: "Higher quality, slightly more latency" },
];

export interface TtsSynthesizeRequest {
  text: string;
  voice?: TtsVoice;
  model?: TtsModel;
  responseFormat?: TtsAudioFormat;
  speed?: number;
}

export interface TtsSynthesizeResponse {
  success: boolean;
  /** Audio data as a base64-encoded string */
  audioBase64: string;
  /** MIME type of the audio (e.g., "audio/mpeg") */
  contentType: string;
  /** Preview of the original text */
  text: string;
  /** Voice used */
  voice: string;
  /** Model used */
  model: string;
}

export interface TtsVoiceOption {
  id: TtsVoice;
  label: string;
  description: string;
}

// ── X-Ray Analysis Types ──

export interface XRayClassifyResponse {
  success: boolean;
  data: Record<string, unknown>;
  processedAt: string;
  source: string;
  target: string;
}

export interface XRaySaveReportRequest {
  patientId: string;
  patientName: string;
  target: string;
  rawData: string;
  confidence: number;
}

export interface XRaySaveReportWithTriageRequest extends XRaySaveReportRequest {
  triageResult: TriageResult;
}

// ── Visual Analysis Types ──

export interface VisualAnalyzeResponse {
  success: boolean;
  data: Record<string, unknown>;
  processedAt: string;
  source: string;
  target: string;
}

export interface VisualSaveReportRequest {
  patientId: string;
  patientName: string;
  target: string;
  rawData: string;
  confidence: number;
}

export interface VisualSaveReportWithTriageRequest extends VisualSaveReportRequest {
  triageResult: TriageResult;
}
