'use client';

import React, { useState, useEffect } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Shield,
  Building2,
  BarChart3,
  MessageSquare,
  Users,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const { profile } = useRole();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    roleGrants: 0,
    auditLogs: 0,
    feedbackTickets: 0,
  });

  useEffect(() => {
    async function fetchStats() {
      if (!profile) return;
      try {
        const { count: usersCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const { count: grantsCount } = await supabase
          .from('role_grants')
          .select('*', { count: 'exact', head: true });

        const { count: auditCount } = await supabase
          .from('audit_logs')
          .select('*', { count: 'exact', head: true });

        const { count: feedbackCount } = await supabase
          .from('feedback')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');

        setStats({
          totalUsers: usersCount || 0,
          roleGrants: grantsCount || 0,
          auditLogs: auditCount || 0,
          feedbackTickets: feedbackCount || 0,
        });
      } catch (err) {
        console.error('Error fetching admin dashboard stats:', err);
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

  const sections = [
    {
      title: 'Role Grants & Provisioning',
      description: 'Pre-approve faculty domains and roles (Guide, HOD, Dean, PG Director) or grant access directly.',
      icon: Shield,
      href: '/super-admin/roles',
      color: 'bg-indigo-50 border-indigo-100 text-indigo-700',
      badge: `${stats.roleGrants} Active Grants`,
    },
    {
      title: 'Institutes & Departments',
      description: 'Manage the database of available colleges, departments, and drug repository lists.',
      icon: Building2,
      href: '/super-admin/institutes',
      color: 'bg-emerald-50 border-emerald-100 text-emerald-700',
      badge: 'Manage Structure',
    },
    {
      title: 'Audit Logs & RLS Reports',
      description: 'View full audit logs of user sign-ups, submissions, title modifications, and config changes.',
      icon: BarChart3,
      href: '/super-admin/audit',
      color: 'bg-amber-50 border-amber-100 text-amber-700',
      badge: `${stats.auditLogs} Actions Logged`,
    },
    {
      title: 'Feedback & Support Queue',
      description: 'Monitor technical issue reports, database correction requests, and support queries.',
      icon: MessageSquare,
      href: '/super-admin/feedback',
      color: 'bg-rose-50 border-rose-100 text-rose-700',
      badge: `${stats.feedbackTickets} Open Tickets`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Super Admin Portal</h1>
        <p className="text-sm text-slate-500 mt-1">University-wide management console, audit logging, role enforcement, and system metrics.</p>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Registered Accounts</span>
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.totalUsers}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Pre-provisioned Roles</span>
            <Shield className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.roleGrants}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">System Audit Logs</span>
            <BarChart3 className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.auditLogs}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Support Tickets</span>
            <MessageSquare className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2 text-rose-600">{stats.feedbackTickets}</p>
        </div>
      </div>

      {/* Admin Panel Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between hover:shadow-md transition-all">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-xl border ${section.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    {section.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">{section.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{section.description}</p>
                </div>
              </div>
              <div className="pt-5 border-t border-slate-50 mt-5">
                <Link
                  href={section.href}
                  className="flex items-center justify-between text-xs font-bold text-[#1E3A8A] hover:underline"
                >
                  Configure Panel
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
