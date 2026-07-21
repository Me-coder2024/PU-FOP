'use client';

import React, { useState, useEffect } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Calendar,
  Users,
  FileText,
  Megaphone,
  CheckCircle,
  Clock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

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
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

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
          .select('status, created_at, title, student:profiles!submissions_student_id_fkey(full_name)');

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

        // Set recent submissions
        if (subs) {
          const sorted = [...subs]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);
          setRecentSubmissions(sorted);
        }
      } catch (err) {
        console.error('Error fetching Dean stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [profile, supabase]);

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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dean Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of titles, submission window state, and system statistics.</p>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Submissions</span>
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3">{stats.totalSubmissions}</p>
          <p className="text-[11px] text-slate-500 mt-2">Submitted by students</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pending Guide Review</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3">{stats.pendingGuide}</p>
          <p className="text-[11px] text-amber-600 mt-2">Awaiting guide approval</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pending HOD Review</span>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3">{stats.pendingHod}</p>
          <p className="text-[11px] text-blue-600 mt-2">Accepted by guide, pending HOD</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Finalized Titles</span>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 mt-3">{stats.finalized}</p>
          <p className="text-[11px] text-emerald-600 mt-2">Ready for evaluation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Activity / submission details */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-bold text-slate-900">Recent Submission Activity</h2>
            <Link href="/dean/titles" className="text-xs font-bold text-[#1E3A8A] hover:underline flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentSubmissions.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">No submissions yet.</p>
            ) : (
              recentSubmissions.map((sub, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{sub.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">By {sub.student?.full_name || 'Student'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${
                    sub.status === 'finalized' || sub.status === 'hod_accepted'
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      : sub.status === 'submitted'
                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                      : 'bg-blue-50 border-blue-100 text-blue-700'
                  }`}>
                    {sub.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1 Column: Portal Shortcut & Window Status */}
        <div className="space-y-6">
          {/* Submission Window Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-md font-bold text-slate-900">Submission Window</h2>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${stats.windowActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {stats.windowActive ? 'Currently Active' : 'Closed / Not Configured'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {stats.windowActive ? `${stats.daysLeft} days remaining` : 'Students cannot submit titles.'}
                </p>
              </div>
            </div>
            <Link
              href="/dean/window"
              className="block text-center w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              Configure Window
            </Link>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-md font-bold text-slate-900">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/dean/announcements"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Megaphone className="w-4 h-4 text-[#1E3A8A]" />
                  <span className="text-xs font-semibold text-slate-700">Write Announcement</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
              <Link
                href="/dean/titles"
                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-700">Browse Title Records</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
