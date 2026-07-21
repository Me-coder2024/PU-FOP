'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow, NotificationRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  submitted: { label: 'Submitted — Under Guide Review', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: 'solar:clock-circle-bold-duotone' },
  revision_requested: { label: 'Revision Requested by Guide', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: 'solar:pen-new-square-bold-duotone' },
  guide_accepted: { label: 'Guide Accepted — Under HOD Review', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: 'solar:clock-circle-bold-duotone' },
  guide_rejected: { label: 'Rejected by Guide', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: 'solar:close-circle-bold-duotone' },
  hod_accepted: { label: 'HOD Accepted — Finalized', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'solar:check-circle-bold-duotone' },
  hod_rejected: { label: 'Rejected by HOD', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: 'solar:close-circle-bold-duotone' },
  finalized: { label: 'Finalized', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'solar:check-circle-bold-duotone' },
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [guideName, setGuideName] = useState<string | null>(null);
  const [guideEmail, setGuideEmail] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [deadlineDate, setDeadlineDate] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      if (!profile) return;
      try {
        const { data: subData } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subData) {
          setSubmission(subData as SubmissionRow);
          if (subData.guide_id) {
            const { data: guideData } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', subData.guide_id)
              .single();
            if (guideData) {
              setGuideName(guideData.full_name);
              setGuideEmail(guideData.email);
            }
          }
        }

        const { data: windowData } = await supabase.rpc('get_submission_window', {
          p_institute_id: profile.institute_id || undefined,
        });
        if (windowData && windowData.length > 0) {
          setWindowOpen(true);
          setDaysLeft(windowData[0].days_remaining);
          if (windowData[0].end_date) {
            const end = new Date(windowData[0].end_date);
            setDeadlineDate(end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }));
          }
        }

        const { data: notifData } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (notifData) setNotifications(notifData as NotificationRow[]);
      } catch (err) {
        console.error('Error loading dashboard', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium" style={authorFont}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const statusConfig = submission ? STATUS_CONFIG[submission.status] : null;
  const canSubmit = windowOpen && (!submission || ['guide_rejected', 'hod_rejected'].includes(submission.status));
  const canEdit = submission && (
    submission.status === 'revision_requested' ||
    submission.edit_unlocked
  );

  const completionSteps = [
    !!submission,
    submission?.status === 'guide_accepted' || submission?.status === 'hod_accepted' || submission?.status === 'finalized',
    submission?.status === 'hod_accepted' || submission?.status === 'finalized',
    submission?.status === 'finalized',
  ];
  const completionPercent = Math.round((completionSteps.filter(Boolean).length / completionSteps.length) * 100);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl sm:text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
          My Dashboard
        </h1>
        <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center flex-shrink-0">
          <Icon icon="solar:document-bold" className="w-4 h-4 text-white" />
        </div>
        <div className="ml-auto">
          <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all">
            <Icon icon="solar:info-circle-linear" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===== Quick Access Cards ===== */}
      <div>
        <h2 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.15em] mb-4" style={authorFont}>Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Days Left Card - Blue */}
          <div className="bg-[#4361EE] rounded-2xl p-5 text-white min-h-[155px] flex flex-col justify-between shadow-lg shadow-[#4361EE]/20 relative overflow-hidden">
            {/* Subtle decorative circle */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70" style={authorFont}>Days Left</p>
            <div>
              {windowOpen ? (
                <>
                  <p className="text-[52px] font-bold leading-none tracking-tight" style={poppinsFont}>{daysLeft}</p>
                  <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider mt-2" style={authorFont}>
                    Until <span className="text-white/80">{deadlineDate || 'Deadline'}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black" style={authorFont}>Closed</p>
                  <p className="text-[11px] font-bold text-white/50 mt-1" style={authorFont}>Check back later</p>
                </>
              )}
            </div>
          </div>

          {/* Completion Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 min-h-[155px] flex flex-col justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400" style={authorFont}>Completion</p>
            <div>
              <p className="text-[52px] font-bold text-slate-900 leading-none tracking-tight" style={poppinsFont}>
                {completionPercent}<span className="text-[24px]">%</span>
              </p>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div
                  className="h-full bg-[#4361EE] rounded-full transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-[#4361EE] font-medium mt-1.5" style={authorFont}>Overall Progress</p>
            </div>
          </div>

          {/* Avg Score Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 min-h-[155px] flex flex-col justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400" style={authorFont}>Avg Score</p>
            <div>
              <p className="text-[52px] font-bold text-slate-900 leading-none tracking-tight" style={poppinsFont}>0.0</p>
              <p className="text-[10px] text-slate-400 font-medium mt-2" style={authorFont}>Evaluations average</p>
            </div>
          </div>

          {/* Guide Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 min-h-[155px] flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
                <Icon icon="solar:document-bold" className="w-4 h-4 text-white" />
              </div>
              {guideName && (
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                  {guideName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900" style={authorFont}>{guideName || 'Not Assigned'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5" style={authorFont}>
                {guideEmail || (submission?.guide_id ? 'Reviewing your title' : 'Assigned after submission')}
              </p>
              {guideName && guideEmail && (
                <a
                  href={`mailto:${guideEmail}`}
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-all"
                  style={authorFont}
                >
                  <Icon icon="solar:letter-bold" className="w-3.5 h-3.5" />
                  Send Email
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== My Submission Card ===== */}
      {submission && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider" style={authorFont}>My Submission</h2>
            {statusConfig && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border w-fit ${statusConfig.bg} ${statusConfig.color}`}>
                <Icon icon={statusConfig.icon} className="w-3 h-3" />
                <span className="truncate">{statusConfig.label}</span>
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>&quot;{submission.title}&quot;</h3>
          {submission.description && (
            <p className="text-sm text-slate-500 mb-4" style={authorFont}>{submission.description}</p>
          )}

          {/* Status Timeline */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4" style={authorFont}>Approval Timeline</h4>
            <div className="flex items-center gap-2">
              {[
                { label: 'Submitted', done: true },
                { label: 'Guide Review', done: ['guide_accepted', 'hod_accepted', 'hod_rejected', 'finalized'].includes(submission.status) },
                { label: 'HOD Review', done: ['hod_accepted', 'hod_rejected', 'finalized'].includes(submission.status) },
                { label: 'Finalized', done: submission.status === 'finalized' || submission.status === 'hod_accepted' },
              ].map((step, i) => (
                <React.Fragment key={step.label}>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      step.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}>
                      {step.done ? <Icon icon="solar:check-read-bold" className="w-4 h-4" /> : <span style={poppinsFont}>{i + 1}</span>}
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 mt-1.5 text-center whitespace-nowrap" style={authorFont}>{step.label}</span>
                  </div>
                  {i < 3 && (
                    <div className={`flex-1 h-0.5 rounded-full mt-[-16px] ${
                      step.done ? 'bg-emerald-300' : 'bg-slate-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Rejection reason */}
          {submission.rejection_reason && ['guide_rejected', 'hod_rejected'].includes(submission.status) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start gap-2">
                <Icon icon="solar:danger-triangle-bold-duotone" className="w-4 h-4 text-red-500 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-800" style={authorFont}>Rejection Reason</p>
                  <p className="text-xs text-red-700 mt-1" style={authorFont}>{submission.rejection_reason}</p>
                </div>
              </div>
              <Link
                href="/dashboard/submit"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#4361EE] text-white text-xs font-bold rounded-lg hover:bg-[#4361EE]/90 transition-all"
                style={authorFont}
              >
                <Icon icon="solar:restart-bold" className="w-3.5 h-3.5" />
                Resubmit Title
              </Link>
            </div>
          )}

          {/* Guide remarks */}
          {submission.guide_remarks && submission.status === 'revision_requested' && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <Icon icon="solar:pen-new-square-bold-duotone" className="w-4 h-4 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-800" style={authorFont}>Guide Remarks — Revision Required</p>
                  <p className="text-xs text-amber-700 mt-1" style={authorFont}>{submission.guide_remarks}</p>
                </div>
              </div>
              <Link
                href="/dashboard/submit"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-all"
                style={authorFont}
              >
                <Icon icon="solar:pen-new-square-bold-duotone" className="w-3.5 h-3.5" />
                Edit & Resubmit
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ===== No Submission State ===== */}
      {!submission && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-[#4361EE]/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Icon icon="solar:document-add-bold-duotone" className="w-8 h-8 text-[#4361EE]" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Title Submitted Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6" style={authorFont}>
            Submit your dissertation title proposal to start the approval process. Your title will be reviewed by your assigned guide.
          </p>
          {canSubmit ? (
            <Link
              href="/dashboard/submit"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4A017] text-white text-sm font-bold rounded-xl hover:bg-[#C4901A] transition-all shadow-lg shadow-[#D4A017]/20"
              style={authorFont}
            >
              <Icon icon="solar:send-bold" className="w-4 h-4" />
              Submit Your Title
              <Icon icon="solar:arrow-right-linear" className="w-4 h-4" />
            </Link>
          ) : (
            <p className="text-xs text-slate-400 font-medium" style={authorFont}>
              {!windowOpen ? 'The submission window is currently closed.' : 'Contact your guide for assistance.'}
            </p>
          )}
        </div>
      )}

      {/* ===== Notifications ===== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.15em]" style={authorFont}>Recent Notifications</h2>
          <span className="px-2.5 py-1 text-[10px] font-bold bg-blue-50 text-[#4361EE] rounded-full border border-blue-100" style={poppinsFont}>
            {notifications.length} updates
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {notifications.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {notifications.map((notif) => (
                <div key={notif.id} className={`p-4 flex items-start gap-3 hover:bg-slate-50/50 transition-colors ${!notif.read ? 'bg-blue-50/30' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    notif.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                    notif.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                    notif.type === 'error' ? 'bg-red-50 text-red-600' :
                    'bg-blue-50 text-[#4361EE]'
                  }`}>
                    <Icon icon={
                      notif.type === 'success' ? 'solar:check-circle-bold-duotone' :
                      notif.type === 'warning' ? 'solar:danger-triangle-bold-duotone' :
                      notif.type === 'error' ? 'solar:close-circle-bold-duotone' :
                      'solar:clock-circle-bold-duotone'
                    } className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900" style={authorFont}>{notif.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5" style={authorFont}>{notif.message}</p>
                    <p className="text-[9px] text-slate-400 mt-1" style={poppinsFont}>
                      {new Date(notif.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400 font-medium" style={authorFont}>No notifications yet</p>
              <p className="text-[11px] text-slate-400 mt-1" style={authorFont}>Updates will appear here when your submission is reviewed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
