'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow, ProfileRow, SubmissionStatus } from '@/lib/supabase/types';
import {
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronUp,
  Users,
  ClipboardCheck,
  Clock,
  Send,
  AlertTriangle,
  FileText,
  MessageSquare,
} from 'lucide-react';

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
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithStudent[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  // Action states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id, department_id)
        `)
        .eq('guide_id', profile.id)
        .in('status', ['submitted', 'revision_requested', 'guide_accepted'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setSubmissions(data as SubmissionWithStudent[]);
        setActiveCount(data.filter((s: SubmissionWithStudent) => s.status === 'submitted').length);
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
          alert('Please provide a rejection reason.');
          setActionLoading(null);
          return;
        }
        newStatus = 'guide_rejected';
        notifTitle = 'Title Rejected by Guide';
        notifMessage = `Your dissertation title "${submission.title}" has been rejected. Reason: ${rejectionReason[submissionId]}`;
        notifType = 'error';
      } else {
        // revision — send back to student for edits
        if (!remarks[submissionId]?.trim()) {
          alert('Please provide remarks for the student.');
          setActionLoading(null);
          return;
        }
        newStatus = 'revision_requested';
        notifTitle = 'Revision Requested by Guide';
        notifMessage = `Your guide has requested changes to "${submission.title}". Please review the remarks and resubmit.`;
        notifType = 'warning';
      }

      // Update submission
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

      // Create notification for student
      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        title: notifTitle,
        message: notifMessage,
        type: notifType,
        link: '/dashboard',
      });

      // If accepted, notify HOD (find HOD in the student's institute)
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

      // Refresh list
      await fetchSubmissions();
      setExpandedId(null);
    } catch (err) {
      console.error('Error performing guide action', err);
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
          <p className="text-sm text-slate-400 font-medium">Loading review queue...</p>
        </div>
      </div>
    );
  }

  const pendingSubmissions = submissions.filter((s) => s.status === 'submitted');
  const revisionSubmissions = submissions.filter((s) => s.status === 'revision_requested');
  const acceptedSubmissions = submissions.filter((s) => s.status === 'guide_accepted');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Guide Review Queue</h1>
        <p className="text-sm text-slate-500 mt-1">Review, accept, or send back dissertation titles assigned to you.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E3A8A] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Pending Review</p>
              <p className="text-3xl font-black mt-1">{String(pendingSubmissions.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Awaiting Revision</p>
              <p className="text-3xl font-black text-amber-600 mt-1">{String(revisionSubmissions.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Forwarded to HOD</p>
              <p className="text-3xl font-black text-emerald-600 mt-1">{String(acceptedSubmissions.length).padStart(2, '0')}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Submissions List */}
      <div>
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
          Assigned Submissions ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
              <ClipboardCheck className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">All Caught Up!</h3>
            <p className="text-sm text-slate-500">No submissions currently assigned to you. New assignments will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const isActionLoading = actionLoading === sub.id;
              const student = sub.student;
              const details = (sub.criteria_details as Record<string, string>) || {};

              const statusBadge = sub.status === 'submitted'
                ? { label: 'Pending Review', bg: 'bg-blue-50 border-blue-200 text-blue-700' }
                : sub.status === 'revision_requested'
                ? { label: 'Revision Sent', bg: 'bg-amber-50 border-amber-200 text-amber-700' }
                : { label: 'Forwarded', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' };

              return (
                <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all">
                  {/* Collapsed Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[#1E3A8A]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#1E3A8A]">
                          {student?.full_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{sub.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {student?.full_name || 'Student'} • {student?.university_id || 'N/A'}
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

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-5 space-y-5">
                      {/* Title and Description */}
                      <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Full Title</h4>
                        <p className="text-sm font-semibold text-slate-900">&quot;{sub.title}&quot;</p>
                      </div>
                      {sub.description && (
                        <div>
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Description</h4>
                          <p className="text-sm text-slate-700">{sub.description}</p>
                        </div>
                      )}

                      {/* Criteria Details */}
                      {Object.keys(details).length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Research Details</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {details.drugName && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Drug Name</p>
                                <p className="text-xs font-semibold text-slate-800 mt-0.5">{details.drugName}</p>
                              </div>
                            )}
                            {details.dosageForm && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Dosage Form</p>
                                <p className="text-xs font-semibold text-slate-800 mt-0.5">{details.dosageForm}</p>
                              </div>
                            )}
                            {details.routeOfAdmin && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Route</p>
                                <p className="text-xs font-semibold text-slate-800 mt-0.5">{details.routeOfAdmin}</p>
                              </div>
                            )}
                            {details.excipients && (
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Excipients</p>
                                <p className="text-xs font-semibold text-slate-800 mt-0.5">{details.excipients}</p>
                              </div>
                            )}
                          </div>
                          {details.novelty && (
                            <div className="bg-slate-50 rounded-xl p-3 mt-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Novelty Statement</p>
                              <p className="text-xs text-slate-700 mt-0.5">{details.novelty}</p>
                            </div>
                          )}
                          {details.keywords && (
                            <div className="bg-slate-50 rounded-xl p-3 mt-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Keywords</p>
                              <p className="text-xs text-slate-700 mt-0.5">{details.keywords}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions — only for 'submitted' status */}
                      {sub.status === 'submitted' && (
                        <div className="border-t border-slate-100 pt-5 space-y-4">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Take Action</h4>

                          {/* Remarks for revision */}
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              Remarks (for student revision)
                            </label>
                            <textarea
                              value={remarks[sub.id] || ''}
                              onChange={(e) => setRemarks((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Provide feedback for the student to improve their title..."
                              rows={2}
                              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] transition-all resize-none"
                            />
                          </div>

                          {/* Rejection reason */}
                          <div>
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              Rejection Reason (if rejecting)
                            </label>
                            <textarea
                              value={rejectionReason[sub.id] || ''}
                              onChange={(e) => setRejectionReason((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                              placeholder="Explain why this title is being rejected..."
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
                              Accept & Forward
                            </button>
                            <button
                              onClick={() => handleAction(sub.id, 'revision')}
                              disabled={isActionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50"
                            >
                              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              Send for Revision
                            </button>
                            <button
                              onClick={() => handleAction(sub.id, 'reject')}
                              disabled={isActionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
                            >
                              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                              Reject
                            </button>
                          </div>

                          <p className="text-[10px] text-slate-400 font-medium">
                            <strong>Accept & Forward:</strong> Title goes to HOD. Student can no longer edit. •{' '}
                            <strong>Send for Revision:</strong> Student can edit and resubmit. •{' '}
                            <strong>Reject:</strong> Student must submit a new title.
                          </p>
                        </div>
                      )}

                      {/* Already reviewed info */}
                      {sub.status === 'revision_requested' && (
                        <div className="border-t border-slate-100 pt-4">
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                            <RotateCcw className="w-4 h-4 text-amber-600 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-amber-800">Revision Requested</p>
                              <p className="text-[11px] text-amber-700 mt-0.5">Waiting for the student to revise and resubmit.</p>
                              {sub.guide_remarks && <p className="text-[11px] text-amber-600 mt-1 italic">Your remarks: &quot;{sub.guide_remarks}&quot;</p>}
                            </div>
                          </div>
                        </div>
                      )}

                      {sub.status === 'guide_accepted' && (
                        <div className="border-t border-slate-100 pt-4">
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-emerald-800">Forwarded to HOD</p>
                              <p className="text-[11px] text-emerald-700 mt-0.5">This title has been forwarded and is under HOD review.</p>
                            </div>
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
