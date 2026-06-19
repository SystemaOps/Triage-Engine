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
 * Common PHI patterns to scrub from unstructured text.
 * These cover the most common identifiers found in clinical notes
 * that are not caught by structural field filtering.
 */
const PHI_PATTERNS: RegExp[] = [
  // Patient names: "Patient John Doe presented..." or "Mr. Smith says..."
  /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Miss|Mx\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
  // Name-like patterns: "Patient [Name]" or "called [Name]" or "seen by [Name]"
  // Note: no /i flag — name portion must start with uppercase to avoid false positives
  // on lowercase verbs (e.g. "patient presented" should NOT match).
  // Keywords use [Pp] etc. to handle sentence-start capitalization.
  /\b(?:[Pp]atient|[Cc]alled|[Ss]een\s+by|[Cc]ontacted|[Rr]eferred\s+to|[Ss]poke\s+with)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Phone numbers (various formats)
  /\b(?:\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // SSN-like patterns (###-##-####)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Medical record / MRN patterns (alphanumeric, 6-12 chars, prefixed)
  /\b(?:MRN|mrn|medical\s+record|record\s+#?)\s*:?\s*[A-Za-z0-9]{6,12}\b/gi,
  // Date of birth patterns
  /\b(?:DOB|dob|date\s+of\s+birth|born)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi,
  // Address patterns (number + street name)
  /\b\d+\s+(?:[A-Z][a-z]+\s+)+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir)\b/g,
  // ZIP codes (with optional ZIP+4)
  /\b\d{5}(?:-\d{4})?\b/g,
];

/**
 * Scrubs common unstructured PHI patterns from a text string.
 * Replaces matches with a redaction marker.
 *
 * This is a best-effort heuristic filter. It does NOT guarantee
 * complete de-identification — downstream consumers should apply
 * additional NLP-based PHI detection for production use.
 */
export function stripPhiFromText(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  let cleaned = text;
  for (const pattern of PHI_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[PHI REDACTED]');
  }
  return cleaned;
}

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
