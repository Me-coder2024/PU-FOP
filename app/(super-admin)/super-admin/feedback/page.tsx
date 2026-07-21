'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  MessageSquare,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface FeedbackItem {
  id: string;
  user_id: string | null;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
  user?: { full_name: string | null; email: string; role: string } | null;
}

export default function SuperAdminFeedbackPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const { success, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchFeedback = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select(`
          *,
          user:profiles!feedback_user_id_fkey(full_name, email, role)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setFeedbackList(data as FeedbackItem[]);
    } catch (err) {
      console.error('Error fetching feedback', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profile) fetchFeedback();
  }, [profile, fetchFeedback]);

  const handleUpdateStatus = async (id: string, newStatus: 'open' | 'in_progress' | 'resolved') => {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state directly for speed
      setFeedbackList((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
      success(`Ticket status updated to ${newStatus.replace('_', ' ')}`, 'Success');
    } catch (err) {
      console.error('Error updating feedback status', err);
      showError('Failed to update status.', 'Error');
    }
  };

  const filtered = feedbackList.filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Feedback & Support Tickets</h1>
        <p className="text-sm text-slate-500 mt-1">Review feedback, bug reports, and database correction request forms submitted by students or staff.</p>
      </div>

      {/* Filter toolbar */}
      <div className="flex gap-2">
        {['all', 'open', 'in_progress', 'resolved'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              statusFilter === status
                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">No support tickets found</p>
            <p className="text-xs text-slate-400 mt-1">Everything is resolved or no reports submitted.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">{item.subject}</h3>
                  <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-semibold">
                    <span>By {item.user?.full_name || 'Anonymous'} ({item.user?.email || 'N/A'})</span>
                    <span>•</span>
                    <span className="uppercase text-[#1E3A8A]">{item.user?.role || 'Student'}</span>
                    <span>•</span>
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={item.status}
                    onChange={(e) => handleUpdateStatus(item.id, e.target.value as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20 ${
                      item.status === 'resolved'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : item.status === 'in_progress'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {item.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
