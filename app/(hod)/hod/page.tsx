'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import {
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Send,
  AlertTriangle,
  Eye,
  MessageSquare,
} from 'lucide-react';

interface SubmissionWithDetails extends SubmissionRow {
  student?: { full_name: string | null; email: string; university_id: string | null };
  guide?: { full_name: string | null };
}

export default function HodPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hodRemarks, setHodRemarks] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;
    try {
      // HOD sees guide_accepted submissions from their institute
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id),
          guide:profiles!submissions_guide_id_fkey(full_name)
        `)
        .in('status', ['guide_accepted', 'hod_accepted', 'hod_rejected'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setSubmissions(data as SubmissionWithDetails[]);
    } catch (err) {
      console.error('Error fetching HOD submissions', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchSubmissions();
  }, [profile, fetchSubmissions]);

  const handleAction = async (submissionId: string, action: 'accept' | 'reject') => {
    setActionLoading(submissionId);
    try {
      const submission = submissions.find((s) => s.id === submissionId);
      if (!submission) return;

      if (action === 'reject' && !rejectionReason[submissionId]?.trim()) {
        alert('Please provide a rejection reason.');
        setActionLoading(null);
        return;
      }

      const newStatus = action === 'accept' ? 'hod_accepted' : 'hod_rejected';

      const updateData: Partial<SubmissionRow> = {
        status: newStatus,
        hod_id: profile!.id,
        hod_reviewed_at: new Date().toISOString(),
      };

      if (hodRemarks[submissionId]?.trim()) {
        updateData.hod_remarks = hodRemarks[submissionId].trim();
      }

      if (action === 'reject') {
        updateData.rejection_reason = rejectionReason[submissionId].trim();
      }

      const { error: updateError } = await supabase
        .from('submissions')
        .update(updateData)
        .eq('id', submissionId);

      if (updateError) throw updateError;

      // Notify student
      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        title: action === 'accept' ? 'Title Accepted by HOD' : 'Title Rejected by HOD',
        message: action === 'accept'
          ? `Your dissertation title "${submission.title}" has been accepted by the HOD and is now finalized.`
          : `Your dissertation title "${submission.title}" has been rejected by the HOD. Reason: ${rejectionReason[submissionId]}`,
        type: action === 'accept' ? 'success' : 'error',
        link: '/dashboard',
      });

      // Notify guide
      if (submission.guide_id) {
        await supabase.from('notifications').insert({
          user_id: submission.guide_id,
          title: action === 'accept' ? 'Student Title Accepted by HOD' : 'Student Title Rejected by HOD',
          message: `The title "${submission.title}" has been ${action === 'accept' ? 'accepted' : 'rejected'} by the HOD.`,
          type: action === 'accept' ? 'success' : 'warning',
          link: '/guide',
        });
      }

      // If accepted, notify PG Director and Dean
      if (action === 'accept') {
        const { data: pgDean } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['pg_director', 'dean']);

        if (pgDean && pgDean.length > 0) {
          const pgDeanNotifs = pgDean.map((p: { id: string }) => ({
            user_id: p.id,
            title: 'New Finalized Title',
            message: `A new dissertation title "${submission.title}" has been finalized (HOD accepted).`,
            type: 'info' as const,
            link: '/pg-director',
          }));
          await supabase.from('notifications').insert(pgDeanNotifs);
        }
      }

      await fetchSubmissions();
      setExpandedId(null);
    } catch (err) {
      console.error('Error performing HOD action', err);
      alert('Action failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">Loading HOD review queue...</p>
        </div>
      </div>
    );
  }

  const pendingReview = submissions.filter((s) => s.status === 'guide_accepted');
  const accepted = submissions.filter((s) => s.status === 'hod_accepted');
  const rejected = submissions.filter((s) => s.status === 'hod_rejected');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">HOD Review Queue</h1>
        <p className="text-sm text-slate-500 mt-1">Review guide-accepted dissertation titles. Accept or reject with remarks.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E3A8A] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Pending Review</p>
              <p className="text-3xl font-black mt-1">{String(pendingReview.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Accepted</p>
              <p className="text-3xl font-black text-emerald-600 mt-1">{String(accepted.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rejected</p>
              <p className="text-3xl font-black text-red-600 mt-1">{String(rejected.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Submissions List */}
      <div>
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
          All Submissions ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
              <ClipboardCheck className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Submissions Yet</h3>
            <p className="text-sm text-slate-500">Guide-accepted titles will appear here for your review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const isActionLoading = actionLoading === sub.id;
              const details = (sub.criteria_details as Record<string, string>) || {};

              const statusBadge = sub.status === 'guide_accepted'
                ? { label: 'Awaiting HOD Review', bg: 'bg-blue-50 border-blue-200 text-blue-700' }
                : sub.status === 'hod_accepted'
                ? { label: 'HOD Accepted', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
                : { label: 'HOD Rejected', bg: 'bg-red-50 border-red-200 text-red-700' };

              return (
                <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {/* Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#1E3A8A]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#1E3A8A]">
                          {sub.student?.full_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{sub.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {sub.student?.full_name || 'Student'} • Guide: {sub.guide?.full_name || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusBadge.bg}`}>
                        {statusBadge.label}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-5 space-y-5">
                      {/* Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Student</p>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5">{sub.student?.full_name} ({sub.student?.university_id})</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Guide</p>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5">{sub.guide?.full_name || 'Not assigned'}</p>
                        </div>
                      </div>

                      {sub.description && (
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Description</p>
                          <p className="text-sm text-slate-700">{sub.description}</p>
                        </div>
                      )}

                      {/* Criteria grid */}
                      {Object.keys(details).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {Object.entries(details).map(([key, value]) => value ? (
                            <div key={key} className="bg-slate-50 rounded-xl p-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                              <p className="text-xs font-semibold text-slate-800 mt-0.5 line-clamp-2">{value}</p>
                            </div>
                          ) : null)}
                        </div>
                      )}

                      {/* Actions for pending HOD review */}
                      {sub.status === 'guide_accepted' && (
                        <div className="border-t border-slate-100 pt-5 space-y-4">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">HOD Decision</h4>

                          {/* HOD Remarks */}
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              HOD Remarks <span className="text-slate-400 font-normal">(visible to student)</span>
                            </label>
                            <textarea
                              value={hodRemarks[sub.id] || ''}
                              onChange={(e) => setHodRemarks((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Add your remarks..."
                              rows={2}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] transition-all resize-none"
                            />
                          </div>

                          {/* Rejection Reason */}
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              Rejection Reason <span className="text-slate-400 font-normal">(required if rejecting)</span>
                            </label>
                            <textarea
                              value={rejectionReason[sub.id] || ''}
                              onChange={(e) => setRejectionReason((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Explain the rejection..."
                              rows={2}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all resize-none"
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleAction(sub.id, 'accept')}
                              disabled={isActionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                            >
                              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              Accept Title
                            </button>
                            <button
                              onClick={() => handleAction(sub.id, 'reject')}
                              disabled={isActionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
                            >
                              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                              Reject Title
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Already decided */}
                      {sub.status === 'hod_accepted' && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-emerald-800">Accepted</p>
                            {sub.hod_remarks && <p className="text-[11px] text-emerald-700 mt-0.5">Remarks: {sub.hod_remarks}</p>}
                          </div>
                        </div>
                      )}
                      {sub.status === 'hod_rejected' && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-red-800">Rejected</p>
                            {sub.rejection_reason && <p className="text-[11px] text-red-700 mt-0.5">Reason: {sub.rejection_reason}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
