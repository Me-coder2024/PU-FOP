'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

import { useToast } from '@/components/ui/Toast';

interface SubmissionWithDetails extends SubmissionRow {
  student?: { full_name: string | null; email: string; university_id: string | null; institute_id: string | null };
}

interface GuideProfile {
  id: string;
  full_name: string | null;
  email: string;
}

export default function HodAssignGuidePage() {
  const { profile } = useRole();
  const { success, error: showError, warning } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [unassigned, setUnassigned] = useState<SubmissionWithDetails[]>([]);
  const [guides, setGuides] = useState<GuideProfile[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [guideSelection, setGuideSelection] = useState<Record<string, string>>({});

  // Full form modal
  const [modalSub, setModalSub] = useState<SubmissionWithDetails | null>(null);

  const fetchGuides = useCallback(async () => {
    if (!profile?.institute_id) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'guide')
      .eq('institute_id', profile.institute_id)
      .order('full_name', { ascending: true });
    if (data) setGuides(data);
  }, [profile, supabase]);

  const fetchUnassigned = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id, institute_id)
        `)
        .eq('status', 'submitted')
        .is('guide_id', null)
        .order('created_at', { ascending: true });

      if (data) {
        const filtered = profile.institute_id
          ? (data as SubmissionWithDetails[]).filter(s => s.student?.institute_id === profile.institute_id)
          : (data as SubmissionWithDetails[]);
        setUnassigned(filtered);
      }
    } catch (err) {
      console.error('Error fetching unassigned submissions', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) {
      fetchUnassigned();
      fetchGuides();
    }
  }, [profile, fetchUnassigned, fetchGuides]);

  const handleAssignGuide = async (submissionId: string) => {
    const guideId = guideSelection[submissionId];
    if (!guideId) { warning('Please select a guide.', 'Warning'); return; }
    setActionLoading(submissionId);
    try {
      const submission = unassigned.find(s => s.id === submissionId);
      if (!submission) return;

      const { error } = await supabase
        .from('submissions')
        .update({ guide_id: guideId })
        .eq('id', submissionId);

      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: guideId,
        title: 'New Title Assigned',
        message: `A dissertation title "${submission.title}" has been assigned to you for review by the HOD.`,
        type: 'info',
        link: '/guide',
      });

      await supabase.from('notifications').insert({
        user_id: submission.student_id,
        title: 'Guide Assigned',
        message: `A guide has been assigned to review your title "${submission.title}".`,
        type: 'info',
        link: '/dashboard',
      });

      success('Guide assigned successfully!', 'Success');
      await fetchUnassigned();
    } catch (err) {
      console.error('Error assigning guide', err);
      showError('Failed to assign guide.', 'Error');
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>Assign Guide</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>Assign guides to new student submissions from your institute.</p>
      </div>

      {/* Stat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Awaiting Assignment</p>
          <p className="text-3xl font-black mt-1" style={authorFont}>{String(unassigned.length).padStart(2, '0')}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Available Guides</p>
          <p className="text-3xl font-black text-[#4361EE] mt-1" style={authorFont}>{String(guides.length).padStart(2, '0')}</p>
        </div>
      </div>

      {/* Unassigned list */}
      {unassigned.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-[#4361EE]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#4361EE]/10">
            <Icon icon="solar:check-circle-bold-duotone" className="w-8 h-8 text-[#4361EE]/40" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>All Caught Up!</h3>
          <p className="text-sm text-slate-500" style={authorFont}>No unassigned submissions. New student submissions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unassigned.map((sub) => {
            const isAssigning = actionLoading === sub.id;
            const details = (sub.criteria_details as Record<string, string>) || {};

            return (
              <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-[#4361EE]/30 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-[#4361EE]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#4361EE]">
                        {sub.student?.full_name?.[0]?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate" style={authorFont}>{sub.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5" style={poppinsFont}>
                        {sub.student?.full_name || 'Student'} • {sub.student?.university_id || 'N/A'} • {new Date(sub.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Eye icon for full form */}
                    <button
                      onClick={() => setModalSub(sub)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#4361EE] hover:bg-[#4361EE]/5 transition-all"
                      title="View full form"
                    >
                      <Icon icon="solar:eye-bold-duotone" className="w-5 h-5" />
                    </button>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 border-amber-200 text-amber-700" style={poppinsFont}>
                      No Guide
                    </span>
                  </div>
                </div>

                {/* Guide selection */}
                <div className="mt-4 flex items-center gap-3">
                  <select
                    value={guideSelection[sub.id] || ''}
                    onChange={(e) => setGuideSelection(prev => ({ ...prev, [sub.id]: e.target.value }))}
                    className="flex-1 px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all"
                    style={authorFont}
                  >
                    <option value="">Select a guide...</option>
                    {guides.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.full_name || g.email}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssignGuide(sub.id)}
                    disabled={isAssigning || !guideSelection[sub.id]}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4361EE] text-white text-xs font-bold rounded-xl hover:bg-[#4361EE]/90 transition-all disabled:opacity-50 shadow-lg shadow-[#4361EE]/20"
                    style={authorFont}
                  >
                    {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:user-plus-bold" className="w-3.5 h-3.5" />}
                    Assign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Full Form Modal ===== */}
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

              {/* Student info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Student</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.student?.full_name || 'N/A'}</p>
                </div>
                <div className="bg-[#F0F2F8] rounded-xl p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Enrollment</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.student?.university_id || 'N/A'}</p>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
