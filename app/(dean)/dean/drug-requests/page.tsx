'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { Icon } from '@iconify/react';
import { Loader2, Search, Filter } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

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
  dean_reviewed_at: string | null;
  pg_reviewed_by: string | null;
  pg_review_note: string | null;
  pg_reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  requester?: { full_name: string | null; email: string; university_id?: string | null };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  dean_approved: { label: 'Dean Approved', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  pg_approved: { label: 'PG Dir Approved', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
  approved: { label: 'Fully Approved', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

export default function DeanDrugRequestsPage() {
  const { profile } = useRole();
  const { success, error: showError, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DrugRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [modalReq, setModalReq] = useState<DrugRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!profile) return;
    try {
      const res = await fetch(`/api/drug-requests?userId=${profile.id}&role=dean`);
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

  const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
    if (!profile) return;

    if (action === 'reject' && !reviewNotes[requestId]?.trim()) {
      warning('Please provide a reason for rejection.', 'Warning');
      return;
    }

    setActionLoading(requestId);
    try {
      const res = await fetch(`/api/drug-requests/${requestId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          action,
          note: reviewNotes[requestId]?.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');

      success(action === 'approve' ? 'Request approved successfully!' : 'Request rejected.', 'Success');
      setModalReq(null);
      setReviewNotes((prev) => ({ ...prev, [requestId]: '' }));
      await fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to review';
      showError(msg, 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = requests.filter((r) => {
    const matchesSearch = !searchQuery.trim()
      || r.drug_name.toLowerCase().includes(searchQuery.toLowerCase())
      || r.requester?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      || r.requester?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending' || r.status === 'pg_approved').length;
  const approvedCount = requests.filter((r) => r.status === 'approved' || r.status === 'dean_approved').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>Drug & Dosage Requests</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>
          Review student requests to add new drugs/dosage forms. Both Dean and PG Director must approve.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Needs Your Review</p>
              <p className="text-3xl font-black mt-1" style={authorFont}>{pendingCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:clock-circle-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Approved</p>
          <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>{approvedCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Total Requests</p>
          <p className="text-3xl font-black text-slate-900 mt-1" style={authorFont}>{requests.length}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by drug name or student..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all"
            style={authorFont}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE]"
            style={authorFont}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="pg_approved">PG Dir Approved (needs Dean)</option>
            <option value="dean_approved">Dean Approved</option>
            <option value="approved">Fully Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Icon icon="solar:pill-bold-duotone" className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900" style={authorFont}>No drug requests found</p>
          <p className="text-xs text-slate-400 mt-1" style={authorFont}>Adjust filters or wait for student submissions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const needsMyReview = (req.status === 'pending' || req.status === 'pg_approved') && !req.dean_reviewed_by;

            return (
              <div
                key={req.id}
                className={`bg-white rounded-2xl border p-5 transition-all ${needsMyReview ? 'border-amber-200 shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon icon="solar:pill-bold-duotone" className="w-4 h-4 text-[#4361EE]" />
                      <p className="text-sm font-bold text-slate-900" style={authorFont}>{req.drug_name}</p>
                      {needsMyReview && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full">
                          NEEDS YOUR REVIEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 ml-6" style={poppinsFont}>
                      <span>By: {req.requester?.full_name || 'Student'}</span>
                      {req.requester?.university_id && <><span>•</span><span>{req.requester.university_id}</span></>}
                      {req.dosage_form && <><span>•</span><span>Form: {req.dosage_form}</span></>}
                      {req.category && <><span>•</span><span>{req.category}</span></>}
                    </div>
                    {req.reason && (
                      <p className="text-[11px] text-slate-500 mt-1.5 ml-6 line-clamp-2" style={authorFont}>
                        Reason: {req.reason}
                      </p>
                    )}

                    {/* Approval progress */}
                    <div className="mt-3 ml-6 flex items-center gap-2">
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${req.dean_reviewed_by ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon icon={req.dean_reviewed_by ? 'solar:check-circle-bold' : 'solar:clock-circle-bold'} className="w-3 h-3" />
                        Dean {req.dean_reviewed_by ? '✓' : '⏳'}
                      </div>
                      <div className="w-4 h-0.5 bg-slate-200 rounded-full" />
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${req.pg_reviewed_by ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon icon={req.pg_reviewed_by ? 'solar:check-circle-bold' : 'solar:clock-circle-bold'} className="w-3 h-3" />
                        PG Dir {req.pg_reviewed_by ? '✓' : '⏳'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {needsMyReview && (
                      <button
                        onClick={() => setModalReq(req)}
                        className="px-3 py-1.5 bg-[#4361EE] text-white text-xs font-bold rounded-lg hover:bg-[#3A56D4] transition-all"
                        style={authorFont}
                      >
                        Review
                      </button>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${config.bg} ${config.color}`} style={poppinsFont}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {modalReq && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModalReq(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-lg font-black text-slate-900" style={authorFont}>Review Drug Request</h2>
              <button onClick={() => setModalReq(null)} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Drug Name</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalReq.drug_name}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Dosage Form</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalReq.dosage_form || 'Not specified'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Category</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalReq.category || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Therapeutic</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalReq.therapeutic || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-[#F0F2F8] rounded-xl p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Requested By</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalReq.requester?.full_name || 'Student'}</p>
                <p className="text-[10px] text-slate-500" style={poppinsFont}>{modalReq.requester?.email}</p>
              </div>

              {modalReq.reason && (
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Reason</p>
                  <p className="text-xs text-slate-700 mt-1" style={authorFont}>{modalReq.reason}</p>
                </div>
              )}

              {/* PG Director status */}
              {modalReq.pg_reviewed_by && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[9px] font-bold text-blue-600 uppercase" style={poppinsFont}>PG Director Review</p>
                  <p className="text-xs text-blue-800 mt-0.5" style={authorFont}>
                    ✓ Approved{modalReq.pg_review_note ? `: ${modalReq.pg_review_note}` : ''}
                  </p>
                </div>
              )}

              {/* Review form */}
              <div className="border-t border-slate-100 pt-5 space-y-4">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>Your Decision</h4>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                    Review Note <span className="text-slate-400 font-normal">(required for rejection)</span>
                  </label>
                  <textarea
                    value={reviewNotes[modalReq.id] || ''}
                    onChange={(e) => setReviewNotes(prev => ({ ...prev, [modalReq.id]: e.target.value }))}
                    placeholder="Add a note (optional for approval, required for rejection)..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all resize-none"
                    style={authorFont}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleReview(modalReq.id, 'approve')}
                    disabled={actionLoading === modalReq.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                    style={authorFont}
                  >
                    {actionLoading === modalReq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleReview(modalReq.id, 'reject')}
                    disabled={actionLoading === modalReq.id}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50"
                    style={authorFont}
                  >
                    {actionLoading === modalReq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />}
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
