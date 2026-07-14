'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Building,
  Plus,
  Trash2,
  Building2,
} from 'lucide-react';

interface Institute {
  id: string;
  name: string;
  created_at: string;
}

interface Department {
  id: string;
  name: string;
  institute_id: string;
  created_at: string;
  institute?: { name: string } | null;
}

export default function InstitutesPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingInst, setSavingInst] = useState(false);
  const [savingDept, setSavingDept] = useState(false);
  
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Form inputs
  const [instName, setInstName] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptInstId, setDeptInstId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const { data: instData, error: instErr } = await supabase
        .from('institutes')
        .select('*')
        .order('name', { ascending: true });

      if (instErr) throw instErr;
      if (instData) setInstitutes(instData);

      const { data: deptData, error: deptErr } = await supabase
        .from('departments')
        .select(`
          *,
          institute:institutes(name)
        `)
        .order('name', { ascending: true });

      if (deptErr) throw deptErr;
      if (deptData) setDepartments(deptData as Department[]);
    } catch (err) {
      console.error('Error fetching structural data', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profile) fetchData();
  }, [profile, fetchData]);

  const handleAddInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName.trim()) return;

    setSavingInst(true);
    try {
      const { error } = await supabase.from('institutes').insert({
        name: instName.trim(),
      });

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'create_institute',
        table_name: 'institutes',
        new_data: { name: instName.trim() },
      });

      setInstName('');
      alert('Institute added successfully!');
      await fetchData();
    } catch (err) {
      console.error('Error adding institute', err);
      alert('Failed to add institute.');
    } finally {
      setSavingInst(false);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptInstId) return;

    setSavingDept(true);
    try {
      const { error } = await supabase.from('departments').insert({
        name: deptName.trim(),
        institute_id: deptInstId,
      });

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'create_department',
        table_name: 'departments',
        new_data: { name: deptName.trim(), institute_id: deptInstId },
      });

      setDeptName('');
      setDeptInstId('');
      alert('Department added successfully!');
      await fetchData();
    } catch (err) {
      console.error('Error adding department', err);
      alert('Failed to add department.');
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteInstitute = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will delete all associated departments and cascade update users.`)) return;
    try {
      const { error } = await supabase.from('institutes').delete().eq('id', id);
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'delete_institute',
        table_name: 'institutes',
        record_id: id,
        old_data: { name },
      });

      await fetchData();
    } catch (err) {
      console.error('Error deleting institute', err);
      alert('Failed to delete institute.');
    }
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete department "${name}"?`)) return;
    try {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'delete_department',
        table_name: 'departments',
        record_id: id,
        old_data: { name },
      });

      await fetchData();
    } catch (err) {
      console.error('Error deleting department', err);
      alert('Failed to delete department.');
    }
  };

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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Institutes & Departments Manager</h1>
        <p className="text-sm text-slate-500 mt-1">Add, update, or remove colleges and their nested study departments.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ===== INSTITUTES SECTION ===== */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-[#1E3A8A]" />
              Institutes / Colleges
            </h2>

            {/* Form */}
            <form onSubmit={handleAddInstitute} className="flex gap-2">
              <input
                type="text"
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                placeholder="Faculty of Pharmacy"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
              <button
                type="submit"
                disabled={savingInst}
                className="px-4 py-2.5 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {savingInst ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Plus className="w-4.5 h-4.5" />}
                Add
              </button>
            </form>

            {/* List */}
            <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
              {institutes.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No institutes added yet.</p>
              ) : (
                institutes.map((inst) => (
                  <div key={inst.id} className="py-3 flex items-center justify-between text-xs group">
                    <span className="font-semibold text-slate-700">{inst.name}</span>
                    <button
                      onClick={() => handleDeleteInstitute(inst.id, inst.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ===== DEPARTMENTS SECTION ===== */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Departments
            </h2>

            {/* Form */}
            <form onSubmit={handleAddDepartment} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={deptInstId}
                  onChange={(e) => setDeptInstId(e.target.value)}
                  className="w-full sm:w-[180px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                  required
                >
                  <option value="">Select College</option>
                  {institutes.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Pharmaceutics"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                  required
                />
                <button
                  type="submit"
                  disabled={savingDept}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {savingDept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            </form>

            {/* List */}
            <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-1">
              {departments.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No departments added yet.</p>
              ) : (
                departments.map((dept) => (
                  <div key={dept.id} className="py-3 flex items-center justify-between text-xs group">
                    <div>
                      <p className="font-semibold text-slate-700">{dept.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{dept.institute?.name || 'Unknown College'}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
