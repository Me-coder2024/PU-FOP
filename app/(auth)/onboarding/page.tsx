'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, Play } from 'lucide-react';

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [selectedInstitute, setSelectedInstitute] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedGuide, setSelectedGuide] = useState('');

  const [institutes, setInstitutes] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [guides, setGuides] = useState<{ id: string; full_name: string | null; email: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

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

  // Load institutes, departments, and guides from DB
  useEffect(() => {
    async function loadOptions() {
      const { data: instData } = await supabase.from('institutes').select('id, name').order('name');
      if (instData) setInstitutes(instData);

      const { data: deptData } = await supabase.from('departments').select('id, name').order('name');
      if (deptData) setDepartments(deptData);

      const { data: guideData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'guide')
        .order('full_name');
      if (guideData) setGuides(guideData);
    }
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          university_id: universityId.trim(),
          institute_id: selectedInstitute,
          department_id: selectedDepartment,
          guide_id: selectedGuide,
        })
        .eq('id', user.id);

      if (updateError) throw new Error(updateError.message);

      setSuccess(true);
      setTimeout(() => {
        router.replace('/dashboard');
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
      <div className="min-h-screen flex flex-col items-center justify-center relative">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/login-bg-pu.png')" }} />
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
        <div className="text-center relative z-10">
          <div className="w-20 h-20 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/15">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Profile Created!</h2>
          <p className="text-green-600 text-sm font-medium">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/login-bg-pu.png')" }} />
      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#4361EE] rounded-2xl p-8 shadow-2xl shadow-blue-900/20">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center">
              <img src="/images/pu_logo.png" alt="PU" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-white font-bold text-sm">PU-FOP</span>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-2">New User Details</h1>
          <p className="text-white/70 text-sm text-center mb-8">
            Please fill in the information below to complete the registration.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="text-sm font-bold text-white mb-2 block">Full Name</label>
              <input
                id="profile-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Johnathan Doe"
                className="w-full px-4 py-3 bg-white rounded-xl text-gray-800 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
              />
            </div>

            {/* University ID */}
            <div>
              <label className="text-sm font-bold text-white mb-2 block">Enrollment Number</label>
              <input
                id="profile-university-id"
                type="text"
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                placeholder="e.g. ENR-2023-0045"
                className="w-full px-4 py-3 bg-white rounded-xl text-gray-800 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
              />
            </div>

            {/* Institute */}
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

            {/* Department */}
            <div>
              <label className="text-sm font-bold text-white mb-2 block">Department</label>
              <div className="relative">
                <select
                  id="profile-department"
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
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
                  className="w-full px-4 py-3 bg-white rounded-lg text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Guide</option>
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

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-lg text-white text-xs font-bold flex items-start">
                <span className="mr-2 mt-0.5">⚠</span>
                {error}
              </div>
            )}

            <button
              id="profile-submit"
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-white text-[#4361EE] font-bold text-sm rounded-xl hover:bg-white/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Profile...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Submit Details
                </>
              )}
            </button>
          </form>

          <div className="my-6 border-t border-white/20" />
          <p className="text-center text-sm text-white/60 font-medium">
            Need help with registration?
          </p>
        </div>
      </div>
    </div>
  );
}
