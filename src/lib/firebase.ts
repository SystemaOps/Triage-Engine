/**
 * Firebase Initialization Module
 * ================================
 *
 * Standalone singleton that initializes Firebase and exports the shared
 * app, Firestore, and Auth instances.
 *
 * This module exists specifically to break the circular dependency between
 * App.tsx (which renders the React tree) and AuthContext.tsx (which needs
 * access to the Firebase auth and db instances).
 *
 * Both App.tsx and AuthContext.tsx (and any other module) should import
 * from this module instead of importing from each other.
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth();
