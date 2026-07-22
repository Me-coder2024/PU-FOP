'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppRole } from '@/lib/supabase/types';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@iconify/react';
import {
  Settings,
  Bell,
  Menu,
  X,
  Shield,
  MessageSquare,
  Building2,
  BarChart3,
  Megaphone,
  Eye,
  Loader2,
  Calendar,
  ClipboardCheck,
  Pill,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  iconifyIcon?: string;      // Iconify icon string (for student nav)
  lucideIcon?: React.ElementType; // Lucide fallback (for non-student nav)
}

const STUDENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', iconifyIcon: 'solar:widget-bold-duotone' },
  { label: 'Submit Topic', href: '/dashboard/submit', iconifyIcon: 'solar:document-add-bold-duotone' },
  { label: 'Drug Requests', href: '/dashboard/drug-requests', iconifyIcon: 'solar:pill-bold-duotone' },
  { label: 'Progress Tracker', href: '/dashboard/track', iconifyIcon: 'solar:chart-2-bold-duotone' },
  { label: 'Similarity Check', href: '/dashboard/similarity', iconifyIcon: 'solar:shield-check-bold-duotone' },
  { label: 'Repository', href: '/dashboard/repository', iconifyIcon: 'solar:library-bold-duotone' },
  { label: 'Help & FAQs', href: '/dashboard/help', iconifyIcon: 'solar:question-circle-bold-duotone' },
];

const OTHER_NAV: Record<Exclude<AppRole, 'student'>, NavItem[]> = {
  guide: [
    { label: 'Review Queue', href: '/guide', lucideIcon: ClipboardCheck },
    { label: 'Feedback', href: '/feedback', lucideIcon: MessageSquare },
  ],
  hod: [
    { label: 'Review Queue', href: '/hod', lucideIcon: ClipboardCheck },
    { label: 'Manage Guides', href: '/hod/assign', iconifyIcon: 'solar:user-plus-bold-duotone' },
    { label: 'All Titles', href: '/hod/all', lucideIcon: Eye },
    { label: 'Feedback', href: '/feedback', lucideIcon: MessageSquare },
  ],
  pg_director: [
    { label: 'Title Browser', href: '/pg-director', lucideIcon: Eye },
    { label: 'Drug Requests', href: '/pg-director/drug-requests', lucideIcon: Pill },
    { label: 'Feedback', href: '/feedback', lucideIcon: MessageSquare },
  ],
  dean: [
    { label: 'Dashboard', href: '/dean', iconifyIcon: 'solar:widget-bold-duotone' },
    { label: 'Title Browser', href: '/dean/titles', lucideIcon: Eye },
    { label: 'Drug Requests', href: '/dean/drug-requests', lucideIcon: Pill },
    { label: 'Role Grants', href: '/dean/roles', lucideIcon: Shield },
    { label: 'Submission Window', href: '/dean/window', lucideIcon: Calendar },
    { label: 'Announcements', href: '/dean/announcements', lucideIcon: Megaphone },
    { label: 'Feedback', href: '/feedback', lucideIcon: MessageSquare },
  ],
  super_admin: [
    { label: 'Dashboard', href: '/super-admin', iconifyIcon: 'solar:widget-bold-duotone' },
    { label: 'Role Grants', href: '/super-admin/roles', lucideIcon: Shield },
    { label: 'Institutes', href: '/super-admin/institutes', lucideIcon: Building2 },
    { label: 'Audit Logs', href: '/super-admin/audit', lucideIcon: BarChart3 },
    { label: 'Feedback', href: '/super-admin/feedback', lucideIcon: MessageSquare },
    { label: 'Settings', href: '/super-admin/settings', lucideIcon: Settings },
  ],
};

const ROLE_LABELS: Record<AppRole, string> = {
  student: 'Student',
  guide: 'Guide',
  hod: 'HOD',
  pg_director: 'PG Director',
  dean: 'Dean',
  super_admin: 'Super Admin',
};

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

function getTopicProgress(status: string | undefined): number {
  if (!status) return 0;
  switch (status) {
    case 'submitted': case 'revision_requested': return 25;
    case 'guide_accepted': return 50;
    case 'hod_accepted': return 75;
    case 'finalized': return 100;
    case 'guide_rejected': case 'hod_rejected': return 10;
    default: return 0;
  }
}

