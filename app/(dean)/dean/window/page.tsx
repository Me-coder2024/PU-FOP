'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { NotificationType } from '@/lib/supabase/types';
import {
  Loader2,
  Calendar,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  History,
} from 'lucide-react';

import { useToast } from '@/components/ui/Toast';

interface Institute {
  id: string;
  name: string;
}

interface WindowRecord {
  id: string;
  institute_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
  creator?: { full_name: string | null } | null;
}

export default function DeanWindowPage() {
  const { profile } = useRole();
  const { success, error: showError, warning } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>('');
  
  // Date states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Current windows
  const [activeWindow, setActiveWindow] = useState<WindowRecord | null>(null);
  const [windowHistory, setWindowHistory] = useState<WindowRecord[]>([]);

  const fetchWindowData = useCallback(async (instId: string) => {
    if (!instId) return;
    try {
      // Get the latest window for the institute
      const { data, error } = await supabase
        .from('submission_window')
        .select(`
          *,
          institute:institutes(name)
        `)
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setActiveWindow(data[0] as WindowRecord);
        setWindowHistory(data.slice(1) as WindowRecord[]);
        
        // Populate inputs with current active dates if it's in the future or active
        const now = new Date();
        const end = new Date(data[0].end_date);
        if (end > now) {
          // Format date for datetime-local input
          const startLocal = new Date(data[0].start_date).toISOString().slice(0, 16);
          const endLocal = new Date(data[0].end_date).toISOString().slice(0, 16);
          setStartDate(startLocal);
          setEndDate(endLocal);
        } else {
          setStartDate('');
          setEndDate('');
        }
      } else {
        setActiveWindow(null);
        setWindowHistory([]);
        setStartDate('');
        setEndDate('');
      }
    } catch (err) {
      console.error('Error fetching window data', err);
    }
  }, [supabase]);

  useEffect(() => {
    async function init() {
      if (!profile) return;
      try {
        // Fetch institutes
        const { data: instData, error: instErr } = await supabase
          .from('institutes')
          .select('id, name')
          .order('name', { ascending: true });

        if (instErr) throw instErr;
        if (instData) {
          setInstitutes(instData);
          // Default to dean's institute if available, else first one
          const defaultId = profile.institute_id || instData[0]?.id || '';
          setSelectedInstituteId(defaultId);
          if (defaultId) {
            await fetchWindowData(defaultId);
          }
        }
      } catch (err) {
        console.error('Error initializing window page', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [profile, supabase, fetchWindowData]);

  // Refetch when institute dropdown changes
  const handleInstituteChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedInstituteId(val);
    if (val) {
      setLoading(true);
      await fetchWindowData(val);
      setLoading(false);
    }
  };

  const handleSaveWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstituteId || !startDate || !endDate) {
      warning('Please select institute and enter start and end dates.', 'Warning');
      return;
    }

    const startVal = new Date(startDate);
    const endVal = new Date(endDate);

    if (endVal <= startVal) {
      warning('End date must be after start date.', 'Warning');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('submission_window').insert({
        institute_id: selectedInstituteId,
        start_date: startVal.toISOString(),
        end_date: endVal.toISOString(),
        created_by: profile!.id,
      });

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: profile!.id,
        action: 'set_submission_window',
        table_name: 'submission_window',
        record_id: null,
        new_data: { institute_id: selectedInstituteId, start_date: startDate, end_date: endDate },
      });

      // Notify all students of this institute
      const { data: students } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .eq('institute_id', selectedInstituteId);

      if (students && students.length > 0) {
        const notifications = students.map((std) => ({
          user_id: std.id,
          title: 'Submission Window Updated',
          message: `The submission window has been scheduled from ${new Date(startDate).toLocaleString()} to ${new Date(endDate).toLocaleString()}. Please submit your titles within this period.`,
          type: 'info' as NotificationType,
          link: '/dashboard/submit',
        }));
        await supabase.from('notifications').insert(notifications);
      }

      success('Submission window set successfully!', 'Success');
      await fetchWindowData(selectedInstituteId);
    } catch (err) {
      console.error('Error saving window', err);
      showError('Failed to save submission window.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#1E3A8A] animate-spin" />
      </div>
    );
  }

  const isWindowActive = activeWindow
    ? new Date() >= new Date(activeWindow.start_date) && new Date() <= new Date(activeWindow.end_date)
    : false;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Submission Window Control</h1>
        <p className="text-sm text-slate-500 mt-1">Configure when students are allowed to submit project titles. Outside this window, submission forms will be disabled.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Panel */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveWindow} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900">Set Window Dates</h2>

            {/* Select Institute */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Institute</label>
              <select
                value={selectedInstituteId}
                onChange={handleInstituteChange}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
              >
                <option value="">Select Institute</option>
                {institutes.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                  required
                />
              </div>
            </div>

            {/* Save button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#1E3A8A]/20 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Submission Window
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Window History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              Window Settings History
            </h2>

            {windowHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No past records for this institute.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {windowHistory.map((hist) => (
                  <div key={hist.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-700">
                        {new Date(hist.start_date).toLocaleString()} — {new Date(hist.end_date).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Created on {new Date(hist.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-semibold text-[10px]">
                      Expired
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Info Sidebar */}
        <div className="space-y-6">
          {/* Active status card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Current Window Status</h2>
            {activeWindow ? (
              <div className="space-y-3">
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                  isWindowActive
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {isWindowActive ? (
                    <>
                      <CheckCircle className="w-4.5 h-4.5" />
                      <span className="text-xs font-bold">Currently Active</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4.5 h-4.5" />
                      <span className="text-xs font-bold">Closed / Expired</span>
                    </>
                  )}
                </div>

                <div className="space-y-2.5 pt-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Start Date</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(activeWindow.start_date).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">End Date</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(activeWindow.end_date).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center">
                <Clock className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-800">No Window Configured</p>
                <p className="text-[11px] text-slate-400 mt-1">Students will not be able to submit title forms.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
