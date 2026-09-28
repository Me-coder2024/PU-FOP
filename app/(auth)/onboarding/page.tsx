'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { clearRoleCache } from '@/hooks/useRole';

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [selectedInstitute, setSelectedInstitute] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedGuide, setSelectedGuide] = useState('');

  const [institutes, setInstitutes] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; institute_id: string }[]>([]);
  const [guides, setGuides] = useState<{ id: string; full_name: string | null; email: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [user, authLoading]);

  // If user already has university_id configured, redirect to dashboard
  useEffect(() => {
    async function checkExistingProfile() {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('university_id')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.university_id) {
        window.location.href = '/dashboard';
      }
    }
    checkExistingProfile();
  }, [user, supabase]);

  // Pre-fill name and email prefix on load
  useEffect(() => {
    if (user) {
      if (user.displayName) {
        setFullName(user.displayName);
      }
      if (user.email) {
        const prefix = user.email.split('@')[0];
        setUniversityId(prefix);
      }
    }
  }, [user]);

  // Load institutes and departments on mount
  useEffect(() => {
    async function loadOptions() {
      const { data: instData } = await supabase.from('institutes').select('id, name').order('name');
      if (instData) setInstitutes(instData);

      const { data: deptData } = await supabase.from('departments').select('id, name, institute_id').order('name');
      if (deptData) setDepartments(deptData as { id: string; name: string; institute_id: string }[]);
    }
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter departments by selected institute
  const filteredDepartments = useMemo(() => {
    if (!selectedInstitute) return [];
    return departments.filter((d) => d.institute_id === selectedInstitute);
  }, [departments, selectedInstitute]);

  // Load guides filtered by selected institute
  useEffect(() => {
    if (!selectedInstitute) {
      setGuides([]);
      setSelectedGuide('');
      setSelectedDepartment('');
      return;
    }

    // Reset selected department when institute changes
    setSelectedDepartment('');

    async function loadGuides() {
      try {
        const res = await fetch(`/api/guides?institute_id=${selectedInstitute}`);
        if (!res.ok) throw new Error('Failed to load guides');
        const data = await res.json();
        let loadedGuides = data.guides || [];
        // If no guides explicitly found for this institute, fall back to all guides
        if (loadedGuides.length === 0) {
          const fallbackRes = await fetch('/api/guides');
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            loadedGuides = fallbackData.guides || [];
          }
        }
        setGuides(loadedGuides);
      } catch (err) {
        console.error('Error loading guides via API:', err);
        const { data: guideData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', 'guide')
          .order('full_name');
        setGuides((guideData as unknown as { id: string; full_name: string | null; email: string }[]) || []);
      }
      setSelectedGuide('');
    }
    loadGuides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstitute]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!universityId.trim()) { setError('University ID / Enrollment number is required.'); return; }
    if (!selectedInstitute) { setError('Please select your institute.'); return; }
    if (!selectedDepartment) { setError('Please select your department.'); return; }
    if (!selectedGuide) { setError('Please select your guide.'); return; }
    if (!user) return;

    setSubmitting(true);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email,
          fullName: fullName.trim(),
          universityId: universityId.trim(),
          instituteId: selectedInstitute,
          departmentId: selectedDepartment,
          guideId: selectedGuide,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      clearRoleCache();
      setSuccess(true);
      setTimeout(() => {
        window.location.replace(data.redirectUrl || '/dashboard');
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/login-bg-pu.png')" }} />
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
        <div className="flex flex-col items-center relative z-10">
          <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin mb-3" />
          <span className="text-sm text-[#1E3A8A] font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center relative p-4">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/login-bg-pu.png')" }} />
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
        <div className="relative z-10 bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-white/20">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-2xl font-black text-[#1E3A8A]">Profile Configured!</h2>
          <p className="text-sm text-gray-600 mt-2">Redirecting to your student dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 bg-gray-50">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/login-bg-pu.png')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#1E3A8A]/90 via-[#1E3A8A]/75 to-blue-900/80 backdrop-blur-sm" />

      {/* Main card */}
      <div className="relative z-10 w-full max-w-lg bg-white/10 border border-white/20 backdrop-blur-md rounded-3xl p-8 shadow-2xl text-white my-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight">Complete Your Profile</h1>
          <p className="text-sm text-blue-100 mt-2">
            Please enter your academic details to access the PU-FOP Thesis Portal.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">Full Name</label>
            <input
              id="profile-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Dr. Rajesh Patel"
              className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all placeholder:text-gray-400"
            />
          </div>

          {/* University ID / Enrollment No */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">
              University ID / Enrollment No.
            </label>
            <input
              id="profile-university-id"
              type="text"
              value={universityId}
              onChange={(e) => setUniversityId(e.target.value)}
              placeholder="e.g. 210601230001"
              className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all placeholder:text-gray-400 font-mono"
            />
          </div>

          {/* Select Institute */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">Institute</label>
            <div className="relative">
              <select
                id="profile-institute"
                value={selectedInstitute}
                onChange={(e) => setSelectedInstitute(e.target.value)}
                className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all appearance-none cursor-pointer"
              >
                <option value="">Select Institute</option>
                {institutes.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Select Department (Filtered by selected institute) */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">Department</label>
            <div className="relative">
              <select
                id="profile-department"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                disabled={!selectedInstitute}
                className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!selectedInstitute
                    ? '← Select Institute first'
                    : filteredDepartments.length === 0
                      ? 'No departments available for this institute'
                      : 'Select Department'}
                </option>
                {filteredDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Select Guide */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">Select Guide</label>
            <div className="relative">
              <select
                id="profile-guide"
                value={selectedGuide}
                onChange={(e) => setSelectedGuide(e.target.value)}
                disabled={!selectedInstitute}
                className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!selectedInstitute
                    ? '← Select Institute first'
                    : guides.length === 0
                      ? 'No guides available for this institute'
                      : 'Select Guide'}
                </option>
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name ? `${g.full_name} (${g.email})` : g.email}
                  </option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 mt-4 bg-white text-[#1E3A8A] font-black rounded-lg text-sm hover:bg-blue-50 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#1E3A8A]" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <span>Save & Continue →</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
