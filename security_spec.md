# Security Spec: Admin Portal for Medical Triage

## 1. Data Invariants
- `userId` must match `request.auth.uid`.
- `kioskId` must be a valid ID.
- `role` can only be updated by admins.
- `auditLogs` are immutable and can only be created.

## 2. The "Dirty Dozen" Payloads (for `users/1`)
1. **Privilege Escalation:** `{"role": "admin"}` (Update) - Should be DENIED if current user is not admin.
2. **Ghost Field:** `{"role": "doctor", "isAdmin": true}` (Create) - Should be DENIED (Invalid schema).
3. **Invalid Type:** `{"role": 123}` (Update) - Should be DENIED (Wrong type).
4. **Invalid Email:** `{"email": "invalid-email"}` (Update) - Should be DENIED (Invalid format).
5. **ID Poisoning:** `records/!@#$!@#$` (Create) - Should be DENIED (Invalid ID).
6. **Self-Assignment:** `users/new-user` (Create) - `role` field must be validated.
7. **PII Leak:** `read` on `users/1` by user `2` - Should be DENIED.
8. **Audit Tamper:** `auditLogs/1` (Update) - Should be DENIED (Immutable).
9. **Missing Required:** `{"userId": "1"}` (Create `users/1`) - Should be DENIED (Missing email/role).
10. **Terminal State Injection:** `records/1` where status is completed - Should be DENIED.
11. **Client ID Injection:** `users/other-user` (Update) - Should be DENIED.
12. **Unverified User Write:** `users/1` (Create) - Should be DENIED if `email_verified` is false.

## 3. Test Runner
*(To be implemented in `firestore.rules.test.ts`)*

## 4. Content Security Policy (CSP)

### 4.1 Policy (Enforced & Report-Only)

Two CSP headers are served via `firebase.json` — an **enforced** policy and a **Report-Only** policy with identical directives. The Report-Only mode surfaces violations in browser DevTools without blocking, allowing safe monitoring during rollout.

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://apis.google.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self'
  https://firestore.googleapis.com
  https://identitytoolkit.googleapis.com
  https://securetoken.googleapis.com
  wss://*.firebaseio.com;
frame-src 'self' https://*.firebaseapp.com;
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
manifest-src 'self';
upgrade-insecure-requests
```

### 4.2 Directive Rationale

| Directive | Value | PHI Compliance Rationale |
|-----------|-------|--------------------------|
| `default-src` | `'self'` | Baseline — all resources restricted to same origin unless overridden |
| `script-src` | `'self' 'unsafe-inline' https://apis.google.com` | `'unsafe-inline'` required for React JSX event handlers and dev HMR. `apis.google.com` required for Firebase Auth SDK |
| `style-src` | `'self' 'unsafe-inline'` | Required for Tailwind CSS and inline styles in React components. Inline styles are presentational only (no injection risk) |
| `img-src` | `'self' data: https:` | Allows data URIs (inline SVGs/icons) and HTTPS images. No user-uploaded image content |
| `font-src` | `'self' data:` | Self-hosted and inline icon fonts only |
| `connect-src` | `'self'` + Firebase/Google endpoints | Restricts XHR/fetch to Firebase services only — no external data exfiltration possible |
| `frame-src` | `'self' https://*.firebaseapp.com` | Allows Firebase Auth popup flows only |
| `object-src` | `'none'` | Blocks all `<object>`, `<embed>`, `<applet>` — prevents plugin-based attacks (CVE-2021-21224 vector) |
| `base-uri` | `'none'` | Prevents `<base>` tag injection — attackers cannot hijack relative URLs |
| `form-action` | `'self'` | Restricts form submissions to same origin — prevents phishing-style exfiltration via forms |
| `frame-ancestors` | `'none'` | Clickjacking defense at the CSP layer (defense-in-depth with `X-Frame-Options: DENY`) |
| `manifest-src` | `'self'` | Prevents malicious web manifest injection |
| `upgrade-insecure-requests` | _(boolean)_ | Forces all HTTP requests to HTTPS — prevents mixed-content warnings and MITM downgrade attacks |

### 4.3 Known Trade-offs

- **`unsafe-inline` in script-src:** This is an accepted trade-off for a React SPA. Modern React (19.x) does not support nonce-based or hash-based CSP for event handlers without a custom Babel plugin. The risk is mitigated because:
  - No user-generated content is rendered as HTML
  - No JSONP endpoints exist
  - All third-party scripts are loaded from `apis.google.com` only
- **`unsafe-inline` in style-src:** Tailwind CSS v4 generates inline styles. No user-controlled styles are injected.

### 4.4 Monitoring & Rollout

1. **Report-Only mode** is active alongside the enforced policy. Check browser DevTools → Issues tab for violations.
2. Before removing Report-Only, set up a `report-uri` or `report-to` endpoint (e.g., `https://<project>.report-uri.com`) to collect violation reports server-side.
3. The CSP was validated against Google's CSP Evaluator (csp-evaluator.withgoogle.com). No critical or high-severity findings. Standard React SPA trade-offs noted.

### 4.5 Deployment

CSP headers are configured in `firebase.json` under `hosting.headers`. Deploy with:

```bash
firebase deploy --only hosting
```

The GitHub Actions pipeline (`.github/workflows/deploy.yml`) automatically deploys on push to `main`.
