'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import DashboardShell from '@/components/layout/DashboardShell';
import {
  Loader2,
  MessageSquare,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
}

export default function GeneralFeedbackPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackItem[]>([]);

  // Form states
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const fetchFeedbackHistory = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setFeedbackHistory(data as FeedbackItem[]);
    } catch (err) {
      console.error('Error fetching feedback history', err);
    } finally {
      setLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) fetchFeedbackHistory();
  }, [profile, fetchFeedbackHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || !profile) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: profile.id,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
      });

      if (error) throw error;

      // Log audit action
      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'submit_feedback',
        table_name: 'feedback',
        new_data: { subject: subject.trim(), message: message.trim() },
      });

      setSubject('');
      setMessage('');
      alert('Feedback submitted successfully. The Super Admin team will review it.');
      await fetchFeedbackHistory();
    } catch (err) {
      console.error('Error submitting feedback', err);
      alert('Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
            <CheckCircle className="w-3 h-3" /> Resolved
          </span>
        );
      case 'in_progress':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
            <AlertCircle className="w-3 h-3" /> Open
          </span>
        );
    }
  };

  const pageContent = (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Feedback & Technical Issues</h1>
        <p className="text-sm text-slate-500 mt-1">Submit feedback, report system bugs, or request manual data corrections.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#1E3A8A]" />
              New Ticket
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Database correction request / Feature suggestion / UI bug..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Detail the issue or request here. Please be as descriptive as possible..."
                rows={6}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#1E3A8A]/20 transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Ticket
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right past tickets list */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Your Tickets History</h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : feedbackHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No past tickets found.</p>
            ) : (
              <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
                {feedbackHistory.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-bold text-slate-800 truncate pr-2">{item.subject}</p>
                      {getStatusBadge(item.status)}
                    </div>
                    <p className="text-[11px] text-slate-500 whitespace-pre-line leading-relaxed truncate max-h-[50px]">
                      {item.message}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return <DashboardShell>{pageContent}</DashboardShell>;
}
