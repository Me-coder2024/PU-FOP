'use client';

import React, { useEffect, useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface Submission {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  guide_remarks: string | null;
  hod_remarks: string | null;
}

const STATUS_STEPS = [
  { key: 'submitted', label: 'Submitted', icon: 'solar:document-add-bold-duotone', description: 'Your topic has been submitted for review' },
  { key: 'guide_review', label: 'Guide Review', icon: 'solar:user-check-bold-duotone', description: 'Your guide is reviewing the topic' },
  { key: 'guide_approved', label: 'Guide Approved', icon: 'solar:check-circle-bold-duotone', description: 'Guide has approved your topic' },
  { key: 'hod_review', label: 'HOD Review', icon: 'solar:shield-user-bold-duotone', description: 'Head of Department is reviewing' },
  { key: 'hod_approved', label: 'HOD Approved', icon: 'solar:verified-check-bold-duotone', description: 'HOD has approved your topic' },
  { key: 'final_approved', label: 'Final Approved', icon: 'solar:cup-star-bold-duotone', description: 'Topic fully approved — congratulations!' },
];

function getStatusIndex(status: string): number {
  if (status === 'revision_requested') return 1; // stuck at guide review
  if (status === 'guide_rejected') return -1;
  if (status === 'hod_rejected') return 2; // stuck after guide
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : 0;
}

export default function ProgressTrackerPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      try {
        const { data } = await supabase
          .from('submissions')
          .select('id, title, status, created_at, updated_at, guide_remarks, hod_remarks')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setSubmission(data as Submission);
      } catch (err) {
        console.error('Error loading submission', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  const statusIdx = submission ? getStatusIndex(submission.status) : -1;
  const isRejected = submission && (submission.status === 'guide_rejected' || submission.status === 'hod_rejected');
  const isRevision = submission?.status === 'revision_requested';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
            Progress Tracker
          </h1>
          <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
            <Icon icon="solar:chart-2-bold" className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-sm text-slate-500" style={authorFont}>
          Track the real-time progress of your dissertation topic through the approval pipeline.
        </p>
      </div>

      {!submission ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <Icon icon="solar:document-add-bold-duotone" className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Submission Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto" style={authorFont}>
            Submit your dissertation topic first to see the progress here.
          </p>
        </div>
      ) : (
        <>
          {/* Current Title Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1" style={authorFont}>Current Title</p>
                <h2 className="text-lg font-bold text-slate-900" style={authorFont}>{submission.title}</h2>
                <p className="text-xs text-slate-400 mt-1" style={poppinsFont}>
                  Submitted {new Date(submission.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                isRejected ? 'bg-red-50 text-red-700 border border-red-200' :
                isRevision ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                submission.status === 'final_approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                'bg-blue-50 text-[#4361EE] border border-blue-200'
              }`}>
                {submission.status.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          {/* Rejection/Revision Banner */}
          {isRejected && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <Icon icon="solar:close-circle-bold-duotone" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800" style={authorFont}>
                  Topic Rejected by {submission.status === 'guide_rejected' ? 'Guide' : 'HOD'}
                </p>
                <p className="text-[11px] text-red-700 mt-0.5" style={authorFont}>
                  {submission.status === 'guide_rejected' ? submission.guide_remarks : submission.hod_remarks}
                </p>
              </div>
            </div>
          )}

          {isRevision && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Icon icon="solar:pen-new-round-bold-duotone" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800" style={authorFont}>Revision Requested</p>
                <p className="text-[11px] text-amber-700 mt-0.5" style={authorFont}>{submission.guide_remarks}</p>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-6" style={authorFont}>Approval Pipeline</h3>
            <div className="space-y-0">
              {STATUS_STEPS.map((step, i) => {
                const isCompleted = i <= statusIdx;
                const isCurrent = i === statusIdx;
                const isLast = i === STATUS_STEPS.length - 1;

                return (
                  <div key={step.key} className="flex gap-4">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                        isCompleted
                          ? isCurrent ? 'bg-[#4361EE] shadow-lg shadow-[#4361EE]/30' : 'bg-emerald-500'
                          : 'bg-slate-100 border border-slate-200'
                      }`}>
                        <Icon
                          icon={isCompleted && !isCurrent ? 'solar:check-circle-bold' : step.icon}
                          className={`w-5 h-5 ${isCompleted ? 'text-white' : 'text-slate-400'}`}
                        />
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 h-12 ${i < statusIdx ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                      )}
                    </div>

                    {/* Label */}
                    <div className={`pt-2 ${isLast ? 'pb-0' : 'pb-6'}`}>
                      <p className={`text-sm font-bold ${isCompleted ? 'text-slate-900' : 'text-slate-400'}`} style={authorFont}>
                        {step.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5" style={authorFont}>{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2" style={authorFont}>Days Since Submission</p>
              <p className="text-3xl font-bold text-slate-900" style={poppinsFont}>
                {Math.floor((Date.now() - new Date(submission.created_at).getTime()) / (1000 * 60 * 60 * 24))}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2" style={authorFont}>Stages Completed</p>
              <p className="text-3xl font-bold text-slate-900" style={poppinsFont}>
                {Math.max(0, statusIdx + 1)}<span className="text-lg text-slate-400">/{STATUS_STEPS.length}</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2" style={authorFont}>Last Updated</p>
              <p className="text-sm font-bold text-slate-900" style={poppinsFont}>
                {new Date(submission.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
