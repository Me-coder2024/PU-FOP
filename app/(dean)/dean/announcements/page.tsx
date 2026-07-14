'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { AppRole, NotificationType } from '@/lib/supabase/types';
import {
  Loader2,
  Megaphone,
  Plus,
  Send,
  Users,
  Building,
  Trash2,
} from 'lucide-react';

interface Institute {
  id: string;
  name: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  target_role: string | null;
  target_institute_id: string | null;
  created_at: string;
  institute?: { name: string } | null;
}

export default function DeanAnnouncementsPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<string>('all');
  const [targetInstId, setTargetInstId] = useState<string>('all');

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          institute:institutes(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setAnnouncements(data as Announcement[]);
    } catch (err) {
      console.error('Error fetching announcements', err);
    }
  }, [supabase]);

  useEffect(() => {
    async function init() {
      if (!profile) return;
      try {
        await fetchAnnouncements();

        // Fetch institutes
        const { data: instData, error: instErr } = await supabase
          .from('institutes')
          .select('id, name')
          .order('name', { ascending: true });

        if (instErr) throw instErr;
        if (instData) setInstitutes(instData);
      } catch (err) {
        console.error('Error initializing announcements page', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [profile, fetchAnnouncements, supabase]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert('Please fill out the title and message fields.');
      return;
    }

    setSaving(true);
    try {
      const insertRole = targetRole === 'all' ? null : (targetRole as AppRole);
      const insertInst = targetInstId === 'all' ? null : targetInstId;

      // 1. Create announcement
      const { data: annData, error: annErr } = await supabase
        .from('announcements')
        .insert({
          title: title.trim(),
          message: message.trim(),
          target_role: insertRole,
          target_institute_id: insertInst,
          created_by: profile!.id,
        })
        .select()
        .single();

      if (annErr) throw annErr;

      // 2. Fetch targeted users to notify them
      let query = supabase.from('profiles').select('id');
      if (insertRole) {
        query = query.eq('role', insertRole);
      }
      if (insertInst) {
        query = query.eq('institute_id', insertInst);
      }

      const { data: targetUsers, error: usersErr } = await query;
      if (usersErr) throw usersErr;

      if (targetUsers && targetUsers.length > 0) {
        const batch = targetUsers.map((user) => ({
          user_id: user.id,
          title: `Announcement: ${title.trim()}`,
          message: message.trim().substring(0, 100) + (message.length > 100 ? '...' : ''),
          type: 'info' as NotificationType,
          link: '#',
        }));

        const { error: notifErr } = await supabase.from('notifications').insert(batch);
        if (notifErr) console.error('Error batch inserting notifications', notifErr);
      }

      setTitle('');
      setMessage('');
      setTargetRole('all');
      setTargetInstId('all');
      alert('Announcement published successfully.');
      await fetchAnnouncements();
    } catch (err) {
      console.error('Error publishing announcement', err);
      alert('Failed to publish announcement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      await fetchAnnouncements();
    } catch (err) {
      console.error('Error deleting announcement', err);
      alert('Failed to delete announcement.');
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Announcements Composer</h1>
        <p className="text-sm text-slate-500 mt-1">Publish university-wide or institute/role specific announcements that appear in users' notifications.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Composer Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handlePublish} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#1E3A8A]" />
              Write New Announcement
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Important update on final year submission..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={5}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Role</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Student</option>
                  <option value="guide">Guide</option>
                  <option value="hod">HOD</option>
                  <option value="pg_director">PG Director</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target College / Institute</label>
                <select
                  value={targetInstId}
                  onChange={(e) => setTargetInstId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/35 transition-all"
                >
                  <option value="all">All Institutes</option>
                  {institutes.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
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
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Publish Announcement
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Past Announcements Queue */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Past Announcements</h2>
            {announcements.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No announcements published yet.</p>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {announcements.map((ann) => (
                  <div key={ann.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative group space-y-2">
                    <button
                      onClick={() => handleDelete(ann.id)}
                      className="absolute top-3 right-3 text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div>
                      <p className="text-xs font-bold text-slate-800 pr-5">{ann.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(ann.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 whitespace-pre-line leading-relaxed">
                      {ann.message}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                        Target: {ann.target_role ? ann.target_role.toUpperCase() : 'ALL'}
                      </span>
                      {ann.institute && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded truncate max-w-[150px]">
                          Inst: {ann.institute.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
