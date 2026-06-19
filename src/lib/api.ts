import { db, auth } from './firebase';
import { collection, getDocs, getDoc, doc, runTransaction, updateDoc, setDoc, onSnapshot, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { TriageRecord, TraceEvent, Role, AppSettings, AppNotification, UserAccount, Facility, Organization, SubsystemHealth, TriageAnalyticsSnapshot, KioskTerminal, ModelWeight, AuditEntry, Region, DiagnosticReport, DisagreementCategory, VectorSearchResult, VectorSearchFilters, LLMHealth, TriageResult, ChatResult, OcrProcessResponse, OcrSaveReportRequest, OcrSaveReportWithTriageRequest, SttTranscribeResponse, SttHealthResponse, SttSaveTranscriptRequest, SttSaveTranscriptWithTriageRequest, TtsSynthesizeRequest, TtsSynthesizeResponse, XRayClassifyResponse, XRaySaveReportRequest, XRaySaveReportWithTriageRequest, VisualAnalyzeResponse, VisualSaveReportRequest, VisualSaveReportWithTriageRequest } from '../types';
import { eventBus } from './eventBus';

export const api = {
  // ── Authentication ──
  auth: {
    login: async (email: string, password: string): Promise<void> => {
      await signInWithEmailAndPassword(auth, email, password);
    },
  },
  analytics: {
    getSnapshot: async (periodId: string): Promise<TriageAnalyticsSnapshot> => {
        // Prefer the pre-computed snapshot from the Cloud Function (analytics/latest).
        // Falls back to live aggregation if the Cloud Function hasn't run yet.
        try {
          const latestSnap = await getDoc(doc(db, 'analytics', 'latest'));
          if (latestSnap.exists()) {
            const data = latestSnap.data() as TriageAnalyticsSnapshot;
            // Override periodId to match the caller's request
            return { ...data, periodId };
          }
        } catch (err) {
          console.warn('[analytics] analytics/latest not found, falling back to live aggregation', err);
        }

        // ── Fallback: client-side aggregation (until Cloud Function writes its first snapshot) ──
        const [patientsSnap, modelsSnap] = await Promise.all([
          getDocs(collection(db, 'patients')),
          getDocs(collection(db, 'modelWeights')),
        ]);

        const patients = patientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as TriageRecord));
        const models = modelsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ModelWeight));

        const emergencyCount = patients.filter(p => p.triageCategory === 'Emergency').length;
        const urgentCount = patients.filter(p => p.triageCategory === 'Urgent').length;
        const routineCount = patients.filter(p => p.triageCategory !== 'Emergency' && p.triageCategory !== 'Urgent').length;
        const avgAccuracy = models.length > 0 ? models.reduce((s, m) => s + m.accuracyRate, 0) / models.length : 0;

        return {
            periodId,
            totalTriageSessions: patients.length,
            urgencyBreakdown: { critical: emergencyCount, urgent: urgentCount, routine: routineCount },
            aiAccuracyMetrics: {
                totalInferences: patients.length,
                doctorAgreements: Math.round(patients.length * (avgAccuracy / 100)),
                doctorOverrules: Math.round(patients.length * (1 - avgAccuracy / 100)),
            },
            averageWaitTimeSec: 300,
            facilityPerformance: [
                { facilityId: 'all', patientVolume: patients.length, avgProcessingTimeSec: 300 },
            ],
        };
    },
  },
  patients: {
    create: async (patientData: Omit<TriageRecord, 'id'>, actorId: string, actorRole: Role) => {
      const patientRef = doc(collection(db, 'patients'));
      const traceEventRef = doc(collection(db, 'patients', patientRef.id, 'traceEvents'));
      const timestamp = new Date().toISOString();

      const traceEvent: TraceEvent = {
        id: traceEventRef.id,
        entityType: 'PATIENT',
        entityId: patientRef.id,
        action: 'CREATE',
        performedBy: actorId,
        role: actorRole,
        timestamp,
        toState: patientData.status,
        reason: 'Patient record created via telemetry injection',
      };

      const fullRecord: TriageRecord = {
        ...patientData,
        id: patientRef.id,
      };

      await runTransaction(db, async (transaction) => {
        transaction.set(patientRef, fullRecord);
        transaction.set(traceEventRef, traceEvent);
      });

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: { patientId: patientRef.id, newStatus: patientData.status, event: traceEvent },
      });

      return patientRef.id;
    },
    getAll: async () => {
      const snapshot = await getDocs(collection(db, 'patients'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TriageRecord));
    },
    updateStatus: async (
      patientId: string, 
      status: string, 
      userId: string,
      userRole: Role,
      reason: string
    ) => {
      const patientRef = doc(db, 'patients', patientId);
      const traceEventRef = doc(collection(db, 'patients', patientId, 'traceEvents'));
      
      const traceEvent: TraceEvent = {
        id: traceEventRef.id,
        entityType: 'PATIENT',
        entityId: patientId,
        action: 'UPDATE_STATUS',
        performedBy: userId,
        role: userRole,
        timestamp: new Date().toISOString(),
        toState: status,
        reason: reason
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(patientRef, { status: status });
        transaction.set(traceEventRef, traceEvent);
      });
      
      eventBus.emit({ 
        type: 'CASE_STATUS_CHANGED', 
        payload: { patientId, newStatus: status, event: traceEvent } 
      });
    },
    delete: async (patientId: string) => {
      await deleteDoc(doc(db, 'patients', patientId));
      
      try {
        const reportsSnap = await getDocs(collection(db, 'reports'));
        const matchingReports = reportsSnap.docs.filter(doc => doc.data().patientId === patientId);
        for (const reportDoc of matchingReports) {
          await deleteDoc(doc(db, 'reports', reportDoc.id));
        }
      } catch (err) {
        console.warn('Failed to delete associated reports:', err);
      }
    }
  },
  settings: {
    get: async (): Promise<AppSettings> => {
      const snap = await getDoc(doc(db, 'settings', 'global'));
      if (snap.exists()) {
        return snap.data() as AppSettings;
      }
      // Fallback defaults if no settings doc exists yet
      return {
        clinicalThresholds: { spo2: 95, heartRate: 100, bloodPressure: 140, temperature: 38, glucose: 150 },
        escalationRules: { selfCare: 'Low', doctorConsultation: 'Medium', urgentCare: 'High', emergency: 'Critical' },
        aiConfig: { confidenceThreshold: 0.8, humanReviewThreshold: 0.5, autoEscalation: true, retrainThresholds: { minAgreementRate: 85, minVerifiedSampleSize: 200, maxCategoryDriftShare: 40, evaluationWindowDays: 14 } },
        notificationSettings: { emailAlerts: true, smsAlerts: true, criticalOnly: true },
        auditSettings: { retentionDays: 30, exportPolicy: 'PDF' }
      };
    },
    update: async (userId: string, userRole: Role, settings: AppSettings, reason: string) => {
      const settingsRef = doc(db, 'settings', 'global');
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const auditEntry: AuditEntry = {
        id: auditRef.id,
        timestamp,
        actor: userId,
        role: userRole,
        action: 'SETTINGS_UPDATED',
        targetResource: 'settings/global',
        severity: 'info',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: timestamp,
      };

      await runTransaction(db, async (transaction) => {
        transaction.set(settingsRef, settings);
        transaction.set(auditRef, auditEntry);
      });
    },
  },
  notifications: {
    getAll: async (): Promise<AppNotification[]> => {
      const snapshot = await getDocs(collection(db, 'notifications'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
    },
    acknowledge: async (notificationId: string, userId: string) => {
      const ref = doc(db, 'notifications', notificationId);
      await updateDoc(ref, { 
        acknowledged: true, 
        acknowledgedBy: userId 
      });
    }
  },
  users: {
    getAll: async (): Promise<UserAccount[]> => {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserAccount));
    },
    create: async (userData: Omit<UserAccount, 'id'>, actorId: string, actorRole: Role) => {
      const userRef = doc(collection(db, 'users'));
      const traceEventRef = doc(collection(db, 'auditLogs'));
      
      await runTransaction(db, async (transaction) => {
        transaction.set(userRef, userData);
        transaction.set(traceEventRef, {
            entityType: 'USER',
            entityId: userRef.id,
            action: 'USER_CREATED',
            performedBy: actorId,
            role: actorRole,
            timestamp: new Date().toISOString(),
            reason: 'User creation requested'
          });
      });
    },
    update: async (userId: string, data: Partial<UserAccount>, actorId: string, actorRole: Role, reason: string) => {
      const userRef = doc(db, 'users', userId);
      const traceEventRef = doc(collection(db, 'auditLogs'));
      
      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, data);
        transaction.set(traceEventRef, {
            entityType: 'USER',
            entityId: userId,
            action: 'USER_UPDATED',
            performedBy: actorId,
            role: actorRole,
            timestamp: new Date().toISOString(),
            reason
          });
      });
    }
  },
  organizations: {
    subscribeToOrganizations: (onUpdate: (data: Organization[]) => void) => {
      const unsub = onSnapshot(
        collection(db, 'organizations'),
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching organizations:', error);
        },
      );
      return unsub;
    },
    subscribeToRegions: (onUpdate: (data: Region[]) => void) => {
      const unsub = onSnapshot(
        collection(db, 'regions'),
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Region));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching regions:', error);
        },
      );
      return unsub;
    },
    createOrganization: async (name: string, userId: string): Promise<string> => {
      const orgRef = doc(collection(db, 'organizations'));
      const auditRef = doc(collection(db, 'auditLogs'));
      const orgId = orgRef.id;
      const timestamp = new Date().toISOString();

      const orgData: Organization = {
        id: orgId,
        name,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const auditEntry: Partial<AuditEntry> = {
        timestamp,
        actor: userId,
        role: 'admin',
        action: 'ORGANIZATION_CREATED',
        targetResource: orgId,
        severity: 'info',
      };

      await runTransaction(db, async (transaction) => {
        transaction.set(orgRef, orgData);
        transaction.set(auditRef, auditEntry);
      });

      return orgId;
    },
    updateOrganization: async (orgId: string, data: Partial<Pick<Organization, 'name' | 'status'>>, userId: string): Promise<void> => {
      const orgRef = doc(db, 'organizations', orgId);
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const updateData: Partial<Organization> = {
        ...data,
        updatedAt: timestamp,
      };

      const auditEntry: Partial<AuditEntry> = {
        timestamp,
        actor: userId,
        role: 'admin',
        action: 'ORGANIZATION_UPDATED',
        targetResource: orgId,
        severity: 'info',
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(orgRef, updateData);
        transaction.set(auditRef, auditEntry);
      });
    },
    createRegion: async (name: string, orgId: string, userId: string): Promise<string> => {
      const regionRef = doc(collection(db, 'regions'));
      const auditRef = doc(collection(db, 'auditLogs'));
      const regionId = regionRef.id;
      const timestamp = new Date().toISOString();

      const regionData: Region = {
        id: regionId,
        orgId,
        name,
        createdAt: timestamp,
      };

      const auditEntry: Partial<AuditEntry> = {
        timestamp,
        actor: userId,
        role: 'admin',
        action: 'REGION_CREATED',
        targetResource: regionId,
        severity: 'info',
      };

      await runTransaction(db, async (transaction) => {
        transaction.set(regionRef, regionData);
        transaction.set(auditRef, auditEntry);
      });

      return regionId;
    },
    updateRegion: async (regionId: string, data: Partial<Pick<Region, 'name' | 'orgId'>>, userId: string): Promise<void> => {
      const regionRef = doc(db, 'regions', regionId);
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const auditEntry: Partial<AuditEntry> = {
        timestamp,
        actor: userId,
        role: 'admin',
        action: 'REGION_UPDATED',
        targetResource: regionId,
        severity: 'info',
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(regionRef, data);
        transaction.set(auditRef, auditEntry);
      });
    },
    createFacility: async (facilityData: Omit<Facility, 'id' | 'createdAt'>, userId: string): Promise<string> => {
        const facilityRef = doc(collection(db, 'facilities'));
        const traceRef = doc(collection(db, 'auditLogs'));
        const facilityId = facilityRef.id;
        const timestamp = new Date().toISOString();
    
        const fullFacilityData: Facility = {
          ...facilityData,
          id: facilityId,
          createdAt: timestamp,
        };
    
        const traceEvent = {
          timestamp,
          entityType: 'FACILITY',
          entityId: facilityId,
          action: 'FACILITY_CREATE',
          performedBy: userId,
          role: 'admin',
          reason: 'Facility creation requested'
        };
    
        await runTransaction(db, async (transaction) => {
          transaction.set(facilityRef, fullFacilityData);
          transaction.set(traceRef, traceEvent);
        });
    
        eventBus.emit({ type: 'FACILITY_CHANGED', payload: { action: 'CREATE', data: fullFacilityData } });
    
        return facilityId;
    }
  },
  health: {
    subscribe: (onUpdate: (healthData: SubsystemHealth[]) => void) => {
      const unsub = onSnapshot(
        collection(db, 'systemHealth'),
        (snapshot) => {
          const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubsystemHealth));
          onUpdate(services);
        },
        (error) => {
          console.error('Error fetching system health:', error);
        },
      );
      return unsub;
    }
  },
  kiosks: {
    getAll: async () => {
      const snapshot = await getDocs(collection(db, 'kiosks'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KioskTerminal));
    },
    subscribeToKiosks: (onUpdate: (data: KioskTerminal[]) => void) => {
      const unsub = onSnapshot(
        collection(db, 'kiosks'),
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KioskTerminal));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching kiosks:', error);
        },
      );
      return unsub;
    },
    createKiosk: async (kioskData: Omit<KioskTerminal, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<string> => {
      const kioskRef = doc(collection(db, 'kiosks'));
      const auditRef = doc(collection(db, 'auditLogs'));
      const kioskId = kioskRef.id;
      const timestamp = new Date().toISOString();

      const fullKioskData: KioskTerminal = {
        ...kioskData,
        id: kioskId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const auditEntry: AuditEntry = {
        id: auditRef.id,
        timestamp,
        actor: userId,
        role: 'System Admin',
        action: 'PROVISIONED_EDGE_NODE',
        targetResource: kioskData.hardwareId,
        severity: 'info',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: timestamp,
      };

      await runTransaction(db, async (transaction) => {
        transaction.set(kioskRef, fullKioskData);
        transaction.set(auditRef, auditEntry);
      });

      eventBus.emit({ type: 'FACILITY_CHANGED', payload: { action: 'CREATE', data: {} as Facility } });

      return kioskId;
    },
    updateKioskStatus: async (kioskId: string, status: 'online' | 'degraded' | 'offline', userId: string) => {
      const kioskRef = doc(db, 'kiosks', kioskId);
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const auditEntry: AuditEntry = {
        id: auditRef.id,
        timestamp,
        actor: userId,
        role: 'System Monitor',
        action: 'KIOSK_STATUS_CHANGED',
        targetResource: kioskId,
        severity: status === 'offline' ? 'critical' : status === 'degraded' ? 'warning' : 'info',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: timestamp,
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(kioskRef, { status, updatedAt: timestamp });
        transaction.set(auditRef, auditEntry);
      });
    },
  },
  modelWeights: {
    subscribeToModelWeights: (onUpdate: (data: ModelWeight[]) => void) => {
      const unsub = onSnapshot(
        collection(db, 'modelWeights'),
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ModelWeight));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching model weights:', error);
        },
      );
      return unsub;
    },
    promoteModel: async (modelId: string, userId: string): Promise<void> => {
      const modelRef = doc(db, 'modelWeights', modelId);
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const auditEntry: AuditEntry = {
        id: auditRef.id,
        timestamp,
        actor: userId,
        role: 'System Admin',
        action: 'PROMOTED_SHADOW_MODEL',
        targetResource: modelId,
        severity: 'critical',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: timestamp,
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(modelRef, { status: 'active', promotedAt: timestamp });
        
        // Deprecate previous active model if it exists
        const snapshot = await getDocs(collection(db, 'modelWeights'));
        const activeModel = snapshot.docs.find(d => {
          const data = d.data() as ModelWeight;
          return data.status === 'active' && d.id !== modelId;
        });
        if (activeModel) {
          transaction.update(activeModel.ref, { status: 'deprecated' });
        }

        transaction.set(auditRef, auditEntry);
      });
    },
  },
  auditLogs: {
    subscribeToAuditLogs: (onUpdate: (data: AuditEntry[]) => void) => {
      const q = query(
        collection(db, 'auditLogs'),
        orderBy('createdAt', 'desc'),
        limit(100),
      );
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditEntry));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching audit logs:', error);
        },
      );
      return unsub;
    },
    createEntry: async (entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<string> => {
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const fullEntry: AuditEntry = {
        ...entry,
        id: auditRef.id,
        createdAt: timestamp,
      };

      await setDoc(auditRef, fullEntry);
      return auditRef.id;
    },
  },
  reports: {
    get: async (reportId: string): Promise<DiagnosticReport | null> => {
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as DiagnosticReport;
    },
    getByPatientId: async (patientId: string): Promise<DiagnosticReport[]> => {
      const snapshot = await getDocs(collection(db, 'reports'));
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as DiagnosticReport))
        .filter(r => r.patientId === patientId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    subscribeToReports: (onUpdate: (data: DiagnosticReport[]) => void) => {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc'),
      );
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DiagnosticReport));
          onUpdate(data);
        },
        (error) => {
          console.error('Error fetching reports:', error);
        },
      );
      return unsub;
    },
    verify: async (
      reportId: string,
      userId: string,
      userRole: Role,
      override: string | null = null,
      note: string = '',
      category?: DisagreementCategory
    ) => {
      const reportRef = doc(db, 'reports', reportId);
      const auditRef = doc(collection(db, 'auditLogs'));
      const timestamp = new Date().toISOString();

      const auditEntry: AuditEntry = {
        id: auditRef.id,
        timestamp,
        actor: userId,
        role: userRole,
        action: 'REPORT_VERIFIED',
        targetResource: reportId,
        severity: 'info',
        txHash: `0x${Math.random().toString(16).substr(2, 8)}`,
        createdAt: timestamp,
      };

      await runTransaction(db, async (transaction) => {
        transaction.update(reportRef, {
          status: 'verified',
          verifiedBy: userId,
          verifiedAt: timestamp,
          clinicianTriageOverride: override,
          reviewNote: note,
          clinicianAgreement: override === null,
          disagreementCategory: override ? (category || 'Other') : null,
        });
        transaction.set(auditRef, auditEntry);
      });
    },
  },

  // ── Vector Search (Express REST API) ──
  vectorSearch: {
    /**
     * Internal helper: makes an authenticated request to the Express server.
     */
    _request: async <T>(path: string, body?: unknown): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Vector search API error (${response.status})`,
        );
      }

      const data = await response.json();
      return data as T;
    },

    /**
     * Performs a semantic search across indexed triage cases.
     * Calls POST /api/vector/search on the Express server.
     */
    search: async (
      query: string,
      topK: number = 10,
      filters?: VectorSearchFilters,
    ): Promise<VectorSearchResult> => {
      // Convert typed filters to Pinecone filter syntax
      let filter: Record<string, unknown> | undefined;
      if (filters) {
        filter = {};
        if (filters.triageCategory) filter.triageCategory = { $eq: filters.triageCategory };
        if (filters.status) filter.status = { $eq: filters.status };
        if (filters.sourceType) filter.sourceType = { $eq: filters.sourceType };
        if (filters.minConfidence !== undefined) {
          filter.confidence = { $gte: filters.minConfidence };
        }
      }

      const result = await api.vectorSearch._request<{
        success: boolean;
        matches: VectorSearchResult['matches'];
        query: string;
      }>('/api/vector/search', { query, topK, filter });

      return { matches: result.matches, query: result.query };
    },

    /**
     * Finds cases similar to a given case's text content.
     * Calls POST /api/vector/similar on the Express server.
     */
    getSimilarCases: async (
      caseText: string,
      topK: number = 5,
    ): Promise<VectorSearchResult> => {
      const result = await api.vectorSearch._request<{
        success: boolean;
        matches: VectorSearchResult['matches'];
      }>('/api/vector/similar', { caseText, topK });

      return { matches: result.matches, query: `Similar to provided case` };
    },

    /**
     * Batch indexes triage cases into Pinecone.
     * Calls POST /api/vector/index-all on the Express server.
     */
    indexAll: async (
      patients?: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>,
      reports?: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>,
    ): Promise<{
      indexedCount: number;
      totalInIndex: number;
      patientsIndexed: number;
      reportsIndexed: number;
    }> => {
      const result = await api.vectorSearch._request<{
        success: boolean;
        indexedCount: number;
        totalInIndex: number;
        patientsIndexed: number;
        reportsIndexed: number;
      }>('/api/vector/index-all', { patients, reports });

      return {
        indexedCount: result.indexedCount,
        totalInIndex: result.totalInIndex,
        patientsIndexed: result.patientsIndexed,
        reportsIndexed: result.reportsIndexed,
      };
    },

    /**
     * Indexes a single triage case into Pinecone.
     * Calls POST /api/vector/index on the Express server.
     */
    index: async (
      id: string,
      text: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> => {
      await api.vectorSearch._request('/api/vector/index', { id, text, metadata });
    },

    /**
     * Deletes vectors from the Pinecone index by their IDs.
     * Calls DELETE /api/vector on the Express server.
     */
    delete: async (ids: string[]): Promise<{ deletedCount: number }> => {
      const result = await api.vectorSearch._request<{
        success: boolean;
        deletedCount: number;
      }>('/api/vector', { ids });

      return { deletedCount: result.deletedCount };
    },
  },

  // ── Voice Triage (Express REST API) ──
  voiceTriage: {
    _request: async <T>(path: string, body?: FormData): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Voice triage API error (${response.status})`);
      }
      return response.json() as Promise<T>;
    },

    /**
     * POST /api/voice-triage/triage
     * Upload an audio file for voice-based triage.
     * The unified API handles STT transcription + LLM triage in one call.
     *
     * @param file - Audio file (File or Blob) of patient symptoms
     * @param fileName - Original file name
     * @param sessionId - Optional session ID
     * @returns TriageResult with urgency level, reasoning, next steps, red flags
     */
    triage: async (
      file: File | Blob,
      fileName: string,
      sessionId?: string,
    ): Promise<TriageResult> => {
      const formData = new FormData();
      formData.append('audio', file, fileName);
      if (sessionId) {
        formData.append('session_id', sessionId);
      }

      const result = await api.voiceTriage._request<{
        success: boolean;
        session_id: string;
        urgency_level: string;
        reasoning: string;
        next_steps: string;
        red_flags: string[];
        disclaimer: string;
        latency_ms: number;
      }>('/api/voice-triage/triage', formData);

      return {
        session_id: result.session_id,
        urgency_level: result.urgency_level,
        reasoning: result.reasoning,
        next_steps: result.next_steps,
        red_flags: result.red_flags,
        disclaimer: result.disclaimer,
        latency_ms: result.latency_ms,
      };
    },

    /**
     * POST /api/voice-triage/health
     * Check if the voice-triage pipeline is reachable.
     */
    health: async (): Promise<{ success: boolean; status: string; model: string }> => {
      const result = await api.voiceTriage._request<{
        success: boolean;
        status: string;
        model: string;
      }>('/api/voice-triage/health');
      return result;
    },
  },

  // ── OCR Processing (Express REST API) ──
  ocr: {
    _request: async <T>(path: string, body?: FormData): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {};

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Note: For FormData, we do NOT set Content-Type — the browser
      // automatically sets it with the correct multipart boundary.

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `OCR API error (${response.status})`,
        );
      }

      const data = await response.json();
      return data as T;
    },

    /**
     * POST /api/ocr/process
     * Upload a blood report image for OCR processing.
     *
     * @param file - A File or Blob from the file input
     * @param fileName - Original file name
     * @returns Parsed OCR result with extracted lab values
     */
    process: async (
      file: File | Blob,
      fileName: string,
    ): Promise<OcrProcessResponse> => {
      const formData = new FormData();
      formData.append('file', file, fileName);

      const result = await api.ocr._request<{
        success: boolean;
        data: Record<string, unknown>;
        processedAt: string;
        source: string;
      }>('/api/ocr/process', formData);

      return {
        success: result.success,
        data: result.data,
        processedAt: result.processedAt,
        source: result.source,
      };
    },

    /**
     * GET /api/ocr/health
     * Check if the external OCR API is reachable.
     */
    health: async (): Promise<{ reachable: boolean; status: string }> => {
      const result = await api.ocr._request<{
        success: boolean;
        reachable: boolean;
        status: string;
      }>('/api/ocr/health');

      return {
        reachable: result.reachable,
        status: result.status,
      };
    },

    /**
     * Saves OCR-extracted data as a new diagnostic report in Firestore.
     */
    saveReport: async (request: OcrSaveReportRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      // Format extracted data as a readable text block
      const formattedData = Object.entries(request.extractedData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'ocr',
        subType: 'blood_report',
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawText,
          structuredData: request.extractedData as Record<string, unknown>,
          aiAnalysis: `OCR blood report analysis:\nGlucose, WBC, and hemoglobin values extracted from uploaded image.`,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'OCR_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `OCR report created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },

    /**
     * Saves OCR-extracted data combined with LLM triage analysis as a comprehensive report.
     * The triage analysis is stored in the report's aiAnalysis field alongside lab values.
     */
    saveReportWithTriage: async (request: OcrSaveReportWithTriageRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const triage = request.triageResult;

      // Format extracted data as a readable text block
      const formattedData = Object.entries(request.extractedData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      // Build a comprehensive aiAnalysis field combining OCR results + triage
      const aiAnalysis = [
        `═══ OCR BLOOD REPORT ═══`,
        formattedData,
        ``,
        `═══ LLM TRIAGE ANALYSIS ═══`,
        `Session: ${triage.session_id}`,
        `Urgency Level: ${triage.urgency_level}`,
        `Latency: ${triage.latency_ms}ms`,
        ``,
        `Reasoning:`,
        triage.reasoning,
        ``,
        `Next Steps:`,
        triage.next_steps,
        ``,
        `Red Flags:`,
        triage.red_flags.map((f: string) => `  • ${f}`).join('\n'),
        ``,
        `Disclaimer: ${triage.disclaimer}`,
      ].join('\n');

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'ocr',
        subType: 'blood_report_triaged',
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawText,
          structuredData: {
            ...request.extractedData as Record<string, unknown>,
            triageSessionId: triage.session_id,
            urgencyLevel: triage.urgency_level,
            triageLatencyMs: triage.latency_ms,
            redFlags: triage.red_flags,
          },
          aiAnalysis,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'OCR_TRIAGE_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `OCR report with triage analysis created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },
  },

  // ── STT (Speech-to-Text) Processing (Express REST API) ──
  stt: {
    _request: async <T>(path: string, body?: FormData | string): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {};

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // For FormData, the browser sets Content-Type automatically.
      // For JSON body strings, set Content-Type explicitly.
      const isFormData = body instanceof FormData;
      if (!isFormData && body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: isFormData ? body : (body ?? undefined),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `STT API error (${response.status})`,
        );
      }

      const data = await response.json();
      return data as T;
    },

    /**
     * POST /api/stt/transcribe
     * Upload an audio file for speech-to-text transcription.
     *
     * @param file - Audio file (File or Blob)
     * @param fileName - Original file name
     * @param options - Optional model and language overrides
     * @returns Transcribed text with session metadata
     */
    transcribe: async (
      file: File | Blob,
      fileName: string,
      options?: { model?: string; language?: string; accuracyMode?: boolean },
    ): Promise<SttTranscribeResponse> => {
      const formData = new FormData();
      formData.append('file', file, fileName);

      const path = `/api/stt/transcribe`;

      const result = await api.stt._request<SttTranscribeResponse>(path, formData);
      return result;
    },

    /**
     * POST /api/stt/health
     * Check if the external STT API is reachable.
     */
    health: async (): Promise<SttHealthResponse> => {
      const result = await api.stt._request<{
        success: boolean;
        reachable: boolean;
        status: string;
        model: string;
        service: string;
      }>('/api/stt/health');

      return {
        reachable: result.reachable,
        status: result.status,
        model: result.model,
        service: result.service,
      };
    },

    /**
     * POST /api/stt/session
     * Retrieves details for a specific transcription session.
     */
    getSession: async (sessionId: string): Promise<Record<string, unknown>> => {
      const result = await api.stt._request<{
        success: boolean;
        data: Record<string, unknown>;
      }>('/api/stt/session', JSON.stringify({ session_id: sessionId }));

      return result.data;
    },

    /**
     * Saves a transcription as a new diagnostic report (category: 'stt') in Firestore.
     */
    saveTranscript: async (request: SttSaveTranscriptRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'stt',
        subType: `transcription_${request.model}`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.transcriptText,
          structuredData: {
            sessionId: request.sessionId,
            language: request.language,
            model: request.model,
          },
          aiAnalysis: `STT transcription using ${request.model} model.\nLanguage: ${request.language || 'en'}\nSession: ${request.sessionId}`,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'STT_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `STT transcription created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },

    /**
     * Saves a transcription combined with LLM triage analysis as a comprehensive report.
     * The triage analysis is stored in the report's aiAnalysis field.
     */
    saveTranscriptWithTriage: async (request: SttSaveTranscriptWithTriageRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const triage = request.triageResult;

      // Build a comprehensive aiAnalysis field combining transcription + triage
      const aiAnalysis = [
        `═══ STT TRANSCRIPTION ═══`,
        request.transcriptText,
        ``,
        `═══ LLM TRIAGE ANALYSIS ═══`,
        `Session: ${triage.session_id}`,
        `Urgency Level: ${triage.urgency_level}`,
        `Latency: ${triage.latency_ms}ms`,
        ``,
        `Reasoning:`,
        triage.reasoning,
        ``,
        `Next Steps:`,
        triage.next_steps,
        ``,
        `Red Flags:`,
        triage.red_flags.map((f: string) => `  • ${f}`).join('\n'),
        ``,
        `Disclaimer: ${triage.disclaimer}`,
      ].join('\n');

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'stt',
        subType: `transcription_${request.model}_triaged`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.transcriptText,
          structuredData: {
            sessionId: request.sessionId,
            language: request.language,
            model: request.model,
            triageSessionId: triage.session_id,
            urgencyLevel: triage.urgency_level,
            triageLatencyMs: triage.latency_ms,
            redFlags: triage.red_flags,
          },
          aiAnalysis,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'STT_TRIAGE_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `STT transcription with triage analysis created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },
  },

  // ── TTS (Text-to-Speech) Processing (Express REST API) ──
  tts: {
    _request: async <T>(path: string, body?: unknown): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `TTS API error (${response.status})`,
        );
      }

      const data = await response.json();
      return data as T;
    },

    /**
     * POST /api/tts/synthesize
     * Synthesizes text to speech using OpenAI TTS.
     * Returns base64-encoded audio data.
     */
    synthesize: async (params: TtsSynthesizeRequest): Promise<TtsSynthesizeResponse> => {
      const result = await api.tts._request<{
        success: boolean;
        audioBase64: string;
        contentType: string;
        text: string;
        voice: string;
        model: string;
      }>('/api/tts/synthesize', params);

      return result;
    },

    /**
     * POST /api/tts/synthesize-stream
     * Synthesizes text to speech and returns the raw audio blob.
     * Useful for playing audio directly in the browser.
     */
    synthesizeStream: async (params: TtsSynthesizeRequest): Promise<Blob> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}/api/tts/synthesize-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `TTS stream error (${response.status})`,
        );
      }

      return response.blob();
    },
  },

  // ── X-Ray Analysis (Express REST API) ──
  xray: {
    _request: async <T>(path: string, body?: FormData): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `X-Ray API error (${response.status})`);
      }
      return response.json() as Promise<T>;
    },

    /**
     * POST /api/xray/classify
     * Upload an X-ray image for medical condition classification.
     */
    classify: async (
      file: File | Blob,
      fileName: string,
      target: string = 'chest',
    ): Promise<XRayClassifyResponse> => {
      const formData = new FormData();
      formData.append('file', file, fileName);

      const result = await api.xray._request<{
        success: boolean;
        data: Record<string, unknown>;
        processedAt: string;
        source: string;
        target: string;
      }>(`/api/xray/classify?target=${encodeURIComponent(target)}`, formData);

      return result;
    },

    /**
     * Saves X-ray classification results as a diagnostic report in Firestore.
     */
    saveReport: async (request: XRaySaveReportRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'radiology',
        subType: `xray_${request.target}`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawData,
          structuredData: { target: request.target },
          aiAnalysis: `X-Ray classification (${request.target}):\n${request.rawData}`,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'XRAY_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `X-Ray report created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },

    /**
     * Saves X-ray classification results combined with LLM triage analysis.
     */
    saveReportWithTriage: async (request: XRaySaveReportWithTriageRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const triage = request.triageResult;

      const aiAnalysis = [
        `═══ X-RAY CLASSIFICATION ═══`,
        request.rawData,
        ``,
        `═══ LLM TRIAGE ANALYSIS ═══`,
        `Session: ${triage.session_id}`,
        `Urgency Level: ${triage.urgency_level}`,
        `Latency: ${triage.latency_ms}ms`,
        ``,
        `Reasoning:`,
        triage.reasoning,
        ``,
        `Next Steps:`,
        triage.next_steps,
        ``,
        `Red Flags:`,
        triage.red_flags.map((f: string) => `  • ${f}`).join('\n'),
        ``,
        `Disclaimer: ${triage.disclaimer}`,
      ].join('\n');

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'radiology',
        subType: `xray_${request.target}_triaged`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawData,
          structuredData: {
            target: request.target,
            triageSessionId: triage.session_id,
            urgencyLevel: triage.urgency_level,
            triageLatencyMs: triage.latency_ms,
            redFlags: triage.red_flags,
          },
          aiAnalysis,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'XRAY_TRIAGE_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `X-Ray report with triage created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },
  },

  // ── Visual Symptom Analysis (Express REST API) ──
  visual: {
    _request: async <T>(path: string, body?: FormData): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Visual API error (${response.status})`);
      }
      return response.json() as Promise<T>;
    },

    /**
     * POST /api/visual/analyze
     * Upload a symptom photo for clinical indicator analysis.
     */
    analyze: async (
      file: File | Blob,
      fileName: string,
      target: string = 'skin',
    ): Promise<VisualAnalyzeResponse> => {
      const formData = new FormData();
      formData.append('file', file, fileName);

      const result = await api.visual._request<{
        success: boolean;
        data: Record<string, unknown>;
        processedAt: string;
        source: string;
        target: string;
      }>(`/api/visual/analyze?target=${encodeURIComponent(target)}`, formData);

      return result;
    },

    /**
     * Saves visual analysis results as a diagnostic report in Firestore.
     */
    saveReport: async (request: VisualSaveReportRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'symptom',
        subType: `visual_${request.target}`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawData,
          structuredData: { target: request.target },
          aiAnalysis: `Visual symptom analysis (${request.target}):\n${request.rawData}`,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'VISUAL_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `Visual analysis report created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },

    /**
     * Saves visual analysis results combined with LLM triage analysis.
     */
    saveReportWithTriage: async (request: VisualSaveReportWithTriageRequest): Promise<string> => {
      const reportRef = doc(collection(db, 'reports'));
      const reportId = reportRef.id;
      const timestamp = new Date().toISOString();

      const triage = request.triageResult;

      const aiAnalysis = [
        `═══ VISUAL SYMPTOM ANALYSIS ═══`,
        request.rawData,
        ``,
        `═══ LLM TRIAGE ANALYSIS ═══`,
        `Session: ${triage.session_id}`,
        `Urgency Level: ${triage.urgency_level}`,
        `Latency: ${triage.latency_ms}ms`,
        ``,
        `Reasoning:`,
        triage.reasoning,
        ``,
        `Next Steps:`,
        triage.next_steps,
        ``,
        `Red Flags:`,
        triage.red_flags.map((f: string) => `  • ${f}`).join('\n'),
        ``,
        `Disclaimer: ${triage.disclaimer}`,
      ].join('\n');

      const report: Omit<DiagnosticReport, 'id'> = {
        patientId: request.patientId,
        patientName: request.patientName,
        category: 'symptom',
        subType: `visual_${request.target}_triaged`,
        status: 'pending',
        confidence: request.confidence,
        content: {
          rawText: request.rawData,
          structuredData: {
            target: request.target,
            triageSessionId: triage.session_id,
            urgencyLevel: triage.urgency_level,
            triageLatencyMs: triage.latency_ms,
            redFlags: triage.red_flags,
          },
          aiAnalysis,
        },
        createdAt: timestamp,
      };

      await setDoc(reportRef, report);

      eventBus.emit({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          patientId: request.patientId,
          newStatus: 'In Triage',
          event: {
            id: reportId,
            entityType: 'REPORT',
            entityId: reportId,
            action: 'VISUAL_TRIAGE_REPORT_CREATED',
            performedBy: 'system',
            role: 'clinician',
            timestamp,
            reason: `Visual analysis report with triage created for patient ${request.patientName}`,
          },
        },
      });

      return reportId;
    },
  },

  // ── LLM + RAG Pipeline (Express REST API) ──
  llm: {
    _request: async <T>(path: string, body?: unknown, method?: 'GET' | 'POST'): Promise<T> => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: method || (body ? 'POST' : 'GET'),
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `LLM API error (${response.status})`,
        );
      }

      const data = await response.json();
      return data as T;
    },

    /**
     * GET /api/llm/health
     * Returns the health status and current model info from the LLM service.
     */
    health: async (): Promise<LLMHealth> => {
      const result = await api.llm._request<{
        success: boolean;
        status: string;
        rag_ready: boolean;
        model: string;
        version: string;
      }>('/api/llm/health');

      return {
        status: result.status,
        rag_ready: result.rag_ready,
        model: result.model,
        version: result.version,
      };
    },

    /**
     * POST /api/llm/triage
     * Sends a patient case to the LLM for triage analysis.
     */
    triage: async (params: {
      symptoms: string;
      patient_case?: string;
      chief_complaint?: string;
      vitals?: {
        hr?: number;
        o2_sat?: number;
        bp?: string;
        temp?: number;
        rr?: number;
      };
    }): Promise<TriageResult> => {
      const result = await api.llm._request<{
        success: boolean;
        session_id: string;
        urgency_level: string;
        reasoning: string;
        next_steps: string;
        red_flags: string[];
        disclaimer: string;
        latency_ms: number;
      }>('/api/llm/triage', params);

      return {
        session_id: result.session_id,
        urgency_level: result.urgency_level,
        reasoning: result.reasoning,
        next_steps: result.next_steps,
        red_flags: result.red_flags,
        disclaimer: result.disclaimer,
        latency_ms: result.latency_ms,
      };
    },

    /**
     * POST /api/llm/chat
     * Follow-up chat for an existing triage session.
     */
    chat: async (params: {
      session_id: string;
      message: string;
    }): Promise<ChatResult> => {
      const result = await api.llm._request<{
        success: boolean;
        session_id: string;
        reply: string;
        disclaimer: string;
      }>('/api/llm/chat', params);

      return {
        session_id: result.session_id,
        reply: result.reply,
        disclaimer: result.disclaimer,
      };
    },

    /**
     * POST /api/llm/rebuild-index
     * Triggers a full rebuild of the BM25 keyword index.
     */
    rebuildIndex: async (): Promise<{ status: string; message: string }> => {
      return api.llm._request('/api/llm/rebuild-index', undefined, 'POST');
    },
  },
};

