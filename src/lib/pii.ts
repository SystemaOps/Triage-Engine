import { Role } from '../types';

/**
 * Roles that are permitted to view patient-identifiable information.
 * All other roles see a redacted placeholder.
 *
 * This is the single source of truth for PII access boundaries.
 * Per MVP rules, only clinicians have patient data privileges.
 */
const CLINICAL_ROLES: Role[] = ['clinician'];

/**
 * Returns the patient name if the viewer has clinical privileges,
 * otherwise returns a redacted placeholder to enforce the zero-PII rule
 * for non-clinical roles (admin, kiosk_operator, device_provider, etc.).
 */
export function patientDisplayName(role: Role, name: string): string {
  return CLINICAL_ROLES.includes(role)
    ? name
    : '[REDACTED — CLINICAL PRIVILEGE REQUIRED]';
}
