import { db, auth } from '../App';
import { collection, getDocs, getDoc, doc, runTransaction, updateDoc, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { TriageRecord, TraceEvent, Role, AppSettings, AppNotification, UserAccount, Facility, Organization, SubsystemHealth, TriageAnalyticsSnapshot, KioskTerminal, ModelWeight, AuditEntry, Region, DiagnosticReport, DisagreementCategory } from '../types';
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
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'organizations'));
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching organizations:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
    },
    subscribeToRegions: (onUpdate: (data: Region[]) => void) => {
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'regions'));
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Region));
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching regions:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
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
          role: 'admin', // Should be dynamic
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
        // Mocking onSnapshot with a set interval for demonstration
        const interval = setInterval(async () => {
             const snapshot = await getDocs(collection(db, 'systemHealth'));
             const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubsystemHealth));
             onUpdate(services);
        }, 5000);
        return () => clearInterval(interval);
    }
  },
  kiosks: {
    getAll: async () => {
      const snapshot = await getDocs(collection(db, 'kiosks'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KioskTerminal));
    },
    subscribeToKiosks: (onUpdate: (data: KioskTerminal[]) => void) => {
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'kiosks'));
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KioskTerminal));
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching kiosks:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
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
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'modelWeights'));
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ModelWeight));
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching model weights:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
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
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'auditLogs'));
          const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as AuditEntry))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 100);
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching audit logs:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
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
      const unsubscribe = setInterval(async () => {
        try {
          const snapshot = await getDocs(collection(db, 'reports'));
          const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as DiagnosticReport))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          onUpdate(data);
        } catch (error) {
          console.error('Error fetching reports:', error);
        }
      }, 3000);
      return () => clearInterval(unsubscribe);
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
        averageVelocityMinutes: 4.2, // Static standard clinical KPI metric
      },
      volumeChartData,
      actionableAlerts: actionableAlerts.slice(0, 5), // Limit feed display depth
    };
  },
};
