'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { getRoleDashboardPath } from '@/lib/utils/roleCheck';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || roleLoading) return;

    if (user && role) {
      // Already logged in — go to role dashboard
      router.replace(getRoleDashboardPath(role));
    } else {
      // Not logged in — go to login
      router.replace('/login');
    }
  }, [user, role, authLoading, roleLoading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F2F8]">
      <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin mb-4" />
      <p className="text-slate-400 text-sm font-medium" style={{ fontFamily: "'Author', sans-serif" }}>
        Loading portal...
      </p>
    </div>
  );
}
