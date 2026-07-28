'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Calendar,
  FileText,
  Megaphone,
  CheckCircle,
  Clock,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  X,
  Eye,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import Link from 'next/link';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SubmissionItem {
  id?: string;
  title: string;
  status: string;
  created_at: string;
  student?: {
    full_name: string | null;
    email?: string;
    university_id?: string | null;
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  submitted: { label: 'Submitted (Pending Guide)', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  revision_requested: { label: 'Revision Requested', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  guide_accepted: { label: 'Guide Accepted (Pending HOD)', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  guide_rejected: { label: 'Guide Rejected', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  hod_accepted: { label: 'HOD Accepted', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  hod_rejected: { label: 'HOD Rejected', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  finalized: { label: 'Finalized', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

export default function DeanDashboard() {
  const { profile } = useRole();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalSubmissions: 0,
    pendingGuide: 0,
    pendingHod: 0,
    finalized: 0,
    windowActive: false,
    daysLeft: 0,
  });

  const [allSubmissions, setAllSubmissions] = useState<SubmissionItem[]>([]);

  // Card Inline Pagination State
  const [cardPage, setCardPage] = useState(1);
  const cardPerPage = 5;

  // Pop-in Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalStatusFilter, setModalStatusFilter] = useState('all');
  const [modalPage, setModalPage] = useState(1);
  const modalPerPage = 8;

  useEffect(() => {
    async function fetchStats() {
      if (!profile) return;
      try {
        // Fetch student count
        const { count: studentCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'student');

        // Fetch submissions
        const { data: subs, error: subsErr } = await supabase
          .from('submissions')
          .select('id, status, created_at, title, student:profiles!submissions_student_id_fkey(full_name, email, university_id)')
          .order('created_at', { ascending: false });

        if (subsErr) throw subsErr;

        let pg = 0;
        let ph = 0;
        let fin = 0;
        if (subs) {
          subs.forEach((s) => {
            if (s.status === 'submitted') pg++;
            if (s.status === 'guide_accepted') ph++;
            if (s.status === 'hod_accepted' || s.status === 'finalized') fin++;
          });
        }

        // Fetch active submission window
        const { data: windowData } = await supabase
          .from('submission_window')
          .select('*')
          .order('end_date', { ascending: false })
          .limit(1);

        let windowActive = false;
        let daysLeft = 0;
        if (windowData && windowData.length > 0) {
          const now = new Date();
          const start = new Date(windowData[0].start_date);
          const end = new Date(windowData[0].end_date);
          if (now >= start && now <= end) {
            windowActive = true;
            daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          }
        }

        setStats({
          totalStudents: studentCount || 0,
          totalSubmissions: subs?.length || 0,
          pendingGuide: pg,
          pendingHod: ph,
          finalized: fin,
          windowActive,
          daysLeft,
        });

        if (subs) {
          setAllSubmissions(subs as SubmissionItem[]);
        }
      } catch (err) {
        console.error('Error fetching Dean stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [profile, supabase]);

  // Card Pagination Calculations
  const totalCardPages = Math.max(1, Math.ceil(allSubmissions.length / cardPerPage));
  const currentCardItems = useMemo(() => {
    const start = (cardPage - 1) * cardPerPage;
    return allSubmissions.slice(start, start + cardPerPage);
  }, [allSubmissions, cardPage]);

  // Modal Filtering & Pagination Calculations
  const filteredModalSubmissions = useMemo(() => {
    return allSubmissions.filter((sub) => {
      const matchesSearch = !modalSearch.trim()
        || sub.title.toLowerCase().includes(modalSearch.toLowerCase())
        || sub.student?.full_name?.toLowerCase().includes(modalSearch.toLowerCase())
        || sub.student?.email?.toLowerCase().includes(modalSearch.toLowerCase());
      const matchesStatus = modalStatusFilter === 'all' || sub.status === modalStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allSubmissions, modalSearch, modalStatusFilter]);

  const totalModalPages = Math.max(1, Math.ceil(filteredModalSubmissions.length / modalPerPage));
  const currentModalItems = useMemo(() => {
    const start = (modalPage - 1) * modalPerPage;
    return filteredModalSubmissions.slice(start, start + modalPerPage);
  }, [filteredModalSubmissions, modalPage]);

  // Reset modal page when filters change
  useEffect(() => {
    setModalPage(1);
  }, [modalSearch, modalStatusFilter]);

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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>Dean Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>Overview of titles, submission window state, and system statistics.</p>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider" style={poppinsFont}>Total Submissions</span>
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3" style={authorFont}>{stats.totalSubmissions}</p>
          <p className="text-[11px] text-slate-500 mt-2" style={authorFont}>Submitted by students</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider" style={poppinsFont}>Pending Guide Review</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3" style={authorFont}>{stats.pendingGuide}</p>
          <p className="text-[11px] text-amber-600 mt-2" style={authorFont}>Awaiting guide approval</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider" style={poppinsFont}>Pending HOD Review</span>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3" style={authorFont}>{stats.pendingHod}</p>
          <p className="text-[11px] text-blue-600 mt-2" style={authorFont}>Accepted by guide, pending HOD</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider" style={poppinsFont}>Finalized Titles</span>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3" style={authorFont}>{stats.finalized}</p>
          <p className="text-[11px] text-emerald-600 mt-2" style={authorFont}>Ready for evaluation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Submission Activity Card with Pagination & View All Pop-in */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Icon icon="solar:history-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                <h2 className="text-md font-bold text-slate-900" style={authorFont}>Recent Submission Activity</h2>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="text-xs font-bold text-[#4361EE] hover:text-[#3A56D4] hover:underline flex items-center gap-1 transition-all"
                style={authorFont}
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 mt-1">
              {currentCardItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400" style={authorFont}>No submissions yet.</p>
              ) : (
                currentCardItems.map((sub, idx) => {
                  const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.submitted;
                  return (
                    <div key={sub.id || idx} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate" style={authorFont}>{sub.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5" style={poppinsFont}>
                          By {sub.student?.full_name || 'Student'}
                          {sub.created_at && (
                            <span className="text-slate-400 ml-2">• {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          )}
                        </p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`} style={poppinsFont}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card Inline Pagination Footer */}
          {allSubmissions.length > 0 && (
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium" style={poppinsFont}>
                Page <strong className="text-slate-800">{cardPage}</strong> of <strong className="text-slate-800">{totalCardPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCardPage((prev) => Math.max(1, prev - 1))}
                  disabled={cardPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Numeric Page Buttons */}
                {Array.from({ length: totalCardPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCardPage(pg)}
                    className={`w-7 h-7 text-xs font-bold rounded-lg transition-all ${
                      pg === cardPage
                        ? 'bg-[#4361EE] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    style={poppinsFont}
                  >
                    {pg}
                  </button>
                ))}

                <button
                  onClick={() => setCardPage((prev) => Math.min(totalCardPages, prev + 1))}
                  disabled={cardPage === totalCardPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Column: Portal Shortcut & Window Status */}
        <div className="space-y-6">
          {/* Submission Window Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-md font-bold text-slate-900" style={authorFont}>Submission Window</h2>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stats.windowActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900" style={authorFont}>
                  {stats.windowActive ? 'Currently Active' : 'Closed / Not Configured'}
                </p>
                <p className="text-[11px] text-slate-500" style={authorFont}>
                  {stats.windowActive ? `${stats.daysLeft} days remaining` : 'Students cannot submit titles.'}
                </p>
              </div>
            </div>
            <Link
              href="/dean/window"
              className="block text-center w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              style={authorFont}
            >
              Configure Window
            </Link>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-md font-bold text-slate-900" style={authorFont}>Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/dean/announcements"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Megaphone className="w-4 h-4 text-[#4361EE]" />
                  <span className="text-xs font-semibold text-slate-700" style={authorFont}>Write Announcement</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                href="/dean/titles"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-700" style={authorFont}>Browse Title Records</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===== POP-IN SECTION / MODAL: All Submission Activity ===== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#4361EE]/10 flex items-center justify-center">
                  <Icon icon="solar:history-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight" style={authorFont}>
                    All Title Submission Activity
                  </h2>
                  <p className="text-xs text-slate-500" style={authorFont}>
                    Showing {filteredModalSubmissions.length} student submission records
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="p-4 bg-slate-50/30 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Search by title or student name..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all"
                  style={authorFont}
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={modalStatusFilter}
                  onChange={(e) => setModalStatusFilter(e.target.value)}
                  className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE]"
                  style={authorFont}
                >
                  <option value="all">All Statuses</option>
                  <option value="submitted">Submitted (Pending Guide)</option>
                  <option value="revision_requested">Revision Requested</option>
                  <option value="guide_accepted">Guide Accepted (Pending HOD)</option>
                  <option value="hod_accepted">HOD Accepted</option>
                  <option value="finalized">Finalized</option>
                  <option value="guide_rejected">Guide Rejected</option>
                  <option value="hod_rejected">HOD Rejected</option>
                </select>
              </div>
            </div>

            {/* Modal Body — Paginated Activity List */}
            <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-100">
              {currentModalItems.length === 0 ? (
                <div className="py-16 text-center">
                  <Icon icon="solar:document-bold-duotone" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700" style={authorFont}>No matching activity records found</p>
                  <p className="text-xs text-slate-400 mt-1" style={authorFont}>Try adjusting your search query or filters.</p>
                </div>
              ) : (
                currentModalItems.map((sub, idx) => {
                  const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.submitted;
                  return (
                    <div key={sub.id || idx} className="py-4 hover:bg-slate-50/50 rounded-xl px-2 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 leading-snug" style={authorFont}>
                            {sub.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1.5" style={poppinsFont}>
                            <span className="font-semibold text-slate-700">By {sub.student?.full_name || 'Student'}</span>
                            {sub.student?.university_id && (
                              <>
                                <span>•</span>
                                <span>ID: {sub.student.university_id}</span>
                              </>
                            )}
                            {sub.student?.email && (
                              <>
                                <span>•</span>
                                <span className="text-slate-400">{sub.student.email}</span>
                              </>
                            )}
                            {sub.created_at && (
                              <>
                                <span>•</span>
                                <span className="text-slate-400">
                                  {new Date(sub.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 ${cfg.bg} ${cfg.border} ${cfg.text}`} style={poppinsFont}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer — Pagination */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500 font-medium" style={poppinsFont}>
                Showing <strong className="text-slate-800">{filteredModalSubmissions.length > 0 ? (modalPage - 1) * modalPerPage + 1 : 0}</strong> to <strong className="text-slate-800">{Math.min(modalPage * modalPerPage, filteredModalSubmissions.length)}</strong> of <strong className="text-slate-800">{filteredModalSubmissions.length}</strong> activity records
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setModalPage((prev) => Math.max(1, prev - 1))}
                  disabled={modalPage === 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  style={authorFont}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                {Array.from({ length: totalModalPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setModalPage(pg)}
                    className={`w-8 h-8 text-xs font-bold rounded-xl transition-all ${
                      pg === modalPage
                        ? 'bg-[#4361EE] text-white shadow-md shadow-[#4361EE]/20'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                    style={poppinsFont}
                  >
                    {pg}
                  </button>
                ))}

                <button
                  onClick={() => setModalPage((prev) => Math.min(totalModalPages, prev + 1))}
                  disabled={modalPage === totalModalPages}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  style={authorFont}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
