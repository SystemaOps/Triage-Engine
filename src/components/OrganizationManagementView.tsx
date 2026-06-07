import React, { useState, useEffect } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { Facility, Role, Organization, Region } from '../types';
import { useAuth } from '../context/AuthContext';

const facilityTypes: Array<{ value: Facility['type']; label: string }> = [
  { value: 'hospital', label: 'Hospital / Trauma Core' },
  { value: 'clinic', label: 'Outpatient Clinic' },
  { value: 'kiosk_hub', label: 'Stand-alone Kiosk Hub' },
];

const defaultFormData = {
  name: '',
  type: 'kiosk_hub' as Facility['type'],
  address: '',
  orgId: '',
  regionId: '',
};

export default function OrganizationManagementView({ userRole }: { userRole: Role }) {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(defaultFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    setIsLoadingData(true);
    const unsubscribeOrgs = api.organizations.subscribeToOrganizations((data) => {
      setOrganizations(data);
      if (data.length > 0 && !formData.orgId) {
        setFormData((prev) => ({ ...prev, orgId: data[0].id }));
      }
    });

    const unsubscribeRegions = api.organizations.subscribeToRegions((data) => {
      setRegions(data);
      if (data.length > 0 && !formData.regionId) {
        setFormData((prev) => ({ ...prev, regionId: data[0].id }));
      }
      setIsLoadingData(false);
    });

    return () => {
      unsubscribeOrgs();
      unsubscribeRegions();
    };
  }, []);

  const openModal = () => {
    setFormData({
      ...defaultFormData,
      orgId: organizations[0]?.id || '',
      regionId: regions[0]?.id || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
  };

  const handleSubmitFacility = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setFormError('Unable to register facility without an authenticated session.');
      return;
    }

    const trimmedName = formData.name.trim();
    const trimmedAddress = formData.address.trim();

    if (!trimmedName || !trimmedAddress) {
      setFormError('Facility name and address are required before committing to the org model.');
      return;
    }

    if (!formData.orgId || !formData.regionId) {
      setFormError('You must select both an organization and region.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await api.organizations.createFacility(
        {
          name: trimmedName,
          type: formData.type,
          address: trimmedAddress,
          orgId: formData.orgId,
          regionId: formData.regionId,
        },
        user.uid
      );
      setFormData({
        ...defaultFormData,
        orgId: organizations[0]?.id || '',
        regionId: regions[0]?.id || '',
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error('Clinical infrastructure registration write failed:', error);
      setFormError('Facility registration failed. Please retry or check your network connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOrg = organizations.find((org) => org.id === formData.orgId);
  const selectedRegion = regions.find((region) => region.id === formData.regionId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Management"
        action={
          <button
            type="button"
            onClick={openModal}
            disabled={isLoadingData || organizations.length === 0 || regions.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Facility
          </button>
        }
      />

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <p className="text-sm text-slate-600">
              {isLoadingData
                ? 'Loading organizational hierarchy...'
                : organizations.length === 0 || regions.length === 0
                  ? 'No organizations or regions available. Create them in Firestore first.'
                  : 'Register new clinical facilities, hubs, and regional nodes into the active organization hierarchy.'}
            </p>
            {!isLoadingData && selectedOrg && selectedRegion && (
              <div className="mt-4 flex flex-wrap gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Org: {selectedOrg.name}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Region: {selectedRegion.name}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Role: {userRole}</span>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Use the modal above to submit facility metadata. All writes are sent through the control layer with audit logging enabled.</p>
          </div>
        </div>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-8">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Register New Clinical Facility</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Facility onboarding</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close facility registration"
                className="text-2xl font-semibold text-slate-400 transition hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitFacility} className="space-y-6 px-6 py-6">
              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  Facility Corporate Name
                  <input
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder="Metro Emergency Center Hub"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>

                <label className="space-y-2 text-sm text-slate-700">
                  Infrastructure Classification
                  <select
                    value={formData.type}
                    onChange={(event) => setFormData({ ...formData, type: event.target.value as Facility['type'] })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  >
                    {facilityTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  Target Regional Node
                  <select
                    value={formData.regionId}
                    onChange={(event) => setFormData({ ...formData, regionId: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  >
                    {regions.length === 0 ? (
                      <option disabled>No regions available</option>
                    ) : (
                      regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-700">
                  Assigned Organization
                  <select
                    value={formData.orgId}
                    onChange={(event) => setFormData({ ...formData, orgId: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  >
                    {organizations.length === 0 ? (
                      <option disabled>No organizations available</option>
                    ) : (
                      organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-700">
                Physical Dispatch Address
                <input
                  value={formData.address}
                  onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                  placeholder="100 Medical Center Pkwy"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </label>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 text-right sm:flex-row sm:justify-end sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Committing Facility…' : 'Commit Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
