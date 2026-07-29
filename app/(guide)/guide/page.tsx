'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow, SubmissionStatus } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SubmissionWithStudent extends SubmissionRow {
  student?: {
    full_name: string | null;
    email: string;
    university_id: string | null;
    department_id: string | null;
    guide_id: string | null;
  };
  guide?: {
    id: string;
    email: string;
    full_name: string | null;
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
      const userEmail = profile.email?.toLowerCase();

      // Fetch all profile IDs matching this email (in case pre-provisioning created a secondary UUID)
      const { data: siblingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', userEmail || '');

      const myProfileIds = new Set((siblingProfiles || []).map((p) => p.id));
      if (profile.id) myProfileIds.add(profile.id);

      // Fetch submissions with guide & student relations
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          guide:profiles!submissions_guide_id_fkey(id, email, full_name),
          student:profiles!submissions_student_id_fkey(
            id, full_name, email, university_id, department_id, guide_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        // Filter submissions matching guide by any associated UUID OR by email
        const mySubmissions = data.filter((s: any) => {
          const guideIdMatch =
            myProfileIds.has(s.guide_id) ||
            (s.student?.guide_id && myProfileIds.has(s.student.guide_id));
          const guideEmailMatch =
            userEmail && s.guide?.email?.toLowerCase() === userEmail;
          return guideIdMatch || guideEmailMatch;
        }) as unknown as SubmissionWithStudent[];

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
          warning('Please provide remarks/feedback for revision.', 'Warning');
          setActionLoading(null);
          return;
        }
        newStatus = 'revision_requested';
        notifTitle = 'Revision Requested by Guide';
        notifMessage = `Your guide has requested revisions for your dissertation title "${submission.title}". Feedback: ${remarks[submissionId]}`;
        notifType = 'warning';
      }

      // Update submission in Supabase
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          status: newStatus,
          guide_remarks: remarks[submissionId]?.trim() || (action === 'reject' ? rejectionReason[submissionId] : null),
          guide_reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      if (updateError) throw updateError;

      // Send in-app notification to student
      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        title: notifTitle,
        message: notifMessage,
        type: notifType,
        link: '/dashboard',
      });

      // Trigger workflow Resend email notifications
      fetch('/api/notify-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: `guide_${action}`,
          submissionId,
          remarks: remarks[submissionId]?.trim() || rejectionReason[submissionId]?.trim() || '',
        }),
      }).catch(console.error);

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: `guide_${action}_submission`,
        table_name: 'submissions',
        record_id: submissionId,
        new_data: { status: newStatus, remarks: remarks[submissionId] },
      });

      success(
        action === 'accept'
          ? 'Title accepted and sent to HOD!'
          : action === 'reject'
          ? 'Submission rejected.'
          : 'Revision feedback sent to student.',
        'Success'
      );

      setModalSub(null);
      await fetchSubmissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      showError(msg, 'Error');
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>
          Guide Review Queue
        </h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>
          Review dissertation topic proposals submitted by your assigned students.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>
            Pending Your Action
          </p>
          <p className="text-3xl font-black mt-1" style={authorFont}>{activeCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>
            Total Assigned Submissions
          </p>
          <p className="text-3xl font-black text-slate-900 mt-1" style={authorFont}>{submissions.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>
            Accepted & Forwarded
          </p>
          <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>
            {submissions.filter((s) => s.status === 'guide_accepted' || s.status === 'hod_accepted' || s.status === 'finalized').length}
          </p>
        </div>
      </div>

      {/* Submissions List */}
      {submissions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Icon icon="solar:document-bold-duotone" className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900" style={authorFont}>No submissions in your queue</p>
          <p className="text-xs text-slate-400 mt-1" style={authorFont}>When your assigned students submit titles, they will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => {
            const isPending = sub.status === 'submitted';

            return (
              <div
                key={sub.id}
                className={`bg-white rounded-2xl border p-6 transition-all ${
                  isPending ? 'border-amber-200 shadow-sm' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-base font-bold text-slate-900" style={authorFont}>{sub.title}</p>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${
                        sub.status === 'guide_accepted' || sub.status === 'hod_accepted' || sub.status === 'finalized'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : sub.status === 'submitted'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`} style={poppinsFont}>
                        {sub.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500" style={poppinsFont}>
                      <span>Student: <strong>{sub.student?.full_name || 'N/A'}</strong></span>
                      {sub.student?.university_id && <span>• ID: {sub.student.university_id}</span>}
                      {sub.student?.email && <span>• {sub.student.email}</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => setModalSub(sub)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex-shrink-0"
                    style={authorFont}
                  >
                    View Full Application
                  </button>
                </div>

                {/* Inline Action Controls for Pending Submissions */}
                {isPending && (
                  <div className="pt-4 space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                        Feedback / Remarks <span className="text-slate-400 font-normal">(required for revision request)</span>
                      </label>
                      <textarea
                        value={remarks[sub.id] || ''}
                        onChange={(e) => setRemarks((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                        placeholder="Add remarks or feedback for student..."
                        rows={2}
                        className="w-full px-3 py-2 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] resize-none"
                        style={authorFont}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                        Rejection Reason <span className="text-slate-400 font-normal">(required for rejection)</span>
                      </label>
                      <textarea
                        value={rejectionReason[sub.id] || ''}
                        onChange={(e) => setRejectionReason((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                        placeholder="Provide reason for rejection..."
                        rows={2}
                        className="w-full px-3 py-2 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                        style={authorFont}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleAction(sub.id, 'accept')}
                        disabled={actionLoading === sub.id}
                        className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        style={authorFont}
                      >
                        {actionLoading === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:check-circle-bold" className="w-4 h-4" />}
                        Accept & Forward to HOD
                      </button>

                      <button
                        onClick={() => handleAction(sub.id, 'revision')}
                        disabled={actionLoading === sub.id}
                        className="flex-1 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        style={authorFont}
                      >
                        {actionLoading === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:pen-bold" className="w-4 h-4" />}
                        Request Revision
                      </button>

                      <button
                        onClick={() => handleAction(sub.id, 'reject')}
                        disabled={actionLoading === sub.id}
                        className="flex-1 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        style={authorFont}
                      >
                        {actionLoading === sub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:close-circle-bold" className="w-4 h-4" />}
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Full Submission Modal ===== */}
      {modalSub && (() => {
        const cd = modalSub.criteria_details as Record<string, unknown> | null;
        const vs = cd?.validationScores as Record<string, unknown> | null;
        const deliverables = cd?.deliverables as Record<string, boolean> | null;
        const scoreFields = vs ? Object.entries(vs).filter(([k]) => !['total', 'maxTotal'].includes(k)) as [string, { max: number; score: number; detail: string }][] : [];
        const totalScore = (vs?.total as number) || 0;
        const maxTotal = (vs?.maxTotal as number) || 95;

        return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setModalSub(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-lg font-black text-slate-900" style={authorFont}>Submission Details</h2>
              <button
                onClick={() => setModalSub(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Title */}
              <div className="bg-gradient-to-r from-[#4361EE]/5 to-[#4361EE]/10 rounded-xl p-4 border border-[#4361EE]/10">
                <p className="text-[9px] font-bold text-[#4361EE]/60 uppercase tracking-widest" style={poppinsFont}>Dissertation Title</p>
                <p className="text-base font-bold text-slate-900 mt-1.5 leading-relaxed" style={authorFont}>{modalSub.title}</p>
              </div>

              {/* Student Info Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Student Name</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalSub.student?.full_name || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Enrollment ID</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalSub.student?.university_id || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Status</p>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    modalSub.status === 'guide_accepted' || modalSub.status === 'hod_accepted' || modalSub.status === 'finalized'
                      ? 'bg-emerald-100 text-emerald-700'
                      : modalSub.status === 'submitted'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`} style={poppinsFont}>{modalSub.status?.replace(/_/g, ' ').toUpperCase()}</span>
                </div>
              </div>

              {/* Criteria Details - Structured */}
              {cd && (
                <div className="space-y-4">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>Application Details</p>

                  {/* Statement of Novelty */}
                  {Boolean(cd.novelty) && (
                    <div className="bg-[#F0F2F8] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon icon="solar:lightbulb-bold-duotone" className="w-4 h-4 text-amber-500" />
                        <p className="text-[10px] font-bold text-slate-500 uppercase" style={poppinsFont}>Statement of Novelty</p>
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed" style={authorFont}>{cd.novelty as string}</p>
                    </div>
                  )}

                  {/* Drug & Dosage Info */}
                  <div className="grid grid-cols-2 gap-3">
                    {Boolean(cd.drugName) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:pill-bold-duotone" className="w-3.5 h-3.5 text-blue-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Primary Drug</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900" style={authorFont}>{cd.drugName as string}</p>
                        {Boolean(cd.drugNames && Array.isArray(cd.drugNames) && (cd.drugNames as string[]).length > 1) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(cd.drugNames as string[]).slice(1).map((d, i) => (
                              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded-full" style={poppinsFont}>{d}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {Boolean(cd.dosageForm) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:test-tube-bold-duotone" className="w-3.5 h-3.5 text-purple-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Primary Dosage Form</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900" style={authorFont}>{cd.dosageForm as string}</p>
                        {Boolean(cd.dosageForms && Array.isArray(cd.dosageForms) && (cd.dosageForms as string[]).length > 1) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(cd.dosageForms as string[]).slice(1).map((d, i) => (
                              <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-bold rounded-full" style={poppinsFont}>{d}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Subject & Domain */}
                  <div className="grid grid-cols-2 gap-3">
                    {Boolean(cd.primarySubject) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:target-bold-duotone" className="w-3.5 h-3.5 text-emerald-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Primary Subject</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800" style={authorFont}>{cd.primarySubject as string}</p>
                      </div>
                    )}
                    {Boolean(cd.coreDomain) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:book-bold-duotone" className="w-3.5 h-3.5 text-indigo-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Core Domain</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800" style={authorFont}>{cd.coreDomain as string}</p>
                      </div>
                    )}
                  </div>

                  {/* Excipients */}
                  {Boolean(cd.excipients) && (
                    <div className="bg-[#F0F2F8] rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon icon="solar:atom-bold-duotone" className="w-3.5 h-3.5 text-teal-500" />
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Excipients</p>
                      </div>
                      <p className="text-sm text-slate-800" style={authorFont}>{cd.excipients as string}</p>
                    </div>
                  )}

                  {/* Keywords */}
                  {Boolean(cd.keywords) && (
                    <div className="bg-[#F0F2F8] rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon icon="solar:tag-bold-duotone" className="w-3.5 h-3.5 text-orange-500" />
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Keywords</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(cd.keywords as string).split(/[,;]+/).map((kw, i) => (
                          <span key={i} className="px-2.5 py-1 bg-white text-slate-700 text-[10px] font-semibold rounded-lg border border-slate-200" style={poppinsFont}>{kw.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Methodology */}
                  {Boolean(cd.methodology && (cd.methodology as string).trim()) && (
                    <div className="bg-[#F0F2F8] rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon icon="solar:clipboard-list-bold-duotone" className="w-3.5 h-3.5 text-sky-500" />
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Methodology</p>
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed" style={authorFont}>{cd.methodology as string}</p>
                    </div>
                  )}

                  {/* Tools & Work Location */}
                  <div className="grid grid-cols-2 gap-3">
                    {Boolean(cd.toolsInstruments) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:settings-bold-duotone" className="w-3.5 h-3.5 text-slate-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Tools & Instruments</p>
                        </div>
                        <p className="text-sm text-slate-800" style={authorFont}>{cd.toolsInstruments as string}</p>
                      </div>
                    )}
                    {Boolean(cd.workLocation) && (
                      <div className="bg-[#F0F2F8] rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon icon="solar:map-point-bold-duotone" className="w-3.5 h-3.5 text-rose-500" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Work Location</p>
                        </div>
                        <p className="text-sm text-slate-800" style={authorFont}>{cd.workLocation as string}</p>
                      </div>
                    )}
                  </div>

                  {/* Deliverables */}
                  {deliverables && (
                    <div className="bg-[#F0F2F8] rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon icon="solar:box-bold-duotone" className="w-3.5 h-3.5 text-violet-500" />
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Deliverables</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(deliverables).map(([key, val]) => (
                          <span
                            key={key}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                              val
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-400'
                            }`}
                            style={poppinsFont}
                          >
                            <Icon icon={val ? 'solar:check-circle-bold' : 'solar:close-circle-bold'} className="w-3 h-3" />
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation Scores */}
                  {vs && (
                    <div className="bg-gradient-to-r from-[#4361EE]/5 to-emerald-50 rounded-xl p-4 border border-[#4361EE]/10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Icon icon="solar:shield-check-bold-duotone" className="w-4 h-4 text-[#4361EE]" />
                          <p className="text-[10px] font-bold text-slate-500 uppercase" style={poppinsFont}>Validation Scores</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-black ${totalScore >= 70 ? 'text-emerald-600' : totalScore >= 50 ? 'text-amber-600' : 'text-red-600'}`} style={authorFont}>
                            {totalScore}
                          </span>
                          <span className="text-xs text-slate-400 font-bold" style={poppinsFont}>/ {maxTotal}</span>
                        </div>
                      </div>

                      <div className="w-full h-2.5 bg-white rounded-full overflow-hidden mb-4">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            totalScore >= 70 ? 'bg-emerald-500' : totalScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min((totalScore / maxTotal) * 100, 100)}%` }}
                        />
                      </div>

                      <div className="space-y-3">
                        {scoreFields.map(([key, val]) => (
                          <div key={key} className="bg-white rounded-lg p-3 border border-slate-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-bold text-slate-700 uppercase" style={poppinsFont}>
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </p>
                              <span className={`text-xs font-black ${val.score >= val.max * 0.8 ? 'text-emerald-600' : val.score >= val.max * 0.5 ? 'text-amber-600' : 'text-red-500'}`} style={authorFont}>
                                {val.score} / {val.max}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                              <div
                                className={`h-full rounded-full ${val.score >= val.max * 0.8 ? 'bg-emerald-400' : val.score >= val.max * 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width: `${Math.min((val.score / val.max) * 100, 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed" style={poppinsFont}>{val.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Guide Remarks (if any) */}
              {modalSub.guide_remarks && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <p className="text-[9px] font-bold text-blue-500 uppercase" style={poppinsFont}>Guide Remarks</p>
                  <p className="text-sm text-blue-800 mt-1" style={authorFont}>{modalSub.guide_remarks}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
