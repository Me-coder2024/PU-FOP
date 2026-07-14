'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  UserCheck,
  Award,
  BookOpen,
  Globe,
  MessageSquare,
  Crown,
  X,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/superadmin/dashboard', icon: LayoutDashboard },
  { name: 'Access Panel', href: '/superadmin/access-panel', icon: Users },
  { name: 'Admin Access', href: '/superadmin/admin-access', icon: ShieldCheck },
  { name: 'MOD Access', href: '/superadmin/mod-access', icon: UserCheck },
  { name: 'Guide Access', href: '/superadmin/guide-access', icon: Award },
  { name: 'PG Director', href: '/superadmin/pg-director-access', icon: BookOpen },
  { name: 'WEB Control', href: '/superadmin/web-control', icon: Globe },
  { name: 'Feedback', href: '/superadmin/feedback-control', icon: MessageSquare },
];

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 sidebar-overlay lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'w-[250px] jobie-sidebar flex flex-col h-screen shrink-0 z-50 transition-transform duration-300 ease-out',
          'fixed lg:sticky lg:top-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="h-[72px] px-5 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0037B0] flex items-center justify-center shadow-sm">
              <Crown className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-extrabold text-slate-900 tracking-wide">PU-FOP</span>
              <span className="text-[10px] font-medium text-slate-400 tracking-wider leading-none mt-0.5">
                Admin Panel
              </span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-4 space-y-0.5 overflow-y-auto sidebar-scroll">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium rounded-xl transition-all duration-200',
                  isActive
                    ? 'jobie-sidebar-active'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Icon className={cn('w-5 h-5 shrink-0', isActive ? 'text-white' : 'text-slate-400')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-200">
          <p className="text-[10px] text-slate-400 font-medium">Parul University</p>
          <p className="text-[9px] text-slate-300 mt-0.5">© 2026 All Rights Reserved</p>
        </div>
      </aside>
    </>
  );
}
