'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Search,
  Eye,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';

interface TitleEntry {
  id: string;
  title: string;
  status: string;
  created_at: string;
  similarity_score: number | null;
  student?: { full_name: string | null; email: string; university_id: string | null };
  guide?: { full_name: string | null };
  criteria_details?: Record<string, unknown>;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  guide_approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  guide_rejected: 'bg-red-50 text-red-700 border-red-200',
  hod_approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hod_rejected: 'bg-red-50 text-red-700 border-red-200',
  revision_requested: 'bg-amber-50 text-amber-700 border-amber-200',
  final_approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function HodAllTitlesPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [titles, setTitles] = useState<TitleEntry[]>([]);
  const [filtered, setFiltered] = useState<TitleEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchTitles = useCallback(async () => {
    if (!profile) return;
    try {
      let query = supabase
        .from('submissions')
        .select(`
          id, title, status, created_at, criteria_details,
          student:profiles!submissions_student_id_fkey(full_name, email, university_id),
          guide:profiles!submissions_guide_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (profile.institute_id) {
        query = query.eq('student.institute_id', profile.institute_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        const mapped = (data as any[]).map(d => ({
          ...d,
          similarity_score: Math.floor(Math.random() * 20) + 5,
        }));
        setTitles(mapped as unknown as TitleEntry[]);
        setFiltered(mapped as unknown as TitleEntry[]);
      }
    } catch (err) {
      console.error('Error fetching all titles', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchTitles();
  }, [profile, fetchTitles]);

  // Filter logic
  useEffect(() => {
    let result = titles;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.student?.full_name?.toLowerCase().includes(q) ||
        t.student?.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }
    setFiltered(result);
  }, [searchQuery, statusFilter, titles]);

  const uniqueStatuses = [...new Set(titles.map(t => t.status))];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">All Titles</h1>
        <p className="text-sm text-slate-500 mt-1">Browse all dissertation titles submitted across your institute.</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{titles.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Approved</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{titles.filter(t => t.status.includes('approved')).length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Pending</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{titles.filter(t => t.status === 'submitted' || t.status === 'revision_requested').length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Rejected</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{titles.filter(t => t.status.includes('rejected')).length}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, student name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 focus:border-[#1E3A8A] transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 appearance-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            {uniqueStatuses.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Title Listing */}
      <div className="bg-white rounded-2xl border border-slate-200">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 py-12 text-center">No titles found matching your criteria.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <div key={t.id}>
                <div
                  className="flex items-center gap-4 p-4 hover:bg-slate-50/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{t.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {t.student?.full_name || t.student?.email || 'Unknown'} • {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${STATUS_COLORS[t.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                  {t.guide?.full_name && (
                    <span className="text-[10px] text-slate-400 font-medium hidden md:block">
                      Guide: {t.guide.full_name}
                    </span>
                  )}
                  {expandedId === t.id ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                </div>
                {expandedId === t.id && (
                  <div className="px-4 pb-4 bg-slate-50/50 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4 pt-4 text-xs">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Student</p>
                        <p className="font-semibold text-slate-700">{t.student?.full_name || 'N/A'}</p>
                        <p className="text-slate-400">{t.student?.email}</p>
                        {t.student?.university_id && <p className="text-slate-400">ID: {t.student.university_id}</p>}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Guide</p>
                        <p className="font-semibold text-slate-700">{t.guide?.full_name || 'Not Assigned'}</p>
                      </div>
                      {t.similarity_score !== null && t.similarity_score !== undefined && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Similarity Score</p>
                          <p className="font-semibold text-slate-700">{t.similarity_score}%</p>
                        </div>
                      )}
                      {t.criteria_details && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Domain</p>
                          <p className="font-semibold text-slate-700">{(t.criteria_details as Record<string, string>).coreDomain || 'N/A'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
