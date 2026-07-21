'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SubmissionWithDetails extends SubmissionRow {
  student?: { full_name: string | null; email: string; university_id: string | null; institute_id: string | null };
  guide?: { full_name: string | null };
}

export default function HodPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hodRemarks, setHodRemarks] = useState<Record<string, string>>({});

  // Full form modal
  const [modalSub, setModalSub] = useState<SubmissionWithDetails | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id, institute_id),
          guide:profiles!submissions_guide_id_fkey(full_name)
        `)
        .in('status', ['guide_accepted', 'hod_accepted', 'revision_requested'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        const filtered = profile.institute_id
          ? (data as SubmissionWithDetails[]).filter(s => s.student?.institute_id === profile.institute_id)
          : (data as SubmissionWithDetails[]);
        setSubmissions(filtered);
      }
    } catch (err) {
      console.error('Error fetching HOD submissions', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchSubmissions();
  }, [profile, fetchSubmissions]);

  const handleAction = async (submissionId: string, action: 'forward' | 'send_back') => {
    setActionLoading(submissionId);
    try {
      const submission = submissions.find((s) => s.id === submissionId);
      if (!submission) return;

      if (action === 'forward') {
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            status: 'hod_accepted' as SubmissionRow['status'],
            hod_id: profile!.id,
            hod_reviewed_at: new Date().toISOString(),
            hod_remarks: hodRemarks[submissionId]?.trim() || null,
          })
          .eq('id', submissionId);
        if (updateError) throw updateError;

        await supabase.from('notifications').insert({
          user_id: submission.student_id,
          title: 'Title Forwarded by HOD',
          message: `Your dissertation title "${submission.title}" has been forwarded to the PG Director for review.`,
          type: 'success',
          link: '/dashboard',
        });

        if (submission.guide_id) {
          await supabase.from('notifications').insert({
            user_id: submission.guide_id,
            title: 'Title Forwarded by HOD',
            message: `The title "${submission.title}" has been forwarded to the PG Director.`,
            type: 'info',
            link: '/guide',
          });
        }

        const { data: pgDean } = await supabase
          .from('profiles')
          .select('id')
          .in('role', ['pg_director', 'dean']);
        if (pgDean && pgDean.length > 0) {
          const notifs = pgDean.map((p: { id: string }) => ({
            user_id: p.id,
            title: 'New Title for Review',
            message: `A new dissertation title "${submission.title}" has been forwarded by the HOD.`,
            type: 'info' as const,
            link: '/pg-director',
          }));
          await supabase.from('notifications').insert(notifs);
        }
      } else {
        if (!hodRemarks[submissionId]?.trim()) {
          alert('Please provide remarks explaining what needs to be changed.');
          setActionLoading(null);
          return;
        }
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            status: 'revision_requested' as SubmissionRow['status'],
            edit_unlocked: true,
            hod_id: profile!.id,
            hod_reviewed_at: new Date().toISOString(),
            hod_remarks: hodRemarks[submissionId].trim(),
          })
          .eq('id', submissionId);
        if (updateError) throw updateError;

        await supabase.from('notifications').insert({
          user_id: submission.student_id,
          title: 'Revisions Requested by HOD',
          message: `The HOD has requested changes to your title "${submission.title}". Remarks: ${hodRemarks[submissionId]}`,
          type: 'warning',
          link: '/dashboard/submit',
        });
      }

      setModalSub(null);
      await fetchSubmissions();
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
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  const pendingReview = submissions.filter((s) => s.status === 'guide_accepted');
  const forwarded = submissions.filter((s) => s.status === 'hod_accepted');
  const sentBack = submissions.filter((s) => s.status === 'revision_requested');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>HOD Review Queue</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>Review guide-accepted titles. Forward to PG Director or send back for edits.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Pending Review</p>
              <p className="text-3xl font-black mt-1" style={authorFont}>{String(pendingReview.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:clock-circle-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Forwarded</p>
              <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>{String(forwarded.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Sent Back</p>
              <p className="text-3xl font-black text-amber-600 mt-1" style={authorFont}>{String(sentBack.length).padStart(2, '0')}</p>
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
          All Submissions ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-[#4361EE]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#4361EE]/10">
              <Icon icon="solar:clipboard-check-bold-duotone" className="w-8 h-8 text-[#4361EE]/40" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Submissions</h3>
            <p className="text-sm text-slate-500" style={authorFont}>Guide-accepted submissions will appear here for your review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const statusBadge = sub.status === 'guide_accepted'
                ? { label: 'Awaiting Review', bg: 'bg-blue-50 border-blue-200 text-blue-700', icon: 'solar:clock-circle-bold-duotone' }
                : sub.status === 'hod_accepted'
                ? { label: 'Forwarded', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: 'solar:check-circle-bold-duotone' }
                : sub.status === 'revision_requested'
                ? { label: 'Sent Back', bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: 'solar:pen-new-square-bold-duotone' }
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
                          {sub.student?.full_name || 'Student'} • Guide: {sub.guide?.full_name || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Eye icon */}
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

      {/* ===== Full Form Modal with Actions ===== */}
      {modalSub && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModalSub(null)}>
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
              {/* Title */}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest" style={poppinsFont}>Title</p>
                <p className="text-sm font-bold text-slate-900 mt-1" style={authorFont}>&quot;{modalSub.title}&quot;</p>
              </div>

              {/* Student & Guide */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Student</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.student?.full_name || 'N/A'}</p>
                  <p className="text-[10px] text-slate-500" style={poppinsFont}>{modalSub.student?.university_id || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Guide</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.guide?.full_name || 'Not assigned'}</p>
                </div>
              </div>

              {/* Statement of Novelty */}
              {modalSub.description && (
                <div className="bg-[#F0F2F8] rounded-xl p-4">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Statement of Novelty</p>
                  <p className="text-xs text-slate-700 mt-1" style={authorFont}>{modalSub.description}</p>
                </div>
              )}

              {/* Criteria details */}
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
                  { key: 'routeOfAdmin', label: 'Route of Admin' },
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

              {/* Guide remarks */}
              {modalSub.guide_remarks && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[9px] font-bold text-blue-600 uppercase" style={poppinsFont}>Guide Remarks</p>
                  <p className="text-xs text-blue-800 mt-0.5" style={authorFont}>{modalSub.guide_remarks}</p>
                </div>
              )}

              {/* Actions — only for guide_accepted */}
              {modalSub.status === 'guide_accepted' && (
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>HOD Decision</h4>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                      Remarks <span className="text-slate-400 font-normal">(required for sending back)</span>
                    </label>
                    <textarea
                      value={hodRemarks[modalSub.id] || ''}
                      onChange={(e) => setHodRemarks((prev) => ({ ...prev, [modalSub.id]: e.target.value }))}
                      placeholder="Add your remarks..."
                      rows={2}
                      className="w-full px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all resize-none"
                      style={authorFont}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAction(modalSub.id, 'forward')}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#4361EE] text-white text-xs font-bold rounded-xl hover:bg-[#4361EE]/90 transition-all disabled:opacity-50 shadow-lg shadow-[#4361EE]/20"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:arrow-right-bold" className="w-3.5 h-3.5" />}
                      Forward to PG Director & Dean
                    </button>
                    <button
                      onClick={() => handleAction(modalSub.id, 'send_back')}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:undo-left-bold" className="w-3.5 h-3.5" />}
                      Send Back for Edits
                    </button>
                  </div>
                </div>
              )}

              {/* Already forwarded */}
              {modalSub.status === 'hod_accepted' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:check-circle-bold-duotone" className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800" style={authorFont}>Forwarded to PG Director & Dean</p>
                    {modalSub.hod_remarks && <p className="text-[11px] text-emerald-700 mt-0.5" style={authorFont}>Remarks: {modalSub.hod_remarks}</p>}
                  </div>
                </div>
              )}

              {/* Sent back */}
              {modalSub.status === 'revision_requested' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:pen-new-square-bold-duotone" className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800" style={authorFont}>Sent Back for Edits</p>
                    {modalSub.hod_remarks && <p className="text-[11px] text-amber-700 mt-0.5" style={authorFont}>Remarks: {modalSub.hod_remarks}</p>}
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
