# Production Hardening & Deployment Guide

## Architecture

This application is a **pure client-side SPA** (Single Page Application).
All data operations go directly to Firebase Firestore from the browser.
No Node.js backend is required.

---

## 🔒 Firestore Security Rules Deployment

Your `firestore.rules` file implements production-grade RBAC-aware security rules.

### Step 1: Deploy Rules to Firebase Console

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

### Step 2: Verify Rules are Active

1. Go to Firebase Console → Firestore → Rules tab
2. Confirm the new rules are deployed and in "Live Mode"

---

## 🌍 Environment-Based Configuration

The app uses Vite environment variables prefixed with `VITE_`.

### Environment Files

- **`.env.development`** — Development (default)
- **`.env.staging`** — Staging (`--mode staging`)
- **`.env.production`** — Production (`--mode production`)

Reference: `.env.example` documents all required variables.

### Building

```bash
npm run dev              # Development server
npm run build            # Default build
npm run build:staging    # Staging build
npm run build:production # Production build
```

---

## 🌱 Database Seeding

```bash
npm run seed              # Seed development
npm run seed:staging      # Seed staging
npm run seed:production   # Seed production
```

---

## 🔐 RBAC Implementation Details

### Role-Based Access Control

Roles: `admin`, `clinician`, `kiosk_operator`, `device_provider`, `insurance_partner`, `public_health`, `caregiver`, `patient`

### Collection-Level Permissions

| Collection | Read | Create | Update | Delete |
|-----------|------|--------|--------|--------|
| **organizations** | All Auth | Admin | Admin | Admin |
| **regions** | All Auth | Admin | Admin | Admin |
| **kiosks** | All Auth | Admin | Auth (metrics) | Admin |
| **modelWeights** | All Auth | Admin | Admin | Admin |
| **auditLogs** | All Auth | Auth | ❌ Blocked | ❌ Blocked |
| **patients** | Clinician+ | Clinician | Clinician | Admin |
| **reports** | Clinician+ | System | System | Admin |
| **settings** | Admin | Admin | Admin | Admin |

### Audit Log Immutability

The `auditLogs` collection is **append-only**: creates allowed (with txHash), updates and deletions blocked.

---

## ✅ Security Checklist

- [ ] Firestore security rules deployed
- [ ] Custom claims (role) configured in Firebase Auth
- [ ] All 7 `VITE_FIREBASE_*` secrets configured in CI/CD secrets
- [ ] `.env.production` never committed to git
- [ ] HTTPS enabled (automatic with Firebase Hosting)
- [ ] Backup strategy configured

---

## 🚀 Production Deployment (Firebase Hosting)

```bash
npm run build:production
firebase deploy --only hosting
```

App is served at `https://your-project.web.app` with:
- SSL/TLS encryption
- CDN distribution
- RBAC enforced by Firestore security rules

---

## 🔍 Monitoring & Observability

1. **Firebase Console Dashboard** — Firestore read/write counts, Auth metrics, error rates
2. **Security Rules Violations** — Firestore Rules → Logs
3. **Audit Logs** — In-app at `/logs` tab

---

## 🆘 Troubleshooting

### "Permission denied" errors

**Cause:** User missing role in custom claims
**Solution:** Firebase Console → Authentication → Users → Custom Claims → `{ "role": "admin" }`

### Build fails with missing env vars

**Solution:** Copy `.env.example` to `.env.{mode}` and fill in Firebase credentials.

---

## 📚 Additional Resources

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase Best Practices](https://firebase.google.com/docs/firestore/best-practices)
