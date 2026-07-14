'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import {
  Loader2,
  Search,
  Eye,
  Edit3,
  Save,
  X,
  CheckCircle,
  Unlock,
  Lock,
  Filter,
} from 'lucide-react';

interface SubmissionWithDetails extends SubmissionRow {
  student?: { full_name: string | null; university_id: string | null; department_id: string | null };
  guide?: { full_name: string | null };
}

export default function PgDirectorPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

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

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'edit_title',
        table_name: 'submissions',
        record_id: submissionId,
        old_data: { title: old?.title },
        new_data: { title: editTitle.trim() },
      });

      setEditingId(null);
      await fetchSubmissions();
    } catch (err) {
      console.error('Error saving title', err);
      alert('Failed to save title.');
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
        // Notify student
        await supabase.from('notifications').insert({
          user_id: sub.student_id,
          title: !currentValue ? 'Edit Access Granted' : 'Edit Access Revoked',
          message: !currentValue
            ? `The PG Director has unlocked your title "${sub.title}" for editing. You can now make changes.`
            : `Edit access for your title "${sub.title}" has been revoked.`,
          type: !currentValue ? 'success' : 'warning',
          link: '/dashboard/submit',
        });
      }

      await fetchSubmissions();
    } catch (err) {
      console.error('Error toggling edit unlock', err);
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
        <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">PG Director — Title Browser</h1>
        <p className="text-sm text-slate-500 mt-1">View finalized titles. Edit title text only. Unlock student editing access.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E3A8A] rounded-2xl p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Total Finalized</p>
          <p className="text-3xl font-black mt-1">{submissions.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Edit Unlocked</p>
          <p className="text-3xl font-black text-amber-600 mt-1">{submissions.filter(s => s.edit_unlocked).length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Search Results</p>
          <p className="text-3xl font-black text-slate-700 mt-1">{filtered.length}</p>
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
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
          >
            <option value="all">All Statuses</option>
            <option value="hod_accepted">HOD Accepted</option>
            <option value="finalized">Finalized</option>
          </select>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">No titles found</p>
            <p className="text-xs text-slate-400 mt-1">Adjust your filters or wait for HOD-accepted titles.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((sub) => {
              const isEditing = editingId === sub.id;
              return (
                <div key={sub.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white border border-[#1E3A8A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30"
                            autoFocus
                          />
                          <button
                            onClick={() => handleEditTitle(sub.id)}
                            disabled={saving}
                            className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-slate-900">{sub.title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span>{sub.student?.full_name || 'Student'}</span>
                        <span>•</span>
                        <span>{sub.student?.university_id || 'N/A'}</span>
                        <span>•</span>
                        <span>Guide: {sub.guide?.full_name || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Edit title button */}
                      {!isEditing && (
                        <button
                          onClick={() => { setEditingId(sub.id); setEditTitle(sub.title); }}
                          className="p-2 text-slate-400 hover:text-[#1E3A8A] hover:bg-[#1E3A8A]/5 rounded-lg transition-all"
                          title="Edit title text"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Toggle edit unlock for student */}
                      <button
                        onClick={() => handleToggleEditUnlock(sub.id, sub.edit_unlocked)}
                        className={`p-2 rounded-lg transition-all ${
                          sub.edit_unlocked
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={sub.edit_unlocked ? 'Revoke student edit access' : 'Grant student edit access'}
                      >
                        {sub.edit_unlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>

                      {/* Status badge */}
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        sub.status === 'finalized' || sub.status === 'hod_accepted'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {sub.status === 'hod_accepted' ? 'HOD Accepted' : 'Finalized'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
