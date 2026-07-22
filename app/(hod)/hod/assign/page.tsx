'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@iconify/react';
import { Loader2, Search, UserPlus, UserMinus, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface GuideProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  student_count?: number;
}

interface StudentProfile {
  id: string;
  full_name: string | null;
  email: string;
  university_id: string | null;
  guide_id: string | null;
  guide?: { full_name: string | null; email: string } | null;
}

interface UserSearchResult {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

export default function HodManageGuidesPage() {
  const { profile } = useRole();
  const { success, error: showError, warning } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [guides, setGuides] = useState<GuideProfile[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  
  // Search & add guide state
  const [addSearchEmail, setAddSearchEmail] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter students state
  const [studentSearch, setStudentSearch] = useState('');
  const [reassigningStudentId, setReassigningStudentId] = useState<string | null>(null);
  const [newGuideForStudent, setNewGuideForStudent] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      // 1. Fetch all Guides in institute
      let guideQuery = supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('role', 'guide');
      if (profile.institute_id) {
        guideQuery = guideQuery.eq('institute_id', profile.institute_id);
      }
      const { data: guideData, error: guideErr } = await guideQuery.order('full_name');
      if (guideErr) throw guideErr;

      // 2. Fetch all Students in institute (without FK join — more robust)
      let studentQuery = supabase
        .from('profiles')
        .select('id, full_name, email, university_id, guide_id')
        .eq('role', 'student');
      if (profile.institute_id) {
        studentQuery = studentQuery.eq('institute_id', profile.institute_id);
      }
      const { data: studentData, error: studentErr } = await studentQuery.order('full_name');
      if (studentErr) throw studentErr;

      // Build a guide lookup map for resolving names
      const guideMap = new Map<string, { full_name: string | null; email: string }>();
      (guideData || []).forEach((g) => guideMap.set(g.id, { full_name: g.full_name, email: g.email }));

      // Calculate student counts per guide & attach guide info
      const counts: Record<string, number> = {};
      const processedStudents: StudentProfile[] = (studentData || []).map((st) => {
        if (st.guide_id) {
          counts[st.guide_id] = (counts[st.guide_id] || 0) + 1;
        }
        return {
          ...st,
          guide: st.guide_id ? guideMap.get(st.guide_id) || null : null,
        };
      });

      const processedGuides = (guideData || []).map((g) => ({
        ...g,
        student_count: counts[g.id] || 0,
      }));

      setGuides(processedGuides);
      setStudents(processedStudents);
    } catch (err) {
      console.error('Error loading guide management data', err);
      showError('Failed to load guide records.', 'Error');
    } finally {
      setLoading(false);
    }
  }, [profile, supabase, showError]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile, fetchData]);

  // Search user to promote to guide
  const handleUserSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSearchEmail.trim()) return;

    setSearchingUsers(true);
    setSearchResults([]);
    try {
      const q = addSearchEmail.trim().toLowerCase();
      let query = supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'guide')
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(5);

      if (profile?.institute_id) {
        query = query.eq('institute_id', profile.institute_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSearchResults(data || []);
      if (!data || data.length === 0) {
        warning('No eligible users found matching that email or name.', 'Search');
      }
    } catch (err) {
      console.error('Search error', err);
      showError('Failed to search users.', 'Error');
    } finally {
      setSearchingUsers(false);
    }
  };

  // Grant guide role
  const handleAddGuideRole = async (targetUser: UserSearchResult) => {
    setActionLoading(`add-${targetUser.id}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'guide' })
        .eq('id', targetUser.id);

      if (error) throw error;

      // Also upsert into role_grants if needed
      await supabase.from('role_grants').upsert(
        {
          email: targetUser.email.toLowerCase(),
          role: 'guide',
          institute_id: profile?.institute_id || null,
          can_edit: true,
          granted_by: profile?.id,
        },
        { onConflict: 'email' }
      );

      // Notify user
      await supabase.from('notifications').insert({
        user_id: targetUser.id,
        title: 'Role Updated: Guide',
        message: 'You have been appointed as a Dissertation Guide by the HOD.',
        type: 'success',
        link: '/guide',
      });

      success(`${targetUser.full_name || targetUser.email} is now a Guide!`, 'Role Granted');
      setAddSearchEmail('');
      setSearchResults([]);
      await fetchData();
    } catch (err) {
      console.error('Grant guide role error', err);
      showError('Failed to add guide role.', 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  // Remove guide role
  const handleRemoveGuideRole = async (guide: GuideProfile) => {
    if (guide.student_count && guide.student_count > 0) {
      warning(`Cannot remove guide role. ${guide.full_name || guide.email} has ${guide.student_count} student(s) assigned. Reassign their students first.`, 'Warning');
      return;
    }

    setActionLoading(`remove-${guide.id}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'student' })
        .eq('id', guide.id);

      if (error) throw error;

      // Remove from role_grants
      await supabase.from('role_grants').delete().eq('email', guide.email.toLowerCase());

      success(`Removed guide role for ${guide.full_name || guide.email}.`, 'Role Removed');
      await fetchData();
    } catch (err) {
      console.error('Remove guide role error', err);
      showError('Failed to remove guide role.', 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  // Change student's guide
  const handleChangeStudentGuide = async (studentId: string) => {
    const guideId = newGuideForStudent[studentId];
    if (!guideId) {
      warning('Please select a new guide.', 'Warning');
      return;
    }

    setReassigningStudentId(studentId);
    try {
      const student = students.find((s) => s.id === studentId);
      if (!student) return;

      // Update student profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ guide_id: guideId })
        .eq('id', studentId);

      if (profileErr) throw profileErr;

      // Also update any active submission by this student
      await supabase
        .from('submissions')
        .update({ guide_id: guideId })
        .eq('student_id', studentId)
        .not('status', 'in', '("guide_rejected","hod_rejected")');

      const targetGuide = guides.find((g) => g.id === guideId);
      const guideName = targetGuide?.full_name || targetGuide?.email || 'New Guide';

      // Notifications
      await supabase.from('notifications').insert({
        user_id: studentId,
        title: 'Guide Updated',
        message: `Your guide has been changed to ${guideName} by the HOD.`,
        type: 'info',
        link: '/dashboard',
      });

      await supabase.from('notifications').insert({
        user_id: guideId,
        title: 'New Student Assigned',
        message: `Student ${student.full_name || student.email} has been assigned to you by the HOD.`,
        type: 'info',
        link: '/guide',
      });

      success(`Updated guide for ${student.full_name || student.email} to ${guideName}.`, 'Success');
      await fetchData();
    } catch (err) {
      console.error('Change student guide error', err);
      showError('Failed to reassign guide.', 'Error');
    } finally {
      setReassigningStudentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  const filteredStudents = students.filter((s) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.university_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight" style={authorFont}>
          Manage Guides
        </h1>
        <p className="text-sm text-slate-500 mt-1" style={authorFont}>
          Add or remove Guide roles, and change assigned guides for any student in your institute.
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#4361EE] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70" style={poppinsFont}>
                Active Guides
              </p>
              <p className="text-3xl font-black mt-1" style={authorFont}>
                {String(guides.length).padStart(2, '0')}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Icon icon="solar:user-speak-bold-duotone" className="w-5 h-5 text-white/80" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>
                Total Students
              </p>
              <p className="text-3xl font-black text-slate-900 mt-1" style={authorFont}>
                {String(students.length).padStart(2, '0')}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#4361EE]/10 flex items-center justify-center">
              <Icon icon="solar:users-group-two-rounded-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500" style={poppinsFont}>
                Students Without Guide
              </p>
              <p className="text-3xl font-black text-amber-600 mt-1" style={authorFont}>
                {String(students.filter((s) => !s.guide_id).length).padStart(2, '0')}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Icon icon="solar:danger-circle-bold-duotone" className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ===== SECTION 1: Add Guide Role ===== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#4361EE]/10 flex items-center justify-center text-[#4361EE]">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900" style={authorFont}>
              Add New Guide Role
            </h2>
            <p className="text-xs text-slate-500" style={authorFont}>
              Search for a user by email or name to grant them Guide role.
            </p>
          </div>
        </div>

        <form onSubmit={handleUserSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={addSearchEmail}
              onChange={(e) => setAddSearchEmail(e.target.value)}
              placeholder="Enter user email or name..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 focus:border-[#4361EE] transition-all"
              style={authorFont}
            />
          </div>
          <button
            type="submit"
            disabled={searchingUsers || !addSearchEmail.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4361EE] text-white text-xs font-bold rounded-xl hover:bg-[#4361EE]/90 transition-all disabled:opacity-50"
            style={authorFont}
          >
            {searchingUsers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-[#F0F2F8]/50 mt-3">
            {searchResults.map((usr) => (
              <div key={usr.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900" style={authorFont}>
                    {usr.full_name || 'No Name'}
                  </p>
                  <p className="text-[11px] text-slate-500" style={poppinsFont}>
                    {usr.email} • Current Role: <span className="capitalize font-semibold">{usr.role}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleAddGuideRole(usr)}
                  disabled={actionLoading === `add-${usr.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
                  style={authorFont}
                >
                  {actionLoading === `add-${usr.id}` ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <UserPlus className="w-3 h-3" />
                  )}
                  Grant Guide Role
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== SECTION 2: Active Guides List ===== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900" style={authorFont}>
          Active Guides ({guides.length})
        </h2>

        {guides.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center" style={authorFont}>
            No guides found in your institute. Use the section above to add guides.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {guides.map((guide) => (
              <div
                key={guide.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-[#4361EE]/30 transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#4361EE]/10 flex items-center justify-center font-bold text-[#4361EE] text-sm flex-shrink-0">
                      {guide.full_name?.[0]?.toUpperCase() || guide.email[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate" style={authorFont}>
                        {guide.full_name || 'Guide'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate" style={poppinsFont}>
                        {guide.email}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] font-medium text-slate-600" style={poppinsFont}>
                    Students: <strong className="text-slate-900">{guide.student_count}</strong>
                  </span>
                  <button
                    onClick={() => handleRemoveGuideRole(guide)}
                    disabled={actionLoading === `remove-${guide.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-all disabled:opacity-50"
                    title="Remove Guide Role"
                    style={authorFont}
                  >
                    {actionLoading === `remove-${guide.id}` ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserMinus className="w-3 h-3" />
                    )}
                    Remove Role
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== SECTION 3: Change Student's Guide ===== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900" style={authorFont}>
              Student Guide Assignments ({students.length})
            </h2>
            <p className="text-xs text-slate-500" style={authorFont}>
              Reassign any student to a different guide.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Filter student by name or enrollment..."
              className="w-full pl-9 pr-3 py-2 bg-[#F0F2F8] border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 transition-all"
              style={authorFont}
            />
          </div>
        </div>

        {filteredStudents.length === 0 ? (
          <p className="text-xs text-slate-400 py-8 text-center" style={authorFont}>
            No students found matching search.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((st) => {
              const isReassigning = reassigningStudentId === st.id;
              const selectedNewGuide = newGuideForStudent[st.id] || '';

              return (
                <div
                  key={st.id}
                  className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[#4361EE]/30 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-[#4361EE]/10 text-[#4361EE] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {st.full_name?.[0]?.toUpperCase() || st.email[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate" style={authorFont}>
                        {st.full_name || 'Student'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate" style={poppinsFont}>
                        {st.email} • ID: {st.university_id || 'N/A'}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5" style={poppinsFont}>
                        Current Guide:{' '}
                        <span className="font-bold text-[#4361EE]">
                          {st.guide?.full_name || 'None'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={selectedNewGuide}
                      onChange={(e) =>
                        setNewGuideForStudent((prev) => ({ ...prev, [st.id]: e.target.value }))
                      }
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/30 transition-all min-w-[180px]"
                      style={authorFont}
                    >
                      <option value="">Select new guide...</option>
                      {guides.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.full_name || g.email}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleChangeStudentGuide(st.id)}
                      disabled={isReassigning || !selectedNewGuide}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#4361EE] text-white text-xs font-bold rounded-xl hover:bg-[#4361EE]/90 transition-all disabled:opacity-50 shadow-sm"
                      style={authorFont}
                    >
                      {isReassigning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Change Guide
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
