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
