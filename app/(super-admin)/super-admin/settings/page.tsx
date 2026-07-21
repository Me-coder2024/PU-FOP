'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Settings,
  ShieldAlert,
  Database,
  Plus,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface Drug {
  id: string;
  name: string;
  category: string | null;
  dosage_forms: string[] | null;
  therapeutic: string | null;
}

export default function SuperAdminSettingsPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingDrug, setSavingDrug] = useState(false);
  const [drugs, setDrugs] = useState<Drug[]>([]);

  // Drug Form
  const [drugName, setDrugName] = useState('');
  const [drugCategory, setDrugCategory] = useState('');
  const [drugTherapeutic, setDrugTherapeutic] = useState('');
  const [drugDosage, setDrugDosage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { success, error: showError } = useToast();

  const fetchDrugs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('drugs')
        .select('*')
        .order('name', { ascending: true })
        .limit(100);

      if (error) throw error;
      if (data) setDrugs(data as Drug[]);
    } catch (err) {
      console.error('Error fetching drugs', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profile) fetchDrugs();
  }, [profile, fetchDrugs]);

  const handleAddDrug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drugName.trim()) return;

    setSavingDrug(true);
    try {
      const dosageForms = drugDosage.split(',').map((d) => d.trim()).filter(Boolean);

      const { error } = await supabase.from('drugs').insert({
        name: drugName.trim(),
        category: drugCategory.trim() || null,
        dosage_forms: dosageForms.length > 0 ? dosageForms : null,
        therapeutic: drugTherapeutic.trim() || null,
      });

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'create_drug',
        table_name: 'drugs',
        new_data: { name: drugName.trim() },
      });

      setDrugName('');
      setDrugCategory('');
      setDrugTherapeutic('');
      setDrugDosage('');
      success('Drug added successfully.', 'Success');
      await fetchDrugs();
    } catch (err) {
      console.error('Error adding drug', err);
      showError('Failed to add drug (likely duplicate name).', 'Error');
    } finally {
      setSavingDrug(false);
    }
  };

  const handleDeleteDrug = async (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const confirmDeleteDrug = async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    try {
      const { error } = await supabase.from('drugs').delete().eq('id', id);
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'delete_drug',
        table_name: 'drugs',
        record_id: id,
        old_data: { name },
      });

      success('Drug deleted successfully.', 'Success');
      await fetchDrugs();
    } catch (err) {
      console.error('Error deleting drug', err);
      showError('Failed to delete drug.', 'Error');
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Settings & Data Repo</h1>
        <p className="text-sm text-slate-500 mt-1">Configure global constraints and manage the drug reference database.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: General Settings and Info */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#1E3A8A]" />
              System Config
            </h2>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-semibold">Allowed Email Domain</span>
                <span className="font-bold text-slate-700">@paruluniversity.ac.in</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-semibold">Super Admin Account</span>
                <span className="font-bold text-slate-700">me.coder.in@gmail.com</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-semibold">OAuth Provider</span>
                <span className="font-bold text-slate-700">Google OAuth 2.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Database Engine</span>
                <span className="font-bold text-slate-700">PostgreSQL (Supabase)</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              Security Notices
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Row-Level Security (RLS) is enabled on all tables. Only pre-provisioned email addresses have guide/HOD/PG Director/Dean roles. By default, any new Google OAuth signup is provisioned as a Student.
            </p>
          </div>
        </div>

        {/* Right: Drug database CRUD */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              Drug Reference Repository
            </h2>

            {/* Form */}
            <form onSubmit={handleAddDrug} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-700">Add New Reference Drug</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={drugName}
                  onChange={(e) => setDrugName(e.target.value)}
                  placeholder="Drug Name (e.g. Paracetamol)"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                  required
                />
                <input
                  type="text"
                  value={drugCategory}
                  onChange={(e) => setDrugCategory(e.target.value)}
                  placeholder="Category (e.g. Analgesic)"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                />
                <input
                  type="text"
                  value={drugTherapeutic}
                  onChange={(e) => setDrugTherapeutic(e.target.value)}
                  placeholder="Therapeutic Action"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                />
                <input
                  type="text"
                  value={drugDosage}
                  onChange={(e) => setDrugDosage(e.target.value)}
                  placeholder="Dosage Forms (comma separated: Tablet, Syrup)"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35"
                />
              </div>

              <button
                type="submit"
                disabled={savingDrug}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
              >
                {savingDrug ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Drug
              </button>
            </form>

            {/* List */}
            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
              {drugs.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No drug repository records loaded.</p>
              ) : (
                drugs.map((drug) => (
                  <div key={drug.id} className="py-3 flex items-center justify-between text-xs group">
                    <div>
                      <p className="font-bold text-slate-700">{drug.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Category: {drug.category || 'N/A'} | Therapeutic: {drug.therapeutic || 'N/A'}
                      </p>
                      {drug.dosage_forms && (
                        <p className="text-[9px] text-[#1E3A8A] font-semibold mt-0.5">
                          Forms: {drug.dosage_forms.join(', ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteDrug(drug.id, drug.name)}
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm Deletion</h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete &quot;{deleteTarget.name}&quot; from the repository?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={confirmDeleteDrug} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
