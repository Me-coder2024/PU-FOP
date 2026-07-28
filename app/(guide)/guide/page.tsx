'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow, SubmissionStatus } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

import { useToast } from '@/components/ui/Toast';

interface SubmissionWithStudent extends SubmissionRow {
  student?: {
    full_name: string | null;
    email: string;
    university_id: string | null;
    department_id: string | null;
  };
}

export default function GuidePage() {
  const { profile } = useRole();
  const { success, error: showError, warning } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  // Full form modal
  const [modalSub, setModalSub] = useState<SubmissionWithStudent | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;
    try {
      // 1. Fetch submissions assigned directly to this guide OR assigned to students linked to this guide
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id, department_id, guide_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        // Filter submissions assigned to this guide by profile.id OR student's assigned guide_id
        const mySubmissions = data.filter(
          (s: any) => s.guide_id === profile.id || s.student?.guide_id === profile.id
        ) as SubmissionWithStudent[];

        setSubmissions(mySubmissions);
        setActiveCount(mySubmissions.filter((s) => s.status === 'submitted').length);
      }
    } catch (err) {
      console.error('Error fetching guide submissions', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchSubmissions();
  }, [profile, fetchSubmissions]);

  const handleAction = async (
    submissionId: string,
    action: 'accept' | 'reject' | 'revision'
  ) => {
    setActionLoading(submissionId);
    try {
      const submission = submissions.find((s) => s.id === submissionId);
      if (!submission) return;

      let newStatus: SubmissionStatus;
      let notifTitle: string;
      let notifMessage: string;
      let notifType: 'success' | 'warning' | 'error' | 'info' = 'info';

      if (action === 'accept') {
        newStatus = 'guide_accepted';
        notifTitle = 'Title Accepted by Guide';
        notifMessage = `Your dissertation title "${submission.title}" has been accepted by your guide and forwarded to the HOD for review.`;
        notifType = 'success';
      } else if (action === 'reject') {
        if (!rejectionReason[submissionId]?.trim()) {
          warning('Please provide a rejection reason.', 'Warning');
          setActionLoading(null);
          return;
        }
        newStatus = 'guide_rejected';
        notifTitle = 'Title Rejected by Guide';
        notifMessage = `Your dissertation title "${submission.title}" has been rejected. Reason: ${rejectionReason[submissionId]}`;
        notifType = 'error';
      } else {
        if (!remarks[submissionId]?.trim()) {
          warning('Please provide remarks for the student.', 'Warning');
          setActionLoading(null);
          return;
        }
        newStatus = 'revision_requested';
        notifTitle = 'Revision Requested by Guide';
        notifMessage = `Your guide has requested changes to "${submission.title}". Please review the remarks and resubmit.`;
        notifType = 'warning';
      }

      const updateData: Partial<SubmissionRow> = {
        status: newStatus,
        guide_reviewed_at: new Date().toISOString(),
      };

      if (action === 'reject') {
        updateData.rejection_reason = rejectionReason[submissionId].trim();
      }
      if (action === 'revision') {
        updateData.guide_remarks = remarks[submissionId].trim();
      }

      const { error: updateError } = await supabase
        .from('submissions')
        .update(updateData)
        .eq('id', submissionId);

      if (updateError) throw updateError;

      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        title: notifTitle,
        message: notifMessage,
        type: notifType,
        link: '/dashboard',
      });

      if (action === 'accept') {
        const { data: studentProfile } = await supabase
          .from('profiles')
          .select('institute_id')
          .eq('id', submission.student_id)
          .single();

        if (studentProfile?.institute_id) {
          const { data: hods } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'hod')
            .eq('institute_id', studentProfile.institute_id);

          if (hods) {
            const hodNotifications = hods.map((hod: { id: string }) => ({
              user_id: hod.id,
              title: 'New Title for HOD Review',
              message: `A new dissertation title "${submission.title}" has been accepted by the guide and requires your review.`,
              type: 'info' as const,
              link: '/hod',
            }));
            if (hodNotifications.length > 0) {
              await supabase.from('notifications').insert(hodNotifications);
            }
          }
        }
      }

      success(action === 'accept' ? 'Title accepted and forwarded to HOD!' : action === 'reject' ? 'Title rejected.' : 'Revisions requested.', 'Success');
      setModalSub(null);
      await fetchSubmissions();
    } catch (err) {
      console.error('Error performing guide action', err);
      showError('Action failed. Please try again.', 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  const pending = submissions.filter(s => s.status === 'submitted');
  const accepted = submissions.filter(s => s.status === 'guide_accepted');
  const revisions = submissions.filter(s => s.status === 'revision_requested');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>Guide Review Queue</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>Review, accept, or request revisions on assigned student titles.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Pending Review</p>
              <p className="text-3xl font-black mt-1" style={authorFont}>{String(pending.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:clock-circle-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Accepted</p>
              <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>{String(accepted.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Revision Requested</p>
              <p className="text-3xl font-black text-amber-600 mt-1" style={authorFont}>{String(revisions.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Icon icon="solar:pen-new-square-bold-duotone" className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Submissions List */}
      <div>
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4" style={poppinsFont}>
          Your Submissions ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-[#4361EE]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#4361EE]/10">
              <Icon icon="solar:clipboard-check-bold-duotone" className="w-8 h-8 text-[#4361EE]/40" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Assigned Submissions</h3>
            <p className="text-sm text-slate-500" style={authorFont}>Titles assigned to you by the HOD will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const statusBadge = sub.status === 'submitted'
                ? { label: 'Pending Review', bg: 'bg-blue-50 border-blue-200 text-blue-700', icon: 'solar:clock-circle-bold-duotone' }
                : sub.status === 'guide_accepted'
                ? { label: 'Accepted', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: 'solar:check-circle-bold-duotone' }
                : sub.status === 'revision_requested'
                ? { label: 'Revision Requested', bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: 'solar:pen-new-square-bold-duotone' }
                : { label: sub.status, bg: 'bg-slate-50 border-slate-200 text-slate-600', icon: 'solar:document-bold-duotone' };

              return (
                <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-[#4361EE]/30 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#4361EE]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#4361EE]">
                          {sub.student?.full_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate" style={authorFont}>{sub.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5" style={poppinsFont}>
                          {sub.student?.full_name || 'Student'} • {sub.student?.university_id || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setModalSub(sub)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#4361EE] hover:bg-[#4361EE]/5 transition-all"
                        title="View full form"
                      >
                        <Icon icon="solar:eye-bold-duotone" className="w-5 h-5" />
                      </button>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusBadge.bg}`} style={poppinsFont}>
                        <Icon icon={statusBadge.icon} className="w-3 h-3" />
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Full Form Modal ===== */}
      {modalSub && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalSub(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-lg font-black text-slate-900" style={authorFont}>Submission Details</h2>
              <button
                onClick={() => setModalSub(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest" style={poppinsFont}>Title</p>
                <p className="text-sm font-bold text-slate-900 mt-1" style={authorFont}>&quot;{modalSub.title}&quot;</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Student</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.student?.full_name || 'N/A'}</p>
                  <p className="text-[10px] text-slate-500" style={poppinsFont}>{modalSub.student?.university_id || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Submitted</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{new Date(modalSub.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {modalSub.description && (
                <div className="bg-[#F0F2F8] rounded-xl p-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Statement of Novelty</p>
                  <p className="text-xs text-slate-700 mt-1" style={authorFont}>{modalSub.description}</p>
                </div>
              )}

              {(() => {
                const details = (modalSub.criteria_details as Record<string, unknown>) || {};
                const fields = [
                  { key: 'drugName', label: 'Drug Name' },
                  { key: 'dosageForm', label: 'Dosage Form' },
                  { key: 'primarySubject', label: 'Primary Subject' },
                  { key: 'coreDomain', label: 'Core Domain' },
                  { key: 'methodology', label: 'Methodology' },
                  { key: 'toolsInstruments', label: 'Tools & Instruments' },
                  { key: 'workLocation', label: 'Work Location' },
                  { key: 'excipients', label: 'Excipients' },
                  { key: 'keywords', label: 'Keywords' },
                  { key: 'novelty', label: 'Novelty' },
                ];
                const visibleFields = fields.filter(f => details[f.key]);
                if (visibleFields.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {visibleFields.map(f => (
                      <div key={f.key} className="bg-[#F0F2F8] rounded-xl p-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>{f.label}</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 line-clamp-3" style={authorFont}>{String(details[f.key])}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Actions — only for 'submitted' status */}
              {modalSub.status === 'submitted' && (
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>Guide Decision</h4>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                      Remarks <span className="text-slate-400 font-normal">(required for revision)</span>
                    </label>
                    <textarea
                      value={remarks[modalSub.id] || ''}
                      onChange={(e) => setRemarks((prev) => ({ ...prev, [modalSub.id]: e.target.value }))}
                      placeholder="Add remarks for the student..."
                      rows={2}
                      className="w-full px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all resize-none"
                      style={authorFont}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                      Rejection Reason <span className="text-slate-400 font-normal">(required for rejection)</span>
                    </label>
                    <textarea
                      value={rejectionReason[modalSub.id] || ''}
                      onChange={(e) => setRejectionReason((prev) => ({ ...prev, [modalSub.id]: e.target.value }))}
                      placeholder="Reason for rejecting this title..."
                      rows={2}
                      className="w-full px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all resize-none"
                      style={authorFont}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAction(modalSub.id, 'accept')}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5" />}
                      Accept & Forward
                    </button>
                    <button
                      onClick={() => handleAction(modalSub.id, 'revision')}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:undo-left-bold" className="w-3.5 h-3.5" />}
                      Send for Revision
                    </button>
                    <button
                      onClick={() => handleAction(modalSub.id, 'reject')}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />}
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Already accepted */}
              {modalSub.status === 'guide_accepted' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:check-circle-bold-duotone" className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800" style={authorFont}>Forwarded to HOD</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5" style={authorFont}>This title has been forwarded and is under HOD review.</p>
                  </div>
                </div>
              )}

              {/* Revision requested */}
              {modalSub.status === 'revision_requested' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:pen-new-square-bold-duotone" className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800" style={authorFont}>Revision Requested</p>
                    {modalSub.guide_remarks && <p className="text-[11px] text-amber-700 mt-0.5 italic" style={authorFont}>Your remarks: &quot;{modalSub.guide_remarks}&quot;</p>}
                    <p className="text-[11px] text-amber-600 mt-0.5" style={authorFont}>Waiting for the student to revise and resubmit.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
