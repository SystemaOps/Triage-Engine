import React, { useState, useEffect } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { Facility, Role, Organization, Region } from '../types';
import { useAuth } from '../context/AuthContext';
import { Building2, MapPin, Plus, Edit2, Check, X } from 'lucide-react';

const facilityTypes: Array<{ value: Facility['type']; label: string }> = [
  { value: 'hospital', label: 'Hospital / Trauma Core' },
  { value: 'clinic', label: 'Outpatient Clinic' },
  { value: 'kiosk_hub', label: 'Stand-alone Kiosk Hub' },
];

const defaultFacilityForm = {
  name: '',
  type: 'kiosk_hub' as Facility['type'],
  address: '',
  orgId: '',
  regionId: '',
};

type ModalMode = 'org' | 'region' | 'facility' | null;

export default function OrganizationManagementView({ userRole }: { userRole: Role }) {
  const { user } = useAuth();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Org state
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newOrgName, setNewOrgName] = useState('');
  const [editOrgId, setEditOrgId] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionOrgId, setNewRegionOrgId] = useState('');
  const [facilityForm, setFacilityForm] = useState(defaultFacilityForm);

  useEffect(() => {
    setIsLoadingData(true);
    const unsubscribeOrgs = api.organizations.subscribeToOrganizations((data) => {
      setOrganizations(data);
    });

    const unsubscribeRegions = api.organizations.subscribeToRegions((data) => {
      setRegions(data);
      setIsLoadingData(false);
    });

    return () => {
      unsubscribeOrgs();
      unsubscribeRegions();
    };
  }, []);

  const resetForms = () => {
    setNewOrgName('');
    setEditOrgId(null);
    setEditOrgName('');
    setNewRegionName('');
    setNewRegionOrgId(organizations[0]?.id || '');
    setFacilityForm(defaultFacilityForm);
    setError(null);
  };

  const openModal = (mode: ModalMode) => {
    resetForms();
    if (mode === 'region') {
      setNewRegionOrgId(organizations[0]?.id || '');
    }
    if (mode === 'facility') {
      setFacilityForm({
        ...defaultFacilityForm,
        orgId: organizations[0]?.id || '',
        regionId: regions[0]?.id || '',
      });
    }
    setModalMode(mode);
  };

  const closeModal = () => {
    setModalMode(null);
    resetForms();
  };

  // ── Create Organization ──
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newOrgName.trim()) {
      setError('Organization name is required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.organizations.createOrganization(newOrgName.trim(), user.uid);
      closeModal();
    } catch (err) {
      setError('Failed to create organization. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Update Organization ──
  const handleUpdateOrg = async (orgId: string) => {
    if (!user) return;
    try {
      await api.organizations.updateOrganization(orgId, { name: editOrgName }, user.uid);
      setEditOrgId(null);
      setEditOrgName('');
    } catch (err) {
      setError('Failed to update organization.');
    }
  };

  // ── Create Region ──
  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newRegionName.trim() || !newRegionOrgId) {
      setError('Region name and organization are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.organizations.createRegion(newRegionName.trim(), newRegionOrgId, user.uid);
      closeModal();
    } catch (err) {
      setError('Failed to create region. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Create Facility ──
  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Authentication required.');
      return;
    }
    if (!facilityForm.name.trim() || !facilityForm.address.trim()) {
      setError('Facility name and address are required.');
      return;
    }
    if (!facilityForm.orgId || !facilityForm.regionId) {
      setError('Organization and region must be selected.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.organizations.createFacility(
        {
          name: facilityForm.name.trim(),
          type: facilityForm.type,
          address: facilityForm.address.trim(),
          orgId: facilityForm.orgId,
          regionId: facilityForm.regionId,
        },
        user.uid,
      );
      closeModal();
    } catch (err) {
      setError('Failed to create facility. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const regionsByOrg = (orgId: string) => regions.filter((r) => r.orgId === orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Management"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openModal('org')}
              className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus size={16} /> Add Organization
            </button>
            <button
              type="button"
              onClick={() => openModal('region')}
              disabled={organizations.length === 0}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Plus size={16} /> Add Region
            </button>
            <button
              type="button"
              onClick={() => openModal('facility')}
              disabled={organizations.length === 0 || regions.length === 0}
              className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
            >
              <Plus size={16} /> Add Facility
            </button>
          </div>
        }
      />

      {isLoadingData ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-slate-400 animate-pulse">Loading organizational hierarchy...</p>
        </Card>
      ) : organizations.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">No organizations configured</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Organization" to create your first organization.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {organizations.map((org) => (
            <Card key={org.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Building2 size={20} />
                  </div>
                  <div>
                    {editOrgId === org.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editOrgName}
                          onChange={(e) => setEditOrgName(e.target.value)}
                          className="text-sm font-bold border border-slate-200 rounded-lg px-2 py-1"
                        />
                        <button
                          onClick={() => handleUpdateOrg(org.id)}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => { setEditOrgId(null); setEditOrgName(''); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">{org.name}</h3>
                        <button
                          onClick={() => { setEditOrgId(org.id); setEditOrgName(org.name); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 font-mono">ID: {org.id.substring(0, 12)}...</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  org.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                }`}>
                  {org.status}
                </span>
              </div>

              {/* Regions */}
              <div className="ml-13 pl-4 border-l-2 border-slate-100 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MapPin size={14} /> Regions ({regionsByOrg(org.id).length})
                </p>
                {regionsByOrg(org.id).length === 0 ? (
                  <p className="text-xs text-slate-400 ml-6">No regions configured for this organization.</p>
                ) : (
                  regionsByOrg(org.id).map((region) => (
                    <div key={region.id} className="ml-4 flex items-center gap-2 text-sm text-slate-700">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="font-medium">{region.name}</span>
                      <span className="text-xs text-slate-400 font-mono">({region.id.substring(0, 8)}...)</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Create Organization */}
      {modalMode === 'org' && (
        <ModalShell title="Create Organization" onClose={closeModal}>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <label className="space-y-1.5 text-sm text-slate-700">
              Organization Name
              <input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g., Apex Health Systems"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                autoFocus
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60">
                {isSubmitting ? 'Creating...' : 'Create Organization'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Create Region */}
      {modalMode === 'region' && (
        <ModalShell title="Create Region" onClose={closeModal}>
          <form onSubmit={handleCreateRegion} className="space-y-4">
            <label className="space-y-1.5 text-sm text-slate-700">
              Region Name
              <input
                value={newRegionName}
                onChange={(e) => setNewRegionName(e.target.value)}
                placeholder="e.g., Northeast Regional Hub"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                autoFocus
              />
            </label>
            <label className="space-y-1.5 text-sm text-slate-700">
              Parent Organization
              <select
                value={newRegionOrgId}
                onChange={(e) => setNewRegionOrgId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                {isSubmitting ? 'Creating...' : 'Create Region'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Create Facility */}
      {modalMode === 'facility' && (
        <ModalShell title="Create Facility" onClose={closeModal}>
          <form onSubmit={handleCreateFacility} className="space-y-4">
            <label className="space-y-1.5 text-sm text-slate-700">
              Facility Name
              <input
                value={facilityForm.name}
                onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                placeholder="e.g., Downtown Medical Center"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                autoFocus
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1.5 text-sm text-slate-700">
                Organization
                <select
                  value={facilityForm.orgId}
                  onChange={(e) => setFacilityForm({ ...facilityForm, orgId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm text-slate-700">
                Region
                <select
                  value={facilityForm.regionId}
                  onChange={(e) => setFacilityForm({ ...facilityForm, regionId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
                >
                  {regions
                    .filter((r) => r.orgId === facilityForm.orgId)
                    .map((region) => (
                      <option key={region.id} value={region.id}>{region.name}</option>
                    ))}
                </select>
              </label>
            </div>
            <label className="space-y-1.5 text-sm text-slate-700">
              Facility Type
              <select
                value={facilityForm.type}
                onChange={(e) => setFacilityForm({ ...facilityForm, type: e.target.value as Facility['type'] })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-900"
              >
                {facilityTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm text-slate-700">
              Address
              <input
                value={facilityForm.address}
                onChange={(e) => setFacilityForm({ ...facilityForm, address: e.target.value })}
                placeholder="100 Medical Center Pkwy"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-60">
                {isSubmitting ? 'Creating...' : 'Create Facility'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
}

// ── Modal Shell Component ──
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
