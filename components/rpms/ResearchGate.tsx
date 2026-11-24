'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';
import { useRole } from '@/hooks/useRole';
import { getRoleDashboardPath } from '@/lib/utils/roleCheck';
import SimpleResearch from '@/components/progress/SimpleResearch';
import { authorFont, poppinsFont } from './ui';

const ALLOWED = ['dean', 'pg_director'];

export default function ResearchGate() {
  const { role, loading } = useRole();

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-slate-500" style={poppinsFont}>Checking access…</p>
        </div>
      </DashboardShell>
    );
  }

  if (!role || !ALLOWED.includes(role)) {
    return (
      <DashboardShell>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50">
            <ShieldAlert className="h-7 w-7 text-rose-600" />
          </div>
          <h1 className="mt-4 text-xl font-black text-[#1E293B]" style={authorFont}>Access restricted</h1>
          <p className="mt-2 text-sm text-slate-600" style={poppinsFont}>
            Research Progress is available only to the Dean and PG Director. Your role ({role?.replaceAll('_', ' ') || 'unassigned'}) does not have access.
          </p>
          <Link
            href={role ? getRoleDashboardPath(role) : "/login"}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-4 py-2.5 text-sm font-bold text-white hover:opacity-95"
            style={authorFont}
          >
            Back to my dashboard
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <SimpleResearch key={role} />
    </DashboardShell>
  );
}