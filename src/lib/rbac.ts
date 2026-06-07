import { Role, Action } from '../types';

/**
 * Permission matrix defining granular access boundaries for all 8 role types.
 *
 * Clinicians are the only role with direct patient data access.
 * Admin is strongly restricted — no patient data per MVP rule.
 * Device and kiosk roles are isolated from clinical data entirely.
 * Insurance and public_health see only aggregate/redacted views.
 */
const permissionMatrix: Record<Role, Action[]> = {
  // ── MVP: No portal access ──
  patient: [],

  // ── MVP: No portal access ──
  caregiver: [
    'VIEW_STATUS',
  ],

  // ── Full clinical workspace ──
  clinician: [
    'START_TRIAGE',
    'VIEW_CASE',
    'ASSIGN_DOCTOR',
    'UPDATE_STATUS',
    'RESOLVE_CASE',
    'VIEW_STATUS',
    'VIEW_PATIENTS',
    'VIEW_REPORTS',
    'VERIFY_REPORT',
    'VIEW_MODELS',
    'ACTIVATE_MODEL',
    'ROLLBACK_MODEL',
    'VIEW_LOGS',
    'ACKNOWLEDGE_NOTIFICATION',
    'VIEW_ANALYTICS',
  ],

  // ── Device operations only, no patient data ──
  kiosk_operator: [
    'VIEW_STATUS',
    'RESTART_DEVICE',
    'CONFIGURE_DEVICE',
    'ACKNOWLEDGE_NOTIFICATION',
  ],

  // ── Device operations + infrastructure telemetry ──
  device_provider: [
    'VIEW_STATUS',
    'RESTART_DEVICE',
    'CONFIGURE_DEVICE',
    'VIEW_SYSTEM_HEALTH',
    'VIEW_LOGS',
    'ACKNOWLEDGE_NOTIFICATION',
  ],

  // ── Aggregate analytics only, redacted reports ──
  insurance_partner: [
    'VIEW_STATUS',
    'VIEW_REPORTS',
    'VIEW_ANALYTICS',
  ],

  // ── Population health analytics only ──
  public_health: [
    'VIEW_STATUS',
    'VIEW_ANALYTICS',
  ],

  // ── Strongly restricted, audited support access ──
  // Explicitly NO patient data (VIEW_PATIENTS, VIEW_CASE, START_TRIAGE, etc.)
  admin: [
    'VIEW_STATUS',
    'VIEW_REPORTS',
    'VIEW_LOGS',
    'EXPORT_LOGS',
    'RESTART_DEVICE',
    'CONFIGURE_DEVICE',
    'VIEW_MODELS',
    'MANAGE_USERS',
    'MANAGE_SETTINGS',
    'MANAGE_ORGANIZATION',
    'VIEW_SYSTEM_HEALTH',
    'ACKNOWLEDGE_NOTIFICATION',
    'VIEW_ANALYTICS',
  ],
};

export function can(role: Role, action: Action): boolean {
  return permissionMatrix[role]?.includes(action) ?? false;
}
