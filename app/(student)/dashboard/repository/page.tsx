'use client';

import React, { useEffect, useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface RepoTitle {
  id: string;
  title: string;
  status: string;
  created_at: string;
  similarity_score: number | null;
  criteria_details?: Record<string, unknown>;
}

export default function RepositoryPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [titles, setTitles] = useState<RepoTitle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');

  useEffect(() => {
    async function load() {
      if (!profile) return;
      try {
        const { data } = await supabase
          .from('submissions')
          .select('id, title, status, created_at, criteria_details')
          .in('status', ['finalized', 'hod_accepted', 'guide_accepted'])
          .order('created_at', { ascending: false });

        if (data) {
          const mapped: RepoTitle[] = (data as any[]).map(d => ({
            id: d.id,
            title: d.title,
            status: d.status,
            created_at: d.created_at,
            similarity_score: null,
            criteria_details: d.criteria_details,
          }));
          setTitles(mapped);
        }
      } catch (err) {
        console.error('Error loading repository', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const domains = [...new Set(
    titles
      .map(t => (t.criteria_details as Record<string, string>)?.coreDomain)
      .filter(Boolean)
  )];

  const filtered = titles.filter(t => {
    const matchesSearch = !searchQuery.trim() ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = domainFilter === 'all' ||
      (t.criteria_details as Record<string, string>)?.coreDomain === domainFilter;
    return matchesSearch && matchesDomain;
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
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
            Repository
          </h1>
          <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
            <Icon icon="solar:library-bold" className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-sm text-slate-500" style={authorFont}>
          Browse approved dissertation titles for reference and inspiration.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="solar:documents-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>Total Approved</p>
          </div>
          <p className="text-3xl font-bold text-slate-900" style={poppinsFont}>{titles.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="solar:folder-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>Domains</p>
          </div>
          <p className="text-3xl font-bold text-slate-900" style={poppinsFont}>{domains.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="solar:calendar-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>This Year</p>
          </div>
          <p className="text-3xl font-bold text-slate-900" style={poppinsFont}>
            {titles.filter(t => new Date(t.created_at).getFullYear() === new Date().getFullYear()).length}
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Icon icon="solar:magnifer-linear" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dissertation titles..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
            style={authorFont}
          />
        </div>
        {domains.length > 0 && (
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 appearance-none cursor-pointer min-w-[180px]"
            style={authorFont}
          >
            <option value="all">All Domains</option>
            {domains.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {/* Title Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <Icon icon="solar:library-bold-duotone" className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Titles Found</h3>
          <p className="text-sm text-slate-500" style={authorFont}>
            {searchQuery ? 'Try adjusting your search query.' : 'No approved dissertations available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => {
            const details = t.criteria_details as Record<string, string> | undefined;
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-[#4361EE]/30 hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[9px] font-black uppercase tracking-widest">
                    {t.status.replace(/_/g, ' ')}
                  </span>
                  <p className="text-[10px] text-slate-400" style={poppinsFont}>
                    {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mb-3 line-clamp-2 group-hover:text-[#4361EE] transition-colors" style={authorFont}>
                  {t.title}
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  {details?.coreDomain && (
                    <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[9px] font-bold border border-slate-100">
                      {details.coreDomain}
                    </span>
                  )}
                  {details?.drugName && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-500 rounded-md text-[9px] font-bold border border-blue-100">
                      {details.drugName}
                    </span>
                  )}
                  {t.similarity_score == null && <span className="text-xs text-slate-500">Similarity not available</span>}
                  {t.similarity_score !== null && t.similarity_score !== undefined && (
                    <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-md text-[9px] font-bold border border-slate-100" style={poppinsFont}>
                      Sim: {t.similarity_score}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
