import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Role } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: Role | null;
  roleLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  roleLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // ── Listen for Firebase Auth state changes ──
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
  }, []);

  // ── Fetch the user's role from Firestore users/{uid} ──
  // This is the system of record for RBAC (see src/lib/rbac.ts).
  // The role is stored in the Firestore 'users' collection, not in
  // Firebase custom claims, to keep role management auditable.
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchRole() {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled) {
          if (userDoc.exists()) {
            const data = userDoc.data() as { role?: Role };
            setRole(data.role ?? null);
          } else {
            setRole(null);
          }
          setRoleLoading(false);
        }
      } catch (err) {
        console.error('[AuthContext] Failed to fetch user role from Firestore:', err);
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
      }
    }

    fetchRole();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, role, roleLoading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
