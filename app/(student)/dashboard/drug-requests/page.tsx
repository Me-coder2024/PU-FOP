'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface DrugRequest {
  id: string;
  drug_name: string;
  dosage_form: string | null;
  category: string | null;
  therapeutic: string | null;
  reason: string | null;
  status: string;
  dean_reviewed_by: string | null;
  dean_review_note: string | null;
  pg_reviewed_by: string | null;
  pg_review_note: string | null;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Pending Review', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: 'solar:clock-circle-bold-duotone' },
  approved: { label: 'Approved — Added to Database', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'solar:check-circle-bold-duotone' },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: 'solar:close-circle-bold-duotone' },
  // Legacy statuses for backward compat
  dean_approved: { label: 'Approved — Added to Database', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'solar:check-circle-bold-duotone' },
  pg_approved: { label: 'Approved — Added to Database', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'solar:check-circle-bold-duotone' },
};

type RequestTab = 'drug' | 'dosage_form';

export default function StudentDrugRequestsPage() {
  const { profile } = useRole();

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DrugRequest[]>([]);

  // Separate submission states for each form
  const [activeTab, setActiveTab] = useState<RequestTab>('drug');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drug request form fields
  const [drugName, setDrugName] = useState('');
  const [category, setCategory] = useState('');
  const [therapeutic, setTherapeutic] = useState('');
  const [drugReason, setDrugReason] = useState('');

  // Dosage form request fields
  const [dosageFormName, setDosageFormName] = useState('');
  const [dosageReason, setDosageReason] = useState('');

  const fetchRequests = useCallback(async () => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/drug-requests?userId=${profile.id}&role=student`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Failed to fetch drug requests:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) fetchRequests();
  }, [profile, fetchRequests]);

  const handleDrugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!drugName.trim()) {
      setError('Drug name is required.');
      return;
    }

    if (!profile) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/drug-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          requestType: 'drug',
          drugName: drugName.trim(),
          category: category.trim() || null,
          therapeutic: therapeutic.trim() || null,
          reason: drugReason.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSuccess(true);
      setDrugName('');
      setCategory('');
      setTherapeutic('');
      setDrugReason('');
      await fetchRequests();

      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDosageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!dosageFormName.trim()) {
      setError('Dosage form name is required.');
      return;
    }

    if (!profile) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/drug-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          requestType: 'dosage_form',
          drugName: dosageFormName.trim(),
          reason: dosageReason.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSuccess(true);
      setDosageFormName('');
      setDosageReason('');
      await fetchRequests();

      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to detect request type
  const getRequestType = (req: DrugRequest): 'drug' | 'dosage_form' => {
    return req.category === 'DOSAGE_FORM_REQUEST' ? 'dosage_form' : 'drug';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium" style={authorFont}>Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
          Drug & Dosage Requests
        </h1>
        <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
          <Icon icon="solar:pill-bold" className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
        <Icon icon="solar:info-circle-bold-duotone" className="w-5 h-5 text-[#4361EE] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-800" style={authorFont}>How it works</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed" style={authorFont}>
            Request a new drug or dosage form to be added to the submission dropdowns. Your request will be
            reviewed by the <strong>Dean or PG Director</strong>. Once approved by either, the item will appear
            in the dropdown when filling your dissertation form.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Request Forms with Tabs */}
        <div>
          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-4">
            <button
              type="button"
              onClick={() => { setActiveTab('drug'); setError(null); setSuccess(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'drug'
                  ? 'bg-white text-[#4361EE] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={authorFont}
            >
              <Icon icon="solar:pill-bold-duotone" className="w-3.5 h-3.5" />
              Request Drug
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('dosage_form'); setError(null); setSuccess(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'dosage_form'
                  ? 'bg-white text-[#4361EE] shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={authorFont}
            >
              <Icon icon="solar:medical-kit-bold-duotone" className="w-3.5 h-3.5" />
              Request Dosage Form
            </button>
          </div>

          {/* Drug Request Form */}
          {activeTab === 'drug' && (
            <form onSubmit={handleDrugSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2" style={authorFont}>
                <Icon icon="solar:add-circle-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                Request New Drug
              </h2>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                  Drug Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Icon icon="solar:pill-bold-duotone" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4361EE]" />
                  <input
                    type="text"
                    value={drugName}
                    onChange={(e) => setDrugName(e.target.value)}
                    placeholder="e.g., Metformin"
                    className="w-full pl-10 pr-4 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
                    style={authorFont}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Analgesic"
                    className="w-full px-3 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
                    style={authorFont}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                    Therapeutic
                  </label>
                  <input
                    type="text"
                    value={therapeutic}
                    onChange={(e) => setTherapeutic(e.target.value)}
                    placeholder="e.g., Diabetes"
                    className="w-full px-3 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
                    style={authorFont}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                  Reason for Request
                </label>
                <textarea
                  value={drugReason}
                  onChange={(e) => setDrugReason(e.target.value)}
                  placeholder="Explain why this drug should be added..."
                  rows={3}
                  className="w-full px-3 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all resize-none"
                  style={authorFont}
                />
              </div>

              {error && activeTab === 'drug' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:danger-triangle-bold-duotone" className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-red-800" style={authorFont}>{error}</p>
                </div>
              )}

              {success && activeTab === 'drug' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:check-circle-bold-duotone" className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-emerald-800" style={authorFont}>
                    Drug request submitted! Dean or PG Director will review it.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-[#4361EE] hover:bg-[#3A56D4] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#4361EE]/20 transition-all disabled:opacity-50"
                style={authorFont}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Icon icon="solar:send-bold" className="w-4 h-4" />
                    Submit Drug Request
                  </>
                )}
              </button>
            </form>
          )}

          {/* Dosage Form Request Form */}
          {activeTab === 'dosage_form' && (
            <form onSubmit={handleDosageSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2" style={authorFont}>
                <Icon icon="solar:add-circle-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                Request New Dosage Form
              </h2>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                  Dosage Form Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Icon icon="solar:medical-kit-bold-duotone" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4361EE]" />
                  <input
                    type="text"
                    value={dosageFormName}
                    onChange={(e) => setDosageFormName(e.target.value)}
                    placeholder="e.g., Liposomal Formulation"
                    className="w-full pl-10 pr-4 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
                    style={authorFont}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest" style={authorFont}>
                  Reason for Request
                </label>
                <textarea
                  value={dosageReason}
                  onChange={(e) => setDosageReason(e.target.value)}
                  placeholder="Explain why this dosage form should be added..."
                  rows={3}
                  className="w-full px-3 py-3 bg-[#F0F2F8] border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all resize-none"
                  style={authorFont}
                />
              </div>

              {error && activeTab === 'dosage_form' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:danger-triangle-bold-duotone" className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-red-800" style={authorFont}>{error}</p>
                </div>
              )}

              {success && activeTab === 'dosage_form' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:check-circle-bold-duotone" className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-emerald-800" style={authorFont}>
                    Dosage form request submitted! Dean or PG Director will review it.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-[#4361EE] hover:bg-[#3A56D4] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#4361EE]/20 transition-all disabled:opacity-50"
                style={authorFont}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Icon icon="solar:send-bold" className="w-4 h-4" />
                    Submit Dosage Form Request
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Right: Request History */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900" style={authorFont}>My Requests</h2>
              <span className="px-2.5 py-1 text-[10px] font-bold bg-blue-50 text-[#4361EE] rounded-full border border-blue-100" style={poppinsFont}>
                {requests.length} total
              </span>
            </div>

            {requests.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-[#4361EE]/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon icon="solar:pill-bold-duotone" className="w-7 h-7 text-[#4361EE]" />
                </div>
                <p className="text-sm font-bold text-slate-900 mb-1" style={authorFont}>No requests yet</p>
                <p className="text-[11px] text-slate-400" style={authorFont}>
                  Submit a drug or dosage form request and it will appear here with its approval status.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.map((req) => {
                  const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                  const reqType = getRequestType(req);
                  return (
                    <div key={req.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon
                              icon={reqType === 'dosage_form' ? 'solar:medical-kit-bold-duotone' : 'solar:pill-bold-duotone'}
                              className="w-4 h-4 text-[#4361EE]"
                            />
                            <p className="text-sm font-bold text-slate-900" style={authorFont}>{req.drug_name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                              reqType === 'dosage_form'
                                ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                                : 'bg-blue-50 text-blue-600 border border-blue-200'
                            }`}>
                              {reqType === 'dosage_form' ? 'Dosage Form' : 'Drug'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 ml-6" style={poppinsFont}>
                            {reqType === 'drug' && req.dosage_form && <span>Form: {req.dosage_form}</span>}
                            {reqType === 'drug' && req.category && req.category !== 'DOSAGE_FORM_REQUEST' && <><span>•</span><span>{req.category}</span></>}
                            {req.therapeutic && <><span>•</span><span>{req.therapeutic}</span></>}
                          </div>
                          {req.reason && (
                            <p className="text-[11px] text-slate-500 mt-1.5 ml-6 line-clamp-2" style={authorFont}>
                              {req.reason}
                            </p>
                          )}
                          <p className="text-[9px] text-slate-400 mt-2 ml-6" style={poppinsFont}>
                            Submitted {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 ${config.bg} ${config.color}`}>
                          <Icon icon={config.icon} className="w-3 h-3" />
                          {config.label}
                        </span>
                      </div>

                      {/* Rejection reason */}
                      {req.status === 'rejected' && req.rejection_reason && (
                        <div className="mt-3 ml-6 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <p className="text-[10px] font-bold text-red-800" style={authorFont}>Rejection Reason</p>
                          <p className="text-[11px] text-red-700 mt-0.5" style={authorFont}>{req.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
