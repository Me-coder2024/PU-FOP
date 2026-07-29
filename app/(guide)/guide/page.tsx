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
    student_guide?: {
      id: string;
      email: string;
      full_name: string | null;
    };
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

      // Fetch submissions with guide & student_guide relations
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          guide:profiles!submissions_guide_id_fkey(id, email, full_name),
          student:profiles!submissions_student_id_fkey(
            id, full_name, email, university_id, department_id, guide_id,
            student_guide:profiles!profiles_guide_id_fkey(id, email, full_name)
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
            (userEmail && s.guide?.email?.toLowerCase() === userEmail) ||
            (userEmail && s.student?.student_guide?.email?.toLowerCase() === userEmail);
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
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Full Submission Modal ===== */}
      {modalSub && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setModalSub(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
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
              <div className="bg-[#F0F2F8] rounded-xl p-4">
                <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Dissertation Title</p>
                <p className="text-base font-bold text-slate-900 mt-1" style={authorFont}>{modalSub.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Student Name</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalSub.student?.full_name || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Enrollment ID</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5" style={authorFont}>{modalSub.student?.university_id || 'N/A'}</p>
                </div>
              </div>

              {/* Criteria details */}
              {modalSub.criteria_details && (
                <div className="bg-[#F0F2F8] rounded-xl p-4 space-y-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Submitted Details & Criteria</p>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-white p-3 rounded-lg border border-slate-200">
                    {JSON.stringify(modalSub.criteria_details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
