'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2, Search, Filter } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SubmissionWithDetails extends SubmissionRow {
  student?: { full_name: string | null; university_id: string | null; department_id: string | null };
  guide?: { full_name: string | null };
}

export default function PgDirectorPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const { success, error: showError, warning } = useToast();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  // Edit title state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // Full form modal
  const [modalSub, setModalSub] = useState<SubmissionWithDetails | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, university_id, department_id),
          guide:profiles!submissions_guide_id_fkey(full_name)
        `)
        .in('status', ['hod_accepted', 'finalized'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setSubmissions(data as SubmissionWithDetails[]);
    } catch (err) {
      console.error('Error fetching submissions', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchSubmissions();
  }, [profile, fetchSubmissions]);

  const handleEditTitle = async (submissionId: string) => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const old = submissions.find((s) => s.id === submissionId);
      const { error } = await supabase
        .from('submissions')
        .update({ title: editTitle.trim() })
        .eq('id', submissionId);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'edit_title',
        table_name: 'submissions',
        record_id: submissionId,
        old_data: { title: old?.title },
        new_data: { title: editTitle.trim() },
      });
      setEditingId(null);
      success('Title saved successfully!', 'Success');
      await fetchSubmissions();
    } catch (err) {
      console.error('Error saving title', err);
      showError('Failed to save title.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEditUnlock = async (submissionId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ edit_unlocked: !currentValue })
        .eq('id', submissionId);
      if (error) throw error;
      const sub = submissions.find((s) => s.id === submissionId);
      if (sub) {
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          title: !currentValue ? 'Edit Access Granted' : 'Edit Access Revoked',
          message: !currentValue
            ? `The PG Director has unlocked your title "${sub.title}" for editing.`
            : `Edit access for your title "${sub.title}" has been revoked.`,
          type: !currentValue ? 'success' : 'warning',
          link: '/dashboard/submit',
        });
      }
      success(!currentValue ? 'Edit access granted.' : 'Edit access revoked.', 'Access Changed');
      await fetchSubmissions();
    } catch (err) {
      console.error('Error toggling edit unlock', err);
      showError('Failed to update edit access.', 'Error');
    }
  };

  const handleSendBack = async (submissionId: string) => {
    if (!remarks[submissionId]?.trim()) {
      warning('Please provide remarks explaining what needs to be changed.', 'Warning');
      return;
    }
    setActionLoading(submissionId);
    try {
      const sub = submissions.find(s => s.id === submissionId);
      if (!sub) return;
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'revision_requested' as SubmissionRow['status'],
          edit_unlocked: true,
        })
        .eq('id', submissionId);
      if (error) throw error;
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        title: 'Revisions Requested by PG Director',
        message: `The PG Director has requested changes to your title "${sub.title}". Remarks: ${remarks[submissionId]}`,
        type: 'warning',
        link: '/dashboard/submit',
      });
      setModalSub(null);
      success('Title sent back for revisions.', 'Success');
      await fetchSubmissions();
    } catch (err) {
      console.error('Error sending back', err);
      showError('Failed to send back.', 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFinalize = async (submissionId: string) => {
    setActionLoading(submissionId);
    try {
      const sub = submissions.find(s => s.id === submissionId);
      if (!sub) return;

      const res = await fetch('/api/finalize-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          userId: profile?.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to finalize' }));
        throw new Error(errData.error || 'Failed to finalize');
      }

      setModalSub(null);
      success('Submission finalized successfully!', 'Success');
      await fetchSubmissions();
    } catch (err: any) {
      console.error('Error finalizing', err);
      showError(err.message || 'Failed to finalize.', 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = submissions.filter((s) => {
    const matchesSearch = !searchQuery.trim()
      || s.title.toLowerCase().includes(searchQuery.toLowerCase())
      || s.student?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      || s.student?.university_id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>PG Director — Title Review</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>Review HOD-forwarded titles. Finalize, edit, or send back for revisions.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Pending Review</p>
              <p className="text-3xl font-black mt-1" style={authorFont}>{submissions.filter(s => s.status === 'hod_accepted').length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:clock-circle-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Finalized</p>
          <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>{submissions.filter(s => s.status === 'finalized').length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Edit Unlocked</p>
          <p className="text-3xl font-black text-amber-600 mt-1" style={authorFont}>{submissions.filter(s => s.edit_unlocked).length}</p>
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
            placeholder="Search by title, student name, or enrollment..."
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
            <option value="hod_accepted">HOD Accepted</option>
            <option value="finalized">Finalized</option>
          </select>
        </div>
      </div>

      {/* Submissions List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Icon icon="solar:eye-bold-duotone" className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900" style={authorFont}>No titles found</p>
          <p className="text-xs text-slate-400 mt-1" style={authorFont}>Adjust filters or wait for HOD-accepted titles.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => {
            const isEditing = editingId === sub.id;

            return (
              <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-[#4361EE]/30 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white border border-[#4361EE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30"
                          style={authorFont}
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditTitle(sub.id)}
                          disabled={saving}
                          className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon icon="solar:diskette-bold" className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                        >
                          <Icon icon="solar:close-circle-bold" className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-slate-900" style={authorFont}>{sub.title}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500" style={poppinsFont}>
                      <span>{sub.student?.full_name || 'Student'}</span>
                      <span>•</span>
                      <span>{sub.student?.university_id || 'N/A'}</span>
                      <span>•</span>
                      <span>Guide: {sub.guide?.full_name || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isEditing && (
                      <button
                        onClick={() => { setEditingId(sub.id); setEditTitle(sub.title); }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#4361EE] hover:bg-[#4361EE]/5 transition-all"
                        title="Edit title text"
                      >
                        <Icon icon="solar:pen-2-bold-duotone" className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleEditUnlock(sub.id, sub.edit_unlocked)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                        sub.edit_unlocked
                          ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={sub.edit_unlocked ? 'Revoke student edit access' : 'Grant student edit access'}
                    >
                      <Icon icon={sub.edit_unlocked ? 'solar:lock-unlocked-bold-duotone' : 'solar:lock-bold-duotone'} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setModalSub(sub)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#4361EE] hover:bg-[#4361EE]/5 transition-all"
                      title="View full form"
                    >
                      <Icon icon="solar:eye-bold-duotone" className="w-5 h-5" />
                    </button>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      sub.status === 'finalized'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-blue-50 border-blue-200 text-blue-700'
                    }`} style={poppinsFont}>
                      {sub.status === 'hod_accepted' ? 'HOD Accepted' : 'Finalized'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Full Form Modal ===== */}
      {modalSub && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setModalSub(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-lg font-black text-slate-900" style={authorFont}>Submission Details</h2>
              <button onClick={() => setModalSub(null)} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5" />
              </button>
            </div>

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
                  <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>Guide</p>
                  <p className="text-xs font-semibold text-slate-800 mt-0.5" style={authorFont}>{modalSub.guide?.full_name || 'N/A'}</p>
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
                  { key: 'drugName', label: 'Drug Name' }, { key: 'dosageForm', label: 'Dosage Form' },
                  { key: 'primarySubject', label: 'Primary Subject' }, { key: 'coreDomain', label: 'Core Domain' },
                  { key: 'methodology', label: 'Methodology' }, { key: 'toolsInstruments', label: 'Tools & Instruments' },
                  { key: 'workLocation', label: 'Work Location' }, { key: 'excipients', label: 'Excipients' },
                  { key: 'keywords', label: 'Keywords' }, { key: 'novelty', label: 'Novelty' },
                ];
                const vis = fields.filter(f => details[f.key]);
                if (vis.length === 0) return null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {vis.map(f => (
                      <div key={f.key} className="bg-[#F0F2F8] rounded-xl p-3">
                        <p className="text-[9px] font-bold text-slate-400 uppercase" style={poppinsFont}>{f.label}</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 line-clamp-3" style={authorFont}>{String(details[f.key])}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {modalSub.hod_remarks && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-[9px] font-bold text-blue-600 uppercase" style={poppinsFont}>HOD Remarks</p>
                  <p className="text-xs text-blue-800 mt-0.5" style={authorFont}>{modalSub.hod_remarks}</p>
                </div>
              )}

              {/* Actions for hod_accepted */}
              {modalSub.status === 'hod_accepted' && (
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>PG Director Actions</h4>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1" style={authorFont}>
                      Remarks <span className="text-slate-400 font-normal">(required for sending back)</span>
                    </label>
                    <textarea
                      value={remarks[modalSub.id] || ''}
                      onChange={(e) => setRemarks(prev => ({ ...prev, [modalSub.id]: e.target.value }))}
                      placeholder="Add remarks if sending back for revisions..."
                      rows={2}
                      className="w-full px-3 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all resize-none"
                      style={authorFont}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleFinalize(modalSub.id)}
                      disabled={actionLoading === modalSub.id}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                      style={authorFont}
                    >
                      {actionLoading === modalSub.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="solar:cup-star-bold" className="w-3.5 h-3.5" />}
                      Finalize Title
                    </button>
                    <button
                      onClick={() => handleSendBack(modalSub.id)}
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

              {modalSub.status === 'finalized' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                  <Icon icon="solar:cup-star-bold-duotone" className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800" style={authorFont}>Finalized</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5" style={authorFont}>This title has been finalized and approved.</p>
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
