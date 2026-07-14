'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { X } from 'lucide-react';

/* Iconify-style SVG icons for sidebar nav */
const DashboardIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4z" />
  </svg>
);

const SubmitTopicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const ProgressIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const SimilarityIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const RepositoryIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const HelpIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const navItems = [
  { name: 'Dashboard', href: '/student/dashboard', icon: DashboardIcon },
  { name: 'Submit Topic', href: '/student/submit', icon: SubmitTopicIcon },
  { name: 'Progress Tracker', href: '/student/progress-tracker', icon: ProgressIcon },
  { name: 'Similarity Check', href: '/student/similarity-check', icon: SimilarityIcon },
  { name: 'Repository', href: '/student/repository', icon: RepositoryIcon },
  { name: 'Help & FAQs', href: '/student/help', icon: HelpIcon },
];

interface StudentSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function StudentSidebar({ isOpen, onClose }: StudentSidebarProps) {
  const pathname = usePathname();
  const isOnSubmitPage = pathname === '/student/submit';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 sidebar-overlay lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'w-[250px] flex flex-col h-screen shrink-0 z-50 transition-transform duration-300 ease-out bg-[#2563EB]',
          'fixed lg:sticky lg:top-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header — PU Logo + PU-FOP */}
        <div className="h-[72px] px-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center">
              <img src="/images/pu_logo.png" alt="PU" className="w-9 h-9 object-contain" />
            </div>
            <span className="text-white text-xl font-extrabold tracking-tight">PU-FOP</span>
          </div>

          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Submit New Topic Button — hidden on submit page */}
        {!isOnSubmitPage && (
          <div className="px-5 mt-4 mb-8">
            <Link
              href="/student/submit"
              className="flex items-center justify-center w-[180px] py-2.5 bg-white text-[#2563EB] text-sm font-bold rounded-lg hover:bg-blue-50 transition-all shadow-sm"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Submit New Topic
            </Link>
          </div>
        )}

        {/* Spacer when button is hidden */}
        {isOnSubmitPage && <div className="h-6" />}

        {/* Navigation Menu */}
        <nav className="flex-1 py-1 px-4 space-y-1 overflow-y-auto sidebar-scroll">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-[13px] font-semibold rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Submission Summary — Bottom */}
        <div className="px-5 pb-6 mt-auto">
          <p className="text-[10px] font-bold text-white/60 uppercase tracking-[0.15em] mb-3">Submission Summary</p>

          <div className="mb-3">
            <p className="text-xs font-semibold text-white mb-1">Topic Submission</p>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: '60%' }}></div>
            </div>
            <p className="text-[10px] text-white/50 mt-1">60% of 100%</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-white mb-1">Submission Progress</p>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: '10%' }}></div>
            </div>
            <p className="text-[10px] text-white/50 mt-1">10% of 100%</p>
          </div>
        </div>
      </aside>
    </>
  );
}
