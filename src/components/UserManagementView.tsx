import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, UserAccount } from '../types';
import { can } from '../lib/rbac';
import { useAuth } from '../context/AuthContext';

const roleBadgeStyle = (role: Role) => {
  switch (role) {
    case 'admin': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    case 'clinician': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'kiosk_operator': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'device_provider': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    case 'insurance_partner': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'public_health': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'caregiver': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    case 'patient': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
};

export default function UserManagementView({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchUsers() {
      try {
        const data = await api.users.getAll();
        if (!cancelled) {
          setUsers(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    }
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleToggleStatus = useCallback(async (targetUser: UserAccount) => {
    const newStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    setUpdatingId(targetUser.id);
    try {
      // Compliance Traceability: Transactional update with audit logging
      await api.users.update(targetUser.id, { status: newStatus }, currentUser?.uid ?? 'unknown', userRole, `Status toggled to ${newStatus}`);
    } catch (err) {
      console.error('Compliance violation in status mutation:', err);
    } finally {
      setUpdatingId(null);
    }
  }, [currentUser, userRole]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-slate-900">Identity Access Control</h1>
            <p className="text-slate-500 mt-2">Administrative management of the 8-role security matrix.</p>
          </div>
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-500 shadow-sm">
            SYSTEM_SYNC: ACTIVE
          </div>
        </div>

        {/* Data Grid */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-500">
                <th className="py-4 px-6">Principal Identifier</th>
                <th className="py-4 px-6">Account Metadata</th>
                <th className="py-4 px-6">Role Assignment</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="py-20 text-center text-slate-400 font-mono">LOADING_REGISTRY...</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="group hover:bg-slate-50 transition-colors">
                  <td className="py-4 px-6 font-mono text-xs text-slate-400">{user.id}</td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-slate-900">{user.name}</div>
                    <div className="text-xs font-mono text-slate-500">{user.email}</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${roleBadgeStyle(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    {can(userRole, 'UPDATE_STATUS') && (
                      <button
                        onClick={() => handleToggleStatus(user)}
                        disabled={updatingId === user.id}
                        className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        {updatingId === user.id ? 'PENDING...' : 'TOGGLE_STATUS'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
