'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/supabase/types';
import {
  Loader2,
  Shield,
  Plus,
  Trash2,
  Check,
  UserCheck,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Institute {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  institute_id: string | null;
}

interface RoleGrant {
  id: string;
  email: string;
  role: string;
  institute_id: string | null;
  department_id: string | null;
  can_edit: boolean;
  created_at: string;
  institute?: { name: string } | null;
  department?: { name: string } | null;
}

export default function RoleGrantsPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Form states
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('guide');
  const [instId, setInstId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RoleGrant | null>(null);
  const { success, error: showError } = useToast();

  const fetchData = useCallback(async () => {
    try {
      // Fetch role grants
      const { data: grantsData, error: grantsErr } = await supabase
        .from('role_grants')
        .select(`
          *,
          institute:institutes(name),
          department:departments(name)
        `)
        .order('created_at', { ascending: false });

      if (grantsErr) throw grantsErr;
      if (grantsData) setGrants(grantsData as RoleGrant[]);

      // Fetch institutes & departments
      const { data: instData } = await supabase.from('institutes').select('id, name').order('name');
      const { data: deptData } = await supabase.from('departments').select('id, name, institute_id').order('name');

      if (instData) setInstitutes(instData);
      if (deptData) setDepartments(deptData);
    } catch (err) {
      console.error('Error fetching role grants data', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile, fetchData]);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    const trimmedEmail = email.trim().toLowerCase();

    setSaving(true);
    try {
      const dbInstId = instId || null;
      const dbDeptId = deptId || null;

      // Check if this specific email + role grant already exists
      const { data: existingGrant } = await supabase
        .from('role_grants')
        .select('id')
        .eq('email', trimmedEmail)
        .eq('role', selectedRole)
        .maybeSingle();

      if (existingGrant) {
        showError(`Role "${selectedRole}" is already granted to ${trimmedEmail}.`, 'Warning');
        setSaving(false);
        return;
      }

      // 1. Insert role grant
      const { error: grantErr } = await supabase.from('role_grants').insert({
        email: trimmedEmail,
        role: selectedRole,
        institute_id: dbInstId,
        department_id: dbDeptId,
        can_edit: canEdit,
        granted_by: profile!.id,
      });

      if (grantErr) throw grantErr;

      // 2. Check if user already exists in profiles
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (existingUser) {
        // If they already exist, sync their profile role immediately
        const { error: updateProfileErr } = await supabase
          .from('profiles')
          .update({
            role: selectedRole,
            institute_id: dbInstId,
            department_id: dbDeptId,
          })
          .eq('id', existingUser.id);

        if (updateProfileErr) console.error('Error updating existing user profile role', updateProfileErr);
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'create_role_grant',
        table_name: 'role_grants',
        new_data: { email: trimmedEmail, role: selectedRole, institute_id: dbInstId, department_id: dbDeptId },
      });

      setEmail('');
      setInstId('');
      setDeptId('');
      setCanEdit(false);
      success('Role pre-provisioned successfully.', 'Success');
      await fetchData();
    } catch (err: any) {
      console.error('Error creating role grant', err);
      showError(err.message || 'Failed to create role grant.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGrant = async (grant: RoleGrant) => {
    setRevokeTarget(grant);
  };

  const confirmRevokeGrant = async () => {
    if (!revokeTarget) return;
    const grant = revokeTarget;
    setRevokeTarget(null);
    try {
      const { error } = await supabase.from('role_grants').delete().eq('id', grant.id);
      if (error) throw error;

      // If user profile exists, reset their role to 'student'
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', grant.email)
        .maybeSingle();

      if (existingUser) {
        // Find remaining grants for this email
        const { data: remainingGrants } = await supabase
          .from('role_grants')
          .select('role, institute_id, department_id')
          .eq('email', grant.email);

        const nextRole = remainingGrants && remainingGrants.length > 0 ? (remainingGrants[0].role as AppRole) : 'student';
        const nextInstId = remainingGrants && remainingGrants.length > 0 ? remainingGrants[0].institute_id : null;
        const nextDeptId = remainingGrants && remainingGrants.length > 0 ? remainingGrants[0].department_id : null;

        const { error: profileResetErr } = await supabase
          .from('profiles')
          .update({
            role: nextRole,
            institute_id: nextInstId,
            department_id: nextDeptId,
          })
          .eq('id', existingUser.id);

        if (profileResetErr) console.error('Error updating profile after role revocation', profileResetErr);
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'delete_role_grant',
        table_name: 'role_grants',
        record_id: grant.id,
        old_data: grant as any,
      });

      success('Role access revoked successfully.', 'Success');
      await fetchData();
    } catch (err) {
      console.error('Error revoking role grant', err);
      showError('Failed to revoke role grant.', 'Error');
    }
  };

  // Filter departments by selected institute
  const filteredDepts = departments.filter((d) => !instId || d.institute_id === instId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Role Grants & Provisioning</h1>
        <p className="text-sm text-slate-500 mt-1">Pre-provision roles for faculty and staff based on email domain. If the user registers via Google, they automatically receive this role.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Add Role Grant */}
        <div className="space-y-6">
          <form onSubmit={handleCreateGrant} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#1E3A8A]" />
              Provision Access
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter any email address"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as AppRole)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
              >
                <option value="guide">Guide (Supervisor)</option>
                <option value="hod">HOD (Head of Department)</option>
                <option value="pg_director">PG Director</option>
                <option value="dean">Dean</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Institute</label>
              <select
                value={instId}
                onChange={(e) => {
                  setInstId(e.target.value);
                  setDeptId('');
                }}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
              >
                <option value="">Select Institute (Optional)</option>
                {institutes.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department</label>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                disabled={!instId}
              >
                <option value="">Select Department (Optional)</option>
                {filteredDepts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="canEdit"
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
                className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]/30 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="canEdit" className="text-xs text-slate-600 font-semibold cursor-pointer select-none">
                Allow profile/settings editing
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#1E3A8A]/20 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Provisioning...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Pre-provision User
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel: Role Grant Listing */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Provisioned Accounts</h2>

            {grants.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No provisioned role records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black">
                      <th className="py-3">User Email</th>
                      <th className="py-3">Role</th>
                      <th className="py-3">College / Dept</th>
                      <th className="py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grants.map((g) => (
                      <tr key={g.id} className="group hover:bg-slate-50/50">
                        <td className="py-3.5 font-bold text-slate-800">{g.email}</td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold text-[10px] uppercase">
                            {g.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-500 max-w-[200px] truncate">
                          {g.institute?.name || 'All Colleges'}
                          {g.department ? ` - ${g.department.name}` : ''}
                        </td>
                        <td className="py-3.5 text-right">
                          <button
                            onClick={() => handleDeleteGrant(g)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Revoke Role Access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Revoke Access</h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to revoke role access for <strong>{revokeTarget.email}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRevokeTarget(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={confirmRevokeGrant} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-all">Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
