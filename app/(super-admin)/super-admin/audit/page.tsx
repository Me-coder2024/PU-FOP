'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  BarChart3,
  Search,
  Eye,
  X,
} from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  user?: { full_name: string | null; email: string } | null;
}

export default function AuditLogsPage() {
  const { profile } = useRole();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected log for detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          user:profiles!audit_logs_user_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (data) setLogs(data as AuditLog[]);
    } catch (err) {
      console.error('Error fetching audit logs', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (profile) fetchLogs();
  }, [profile, fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = !searchQuery.trim()
      || log.action.toLowerCase().includes(searchQuery.toLowerCase())
      || log.table_name?.toLowerCase().includes(searchQuery.toLowerCase())
      || log.user?.email.toLowerCase().includes(searchQuery.toLowerCase())
      || log.user?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Audit Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Realtime trace of important mutations, role modifications, title updates, and configuration overrides.</p>
      </div>

      {/* Filter and search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by action, user email, table..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] transition-all"
        />
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">No logs found</p>
            <p className="text-xs text-slate-400 mt-1">Audit logs are empty or mismatching search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[9px] font-black bg-slate-50/50">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Table / Record</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="p-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-100 border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-800">{log.user?.full_name || 'System'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{log.user?.email || 'automated-task'}</p>
                    </td>
                    <td className="p-4 text-slate-500 font-mono text-[10px]">
                      {log.table_name || 'N/A'} <br />
                      <span className="text-[9px] text-slate-400">{log.record_id || ''}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 text-slate-400 hover:text-[#1E3A8A] hover:bg-[#1E3A8A]/5 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[10px]"
                      >
                        <Eye className="w-3.5 h-3.5" /> View JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* JSON Viewer Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Audit Payload Details</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">ID: {selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs text-slate-700 bg-slate-950 text-emerald-400 flex-1">
              <div>
                <p className="text-slate-400 font-bold mb-1">// Action Metadata</p>
                <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify({
                  action: selectedLog.action,
                  table_name: selectedLog.table_name,
                  record_id: selectedLog.record_id,
                  actor: selectedLog.user?.email || 'System / trigger',
                  timestamp: selectedLog.created_at
                }, null, 2)}</pre>
              </div>

              {selectedLog.old_data && (
                <div>
                  <p className="text-rose-400 font-bold mb-1">// Deleted / Previous Data (Old)</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedLog.old_data, null, 2)}</pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <p className="text-teal-400 font-bold mb-1">// Added / Updated Data (New)</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(selectedLog.new_data, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
