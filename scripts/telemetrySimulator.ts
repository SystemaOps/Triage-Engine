import { api } from '../src/lib/api';

const DELAY = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MOCK_ACTIONS = [
  { action: 'TOKEN_ROTATION', actor: 'sysops-daemon-alpha', role: 'System Admin', targetResource: 'auth-layer/v2', severity: 'info' as const },
  { action: 'THRESHOLD_OVERRIDE', actor: 'Dr. Sarah Jenkins', role: 'admin', targetResource: 'models/triage-v4', severity: 'warning' as const },
  { action: 'NODE_DISCONNECT', actor: 'edge-watchdog', role: 'Operator', targetResource: 'kiosks/HW-AMD-IX07', severity: 'critical' as const },
  { action: 'CONFIG_COMMIT', actor: 'Marcus Vance', role: 'Operator', targetResource: 'settings/manifest', severity: 'info' as const },
];

const STATUSES: ('online' | 'degraded' | 'offline')[] = ['online', 'online', 'degraded', 'offline'];

interface ChaosOptions {
  cycles: number;
  frequencyMs: number;
  onLog?: (message: string) => void;
}

export async function runTelemetryChaosEngine({ cycles, frequencyMs, onLog }: ChaosOptions) {
  const log = (msg: string) => onLog ? onLog(msg) : console.log(msg);

  log('🚀 [Chaos Engine] Initializing memory stress sequence...');

  // Resolve current live state array from existing subscription hooks
  let kiosks: any[] = [];
  const unsubscribe = api.kiosks.subscribeToKiosks((data) => { kiosks = data; });

  // Wait for initial handshake
  await DELAY(1500);

  if (kiosks.length === 0) {
    log('⚠️ [Chaos Engine] Aborted: Empty kiosk cluster registry.');
    unsubscribe();
    return;
  }

  log(`🛰️ [Chaos Engine] Injection vector targeted at ${kiosks.length} online nodes.`);

  for (let i = 0; i < cycles; i++) {
    try {
      // Vector A: Mutate random kiosk link-state
      const targetKiosk = kiosks[Math.floor(Math.random() * kiosks.length)];
      const randomStatus = STATUSES[Math.floor(Math.random() * STATUSES.length)];

      log(`⚡ [Cycle ${i + 1}/${cycles}] Patching Node [${targetKiosk.name || targetKiosk.hardwareId || targetKiosk.id}]: Link-State -> ${randomStatus}`);

      await api.kiosks.updateKioskStatus(targetKiosk.id, randomStatus, 'chaos-monkey');

      // Vector B: Spontaneous high-throughput Ledger breach simulation
      if (Math.random() > 0.3) {
        const template = MOCK_ACTIONS[Math.floor(Math.random() * MOCK_ACTIONS.length)];
        const fakeHash = `0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`;

        log(`🔒 [Ledger Write] Appending log: ${template.action} (${template.severity})`);

        await api.auditLogs.createEntry({
          action: template.action,
          actor: template.actor,
          role: template.role,
          targetResource: template.targetResource,
          severity: template.severity,
          timestamp: new Date().toISOString(),
          txHash: fakeHash,
        });
      }
    } catch (err: any) {
      log(`❌ [Error Injection] Step mutation dropped: ${err.message || err}`);
    }

    await DELAY(frequencyMs);
  }

  log('🏁 [Chaos Engine] Target stress boundary reached. Unsubscribing listeners.');
  unsubscribe();
}