function getOverallProgress(status: string | undefined): number {
  if (!status) return 0;
  const steps = [
    true,
    ['guide_accepted', 'hod_accepted', 'finalized'].includes(status),
    ['hod_accepted', 'finalized'].includes(status),
    status === 'finalized',
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { role, profile, loading } = useRole();
  const { unreadCount } = useNotifications();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (role !== 'student' || !profile) return;
    const supabase = createClient();
    supabase
      .from('submissions')
      .select('status')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSubmissionStatus(data.status);
      });
  }, [role, profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  const isStudent = role === 'student';
  const navItems: NavItem[] = isStudent
    ? STUDENT_NAV
    : (role ? OTHER_NAV[role as Exclude<AppRole, 'student'>] || [] : []);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-[#F0F2F8] flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===== Sidebar ===== */}
      <aside className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen w-[250px]
        flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
        style={{
          background: 'linear-gradient(180deg, #4361EE 0%, #3A56D4 50%, #2D46B9 100%)',
        }}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/10 overflow-hidden">
              <img src="/images/pu_logo.png" alt="PU" className="w-7 h-7 object-contain" />
            </div>
            <span className="font-black text-lg text-white tracking-tight" style={{ fontFamily: "'Author', sans-serif" }}>PU-FOP</span>
          </Link>
          <button
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Submit New Topic Button (student only) */}
        {isStudent && pathname !== '/dashboard/submit' && (
          <div className="px-5 py-4">
            <Link
              href="/dashboard/submit"
              className="flex items-center justify-center gap-2 w-full py-3 bg-white text-[#4361EE] rounded-xl font-bold text-sm hover:bg-white/90 transition-all shadow-lg shadow-black/10"
              style={{ fontFamily: "'Author', sans-serif" }}
            >
              <Icon icon="solar:add-circle-bold" className="w-5 h-5" />
              Submit New Topic
            </Link>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
            const exactActive = pathname === item.href;
            const active = exactActive || isActive;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all
                  ${active
                    ? 'bg-white text-[#4361EE] shadow-lg shadow-black/5'
                    : 'text-white/80 hover:text-white hover:bg-white/10'}
                `}
                style={{ fontFamily: "'Author', sans-serif" }}
              >
                {item.iconifyIcon ? (
                  <Icon icon={item.iconifyIcon} className={`w-[18px] h-[18px] ${active ? 'text-[#4361EE]' : 'text-white/70'}`} />
                ) : item.lucideIcon ? (
                  <item.lucideIcon className={`w-[18px] h-[18px] ${active ? 'text-[#4361EE]' : 'text-white/70'}`} />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Submission Summary (student only) */}
        {isStudent && (
          <div className="px-4 pb-4 pt-3 border-t border-white/10 mt-auto">
            <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-2.5" style={authorFont}>
              Submission Summary
            </p>
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-white/80 truncate pr-2" style={authorFont}>
                    Topic Submission
                  </span>
                  <span className="text-[10px] font-bold text-white/60 flex-shrink-0" style={authorFont}>{getTopicProgress(submissionStatus)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${getTopicProgress(submissionStatus)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-white/80 truncate pr-2" style={authorFont}>
                    Progress
                  </span>
                  <span className="text-[10px] font-bold text-white/60 flex-shrink-0" style={authorFont}>{getOverallProgress(submissionStatus)}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${getOverallProgress(submissionStatus)}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ===== Main Content Area ===== */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Bar */}
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200/80 px-3 sm:px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Search Bar — hidden on mobile */}
            <div className="hidden md:flex items-center gap-2 bg-[#F0F2F8] rounded-xl px-4 py-2.5 w-[220px] lg:w-[380px] xl:w-[420px]">
              <Icon icon="solar:magnifer-linear" className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search Something Here....."
                className="bg-transparent text-sm text-slate-600 placeholder:text-slate-400 outline-none w-full"
                style={{ fontFamily: "'Author', sans-serif" }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Notification bell */}
            <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
              <Icon icon="solar:bell-bold-duotone" className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1" style={poppinsFont}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User info */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#4361EE] flex items-center justify-center text-white text-sm font-bold shadow-md shadow-[#4361EE]/20 flex-shrink-0">
                {profile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate max-w-[120px] lg:max-w-[180px]" style={{ fontFamily: "'Author', sans-serif" }}>
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-[10px] text-slate-400 truncate max-w-[120px] lg:max-w-[180px]" style={poppinsFont}>
                  {role ? ROLE_LABELS[role] : ''}
                </p>
              </div>
            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Sign Out"
            >
              <Icon icon="solar:logout-2-bold-duotone" className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
