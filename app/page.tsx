'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import {
  ArrowRight,
  Search,
  Layout,
  Archive,
  Mail,
  MapPin,
  ShieldCheck,
  Users,
  Activity,
  BookOpen,
  Zap,
  GraduationCap,
  FlaskConical,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import Button from '@/components/ui/Button';

import { getRoleDashboardPath } from '@/lib/utils/roleCheck';

export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !roleLoading && user && role) {
      const redirectPath = getRoleDashboardPath(role);
      router.push(redirectPath);
    }
  }, [user, role, authLoading, roleLoading, router]);

  const isLoading = authLoading || roleLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#1E3A8A] animate-spin mb-4" />
        <p className="text-slate-400 text-sm tracking-wide animate-pulse">
          Loading portal...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-primary-500/20 selection:text-primary-900 scroll-smooth">
      {/* Hero Section */}
      <section className="relative min-h-[92vh] sm:min-h-screen flex items-center justify-center pt-16 overflow-hidden bg-primary-500">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src="/images/lab-bg.png"
            alt="Background"
            className="w-full h-full object-cover opacity-15 scale-105"
          />
          <div className="absolute inset-0 bg-primary-500/80" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 sm:px-12 text-center z-10">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-[10px] font-bold uppercase tracking-wider mb-8">
            <Zap className="w-3.5 h-3.5 fill-current text-white" />
            <span>Innovating Pharmacy Research Excellence</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight mb-8">
            The Future of <br />
            <span className="text-primary-100">Dissertation</span> <br />
            Management.
          </h1>

          <p className="max-w-2xl mx-auto text-white/70 text-base sm:text-lg md:text-xl font-medium leading-relaxed mb-10">
            A seamless, secure, and centralized platform dedicated to the Faculty of Pharmacy at Parul University. Accelerate your research journey from proposal to global archive.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-white hover:bg-slate-50 text-primary-500 font-semibold">
                ENTER STUDENT PORTAL
                <ArrowRight className="ml-2 h-4.5 w-4.5" />
              </Button>
            </Link>

            <Link href="/dashboard/help" className="w-full sm:w-auto">
              <Button size="lg" variant="ghost" className="w-full sm:w-auto text-white/80 hover:text-white hover:bg-white/10 border border-white/20">
                VIEW SUPPORT & GUIDELINES
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-20 -mt-12 max-w-6xl mx-auto px-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-lg">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              { label: 'Active Researchers', value: '2,400+', icon: Users },
              { label: 'Departments', value: '12', icon: Layout },
              { label: 'Digital Archives', value: '8,500+', icon: Archive },
              { label: 'Success Rate', value: '99.2%', icon: Activity },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col items-center justify-center p-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
                  <stat.icon className="w-5 h-5 text-primary-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Engineered for <span className="text-primary-500">Research Rigor.</span>
          </h2>
          <p className="max-w-2xl mx-auto text-slate-500 font-medium leading-relaxed">
            Every component is meticulously designed to meet the strict regulatory and academic requirements of modern pharmaceutical research.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: ShieldCheck,
              title: 'Regulatory Compliance',
              desc: 'Fully aligned with university and pharmaceutical board standards for documentation and ethics approval.',
            },
            {
              icon: Search,
              title: 'Plagiarism Integration',
              desc: 'Seamlessly integrated with advanced similarity detection tools to ensure 100% original academic research.',
            },
            {
              icon: BookOpen,
              title: 'Smart Repository',
              desc: 'Intelligent indexing of research papers for quick cross-referencing and institutional knowledge preservation.',
            },
            {
              icon: Activity,
              title: 'Live Milestone Tracking',
              desc: 'Instant notifications for students and guides at every stage from submission to final viva-voce.',
            },
            {
              icon: Layout,
              title: 'Faculty Dashboard',
              desc: 'Unified interface for guides and administrators to manage multiple students with priority-based alerts.',
            },
            {
              icon: Archive,
              title: 'Automated Archives',
              desc: 'Zero-effort archiving process that builds a permanent, digital library for the Faculty of Pharmacy.',
            },
          ].map((feature, idx) => (
            <div key={idx} className="p-6 rounded-2xl border border-slate-200 bg-white hover:border-primary-300 hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-6">
                <feature.icon className="w-6 h-6 text-primary-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Journey Section */}
      <section className="bg-slate-50 border-y border-slate-200 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-primary-500 font-semibold text-xs uppercase tracking-wider mb-2 block">Process Workflow</span>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">The Submission Journey</h2>
            <p className="max-w-xl mx-auto text-slate-500 font-medium">A structured, 4-phase pathway designed for efficiency and academic excellence.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {[
              { step: '01', title: 'Idea & Proposal', desc: 'Digital submission of research abstract and initial guide matching.' },
              { step: '02', title: 'Active Research', desc: 'Continuous monitoring, milestone checks, and guide consultations.' },
              { step: '03', title: 'Review & Similarity', desc: 'Automatic ML service review for title, dosage, drug, and keyword novelty.' },
              { step: '04', title: 'Permanent Archival', desc: 'Final viva-voce approval followed by direct publish to the repository.' },
            ].map((phase, idx) => (
              <div key={idx} className="relative p-6 rounded-xl border border-slate-200 bg-white">
                <div className="text-3xl font-bold text-primary-100 mb-3">{phase.step}</div>
                <h4 className="text-md font-bold text-slate-900 mb-2">{phase.title}</h4>
                <p className="text-slate-500 text-xs leading-relaxed">{phase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-primary-500" />
            <div className="text-left">
              <span className="font-bold text-slate-900 tracking-wider block">PU-FOP</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest leading-none block mt-0.5">Faculty of Pharmacy</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Parul University. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