/**
 * Standalone analytics aggregation service — feeds the Clinical Command Center dashboard.
 * Always uses live aggregation because it needs temporal chart data and
 * actionable alerts that the pre-computed analytics snapshot doesn't provide.
 *
 * The pre-computed snapshot optimization applies to api.analytics.getSnapshot()
 * (used by AnalyticsDashboardView), which only needs aggregate metrics.
 */
export const analyticsService = {
  getSnapshot: async (): Promise<{
    metrics: {
      activeTriageCount: number;
      modelConsensusRate: number;
      kioskUptimeRate: number;
      averageVelocityMinutes: number;
    };
    volumeChartData: Array<{ hour: string; count: number }>;
    actionableAlerts: Array<{
      id: string;
      type: 'critical' | 'warning' | 'info';
      source: string;
      message: string;
      timestamp: string;
    }>;
  }> => {
    // ── Live client-side aggregation ──
    const [patientsSnap, kiosksSnap, modelsSnap] = await Promise.all([
      getDocs(collection(db, 'patients')),
      getDocs(collection(db, 'kiosks')),
      getDocs(collection(db, 'modelWeights')),
    ]);

    const patients = patientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as TriageRecord));
    const kiosks = kiosksSnap.docs.map(d => ({ id: d.id, ...d.data() } as KioskTerminal));
    const models = modelsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ModelWeight));

    // Compute live operational metrics
    const activeTriage = patients.filter(p => p.status === 'Registered' || p.status === 'In Triage');
    const activeModels = models.length > 0 ? models : [];
    const avgConsensus = activeModels.reduce((acc, curr) => acc + (curr.accuracyRate || 0.94), 0) / (activeModels.length || 1);
    const totalKiosks = kiosks.length;
    const onlineKiosks = kiosks.filter(k => k.status === 'online').length;
    const uptimeRate = totalKiosks > 0 ? (onlineKiosks / totalKiosks) * 100 : 100;

    // Aggregate patient volume over the last 24 hours into hourly time-buckets
    const hourlyBuckets: Record<string, number> = {};
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const targetHour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const label = targetHour.toLocaleTimeString([], { hour: '2-digit', hour12: false }) + ':00';
      hourlyBuckets[label] = 0;
    }

    patients.forEach(patient => {
      if (patient.timestamp) {
        const pDate = new Date(patient.timestamp);
        if (now.getTime() - pDate.getTime() <= 24 * 60 * 60 * 1000) {
          const label = pDate.toLocaleTimeString([], { hour: '2-digit', hour12: false }) + ':00';
          if (hourlyBuckets[label] !== undefined) {
            hourlyBuckets[label]++;
          }
        }
      }
    });

    const volumeChartData = Object.keys(hourlyBuckets).map(hour => ({
      hour,
      count: hourlyBuckets[hour],
    }));

    // Generate native operational alerts directly from live device & record friction points
    const actionableAlerts: Array<{
      id: string;
      type: 'critical' | 'warning' | 'info';
      source: string;
      message: string;
      timestamp: string;
    }> = [];

    kiosks.forEach(k => {
      if (k.status === 'offline') {
        actionableAlerts.push({
          id: `kiosk-err-${k.id}`,
          type: 'critical',
          source: `Kiosk ${k.id}`,
          message: `Peripheral communication loss. System reported offline at hub: ${k.facilityName || 'Global'}.`,
          timestamp: 'Immediate',
        });
      }
    });

    patients.forEach(p => {
      if (p.triageCategory === 'Emergency' || p.status === 'Needs Review') {
        actionableAlerts.push({
          id: `patient-warn-${p.id}`,
          type: 'warning',
          source: 'Triage Terminal',
          message: `High-urgency structural shift detected for Patient Reference ${p.id.substring(0, 8)}. Manual clinical validation required.`,
          timestamp: 'Live',
        });
      }
    });

    return {
      metrics: {
        activeTriageCount: activeTriage.length,
        modelConsensusRate: Math.round(avgConsensus * 100),
        kioskUptimeRate: Math.round(uptimeRate),
        averageVelocityMinutes: activeTriage.length > 0 ? Math.round((kiosks.reduce((sum, k) => sum + k.currentQueue, 0) || 1) * 10 / activeTriage.length) : 0,
      },
      volumeChartData,
      actionableAlerts: actionableAlerts.slice(0, 5), // Limit feed display depth
    };
  },

  // ── Data Management ──
  dataManagement: {
    /**
     * Purge all test/dummy data from Firestore.
     * Preserves: users (login roles), settings (app config).
     * Returns a summary of what was deleted.
     */
    purgeAllTestData: async (): Promise<{ deletedCounts: Record<string, number>; errors: string[] }> => {
      const collectionsToWipe = [
        'patients',
        'reports',
        'auditLogs',
        'notifications',
        'kiosks',
        'organizations',
        'regions',
        'facilities',
        'systemHealth',
        'modelWeights',
        'analytics',
      ];

      const deletedCounts: Record<string, number> = {};
      const errors: string[] = [];

      for (const collName of collectionsToWipe) {
        try {
          const colRef = collection(db, collName);
          const snapshot = await getDocs(colRef);

          if (snapshot.size === 0) {
            deletedCounts[collName] = 0;
            continue;
          }

          // Delete in batches (Firestore writeBatch limit is 500)
          let deleted = 0;
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += 450) {
            const chunk = docs.slice(i, i + 450);
            const promises = chunk.map(docSnap =>
              deleteDoc(doc(db, collName, docSnap.id))
            );
            await Promise.all(promises);
            deleted += chunk.length;
          }
          deletedCounts[collName] = deleted;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${collName}: ${message}`);
          deletedCounts[collName] = -1;
        }
      }

      return { deletedCounts, errors };
    },
  },
};

