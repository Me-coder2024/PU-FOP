'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2, Search, Filter } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SubmissionWithDetails extends SubmissionRow {
  student?: {
    full_name: string | null;
    email: string | null;
    university_id: string | null;
    institute_id: string | null;
    department_id: string | null;
  };
  guide?: { full_name: string | null; email?: string | null };
}

interface Institute { id: string; name: string; }
interface Department { id: string; name: string; institute_id: string; }

export default function DeanTitlesPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const { success, error: showError, warning } = useToast();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [instFilter, setInstFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const [modalSub, setModalSub] = useState<SubmissionWithDetails | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      // 1. Fetch ALL submissions across all statuses
      const { data: subsData, error: subsErr } = await supabase
        .from('submissions')
        .select(`
          *,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id, institute_id, department_id),
          guide:profiles!submissions_guide_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (subsErr) throw subsErr;
      if (subsData) setSubmissions(subsData as SubmissionWithDetails[]);

      // 2. Fetch Institutes
      const { data: instData } = await supabase
        .from('institutes')
        .select('id, name')
        .order('name', { ascending: true });
      if (instData) setInstitutes(instData);

      // 3. Fetch Departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('id, name, institute_id')
        .order('name', { ascending: true });
      if (deptData) setDepartments(deptData as Department[]);
    } catch (err) {
      console.error('Error fetching title browser data:', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile, fetchData]);

  // Filter departments by selected institute
  const filteredDepartments = useMemo(() => {
    if (instFilter === 'all') return departments;
    return departments.filter((d) => d.institute_id === instFilter);
  }, [departments, instFilter]);

  // Reset department filter when institute filter changes if selected department is not in institute
  const handleInstituteChange = (instId: string) => {
    setInstFilter(instId);
    if (instId !== 'all') {
      const validDepts = departments.filter((d) => d.institute_id === instId).map((d) => d.id);
      if (!validDepts.includes(deptFilter)) {
        setDeptFilter('all');
      }
    }
  };

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
      await fetchData();
    } catch (err) {
      console.error('Error saving title', err);
      showError('Failed to save title.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEditUnlock = async (submissionId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase.from('submissions').update({ edit_unlocked: !currentValue }).eq('id', submissionId);
      if (error) throw error;
      const sub = submissions.find((s) => s.id === submissionId);
      if (sub) {
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          title: !currentValue ? 'Edit Access Granted' : 'Edit Access Revoked',
          message: !currentValue
            ? `The Dean has unlocked your title "${sub.title}" for editing.`
            : `Edit access for your title "${sub.title}" has been revoked.`,
          type: !currentValue ? 'success' : 'warning',
          link: '/dashboard/submit',
        });
      }
      success(!currentValue ? 'Edit access granted.' : 'Edit access revoked.', 'Access Changed');
      await fetchData();
    } catch (err) {
      console.error('Error toggling edit unlock', err);
      showError('Failed to update edit access.', 'Error');
    }
  };

  const handleSendBack = async (submissionId: string) => {
    if (!remarks[submissionId]?.trim()) { warning('Please provide remarks.', 'Warning'); return; }
    setActionLoading(submissionId);
    try {
      const sub = submissions.find(s => s.id === submissionId);
      if (!sub) return;
      const { error } = await supabase.from('submissions')
        .update({ status: 'revision_requested' as SubmissionRow['status'], edit_unlocked: true })
        .eq('id', submissionId);
      if (error) throw error;
      await supabase.from('notifications').insert({
        user_id: sub.student_id,
        title: 'Revisions Requested by Dean',
        message: `The Dean has requested changes to your title "${sub.title}". Remarks: ${remarks[submissionId]}`,
        type: 'warning',
        link: '/dashboard/submit',
      });
      fetch('/api/notify-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dean_revision', submissionId, remarks: remarks[submissionId]?.trim() || '' }),
      }).catch(console.error);
      setModalSub(null);
      success('Title sent back for revisions.', 'Success');
      await fetchData();
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
      const res = await fetch('/api/finalize-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, userId: profile?.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to finalize' }));
        throw new Error(errData.error || 'Failed to finalize');
      }

      setModalSub(null);
      success('Submission finalized successfully!', 'Success');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to finalize.';
      showError(msg, 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      const matchesSearch = !searchQuery.trim()
        || s.title.toLowerCase().includes(searchQuery.toLowerCase())
        || s.student?.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
        || s.student?.email?.toLowerCase().includes(searchQuery.toLowerCase())
        || s.student?.university_id?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchesInst = instFilter === 'all' || s.student?.institute_id === instFilter;
      const matchesDept = deptFilter === 'all' || s.student?.department_id === deptFilter;

      return matchesSearch && matchesStatus && matchesInst && matchesDept;
    });
  }, [submissions, searchQuery, statusFilter, instFilter, deptFilter]);

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
          Title Browser
        </h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>
          Browse, review, filter, and finalize submitted dissertation titles across institutes and departments.
        </p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>Total Submissions</p>
              <p className="text-3xl font-black mt-1" style={authorFont}>{submissions.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:document-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Pending Dean Review</p>
          <p className="text-3xl font-black text-amber-600 mt-1" style={authorFont}>
            {submissions.filter(s => s.status === 'hod_accepted').length}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Finalized</p>
          <p className="text-3xl font-black text-emerald-600 mt-1" style={authorFont}>
            {submissions.filter(s => s.status === 'finalized').length}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>Edit Granted</p>
          <p className="text-3xl font-black text-indigo-600 mt-1" style={authorFont}>
            {submissions.filter(s => s.edit_unlocked).length}
          </p>
        </div>
      </div>

      {/* Filter Bar with Institute and Institute Departments */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, student name, enrollment..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all"
            style={authorFont}
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Institute Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={instFilter}
              onChange={(e) => handleInstituteChange(e.target.value)}
              className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE]"
              style={authorFont}
            >
              <option value="all">All Institutes</option>
              {institutes.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>

          {/* Department Filter (Filtered by selected institute) */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE]"
              style={authorFont}
            >
              <option value="all">
                {instFilter === 'all' ? 'All Departments' : 'All Institute Departments'}
              </option>
              {filteredDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE]"
              style={authorFont}
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted (Pending Guide)</option>
              <option value="guide_accepted">Guide Accepted (Pending HOD)</option>
              <option value="hod_accepted">HOD Accepted (Pending Dean)</option>
              <option value="finalized">Finalized</option>
              <option value="revision_requested">Revision Requested</option>
              <option value="guide_rejected">Guide Rejected</option>
              <option value="hod_rejected">HOD Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Submissions List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Icon icon="solar:document-bold-duotone" className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900" style={authorFont}>No submitted titles match your filters</p>
          <p className="text-xs text-slate-400 mt-1" style={authorFont}>Try adjusting your search query, institute, or department filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sub) => (
            <div key={sub.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                {editingId === sub.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4361EE]"
                      style={authorFont}
                    />
                    <button
                      onClick={() => handleEditTitle(sub.id)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                      style={authorFont}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200"
                      style={authorFont}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <h3 className="text-sm font-extrabold text-slate-900 leading-snug" style={authorFont}>
                    {sub.title}
                  </h3>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5" style={poppinsFont}>
                  <span><strong>{sub.student?.full_name || 'Student'}</strong></span>
                  {sub.student?.university_id && <span>• ID: {sub.student.university_id}</span>}
                  {sub.guide?.full_name && <span>• Guide: {sub.guide.full_name}</span>}
                  {sub.created_at && (
                    <span className="text-slate-400">
                      • {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons & Status Badge */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setEditingId(sub.id); setEditTitle(sub.title); }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Edit Title"
                >
                  <Icon icon="solar:pen-bold" className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleToggleEditUnlock(sub.id, sub.edit_unlocked)}
                  className={`p-2 rounded-lg transition-colors ${
                    sub.edit_unlocked ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                  title={sub.edit_unlocked ? 'Lock Title Edit Access' : 'Unlock Title Edit Access for Student'}
                >
                  <Icon icon={sub.edit_unlocked ? 'solar:lock-keyhole-minimalistic-unlocked-bold' : 'solar:lock-keyhole-minimalistic-bold'} className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setModalSub(sub)}
                  className="p-2 text-[#4361EE] hover:bg-[#4361EE]/10 rounded-lg transition-colors"
                  title="View Details"
                >
                  <Icon icon="solar:eye-bold" className="w-4 h-4" />
                </button>

                <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                  sub.status === 'finalized'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : sub.status === 'hod_accepted'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : sub.status === 'submitted'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`} style={poppinsFont}>
                  {sub.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {modalSub && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setModalSub(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="text-lg font-black text-slate-900" style={authorFont}>Submission Details</h2>
              <button onClick={() => setModalSub(null)} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase" style={poppinsFont}>Title</p>
                <p className="text-base font-bold text-slate-900 mt-1" style={authorFont}>{modalSub.title}</p>
              </div>

              {modalSub.status === 'hod_accepted' && (
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    onClick={() => handleSendBack(modalSub.id)}
                    disabled={actionLoading === modalSub.id}
                    className="px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all disabled:opacity-50"
                    style={authorFont}
                  >
                    Request Revision
                  </button>
                  <button
                    onClick={() => handleFinalize(modalSub.id)}
                    disabled={actionLoading === modalSub.id}
                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                    style={authorFont}
                  >
                    {actionLoading === modalSub.id ? 'Finalizing...' : 'Finalize Title'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
