import type { ReactNode } from 'react';
import type { SubmissionStatus } from '@/lib/supabase/types';
import type { Task, TaskState } from '@/lib/rpms/model';

export const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
export const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

export const badgeBase = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap';

type Tone = 'emerald' | 'amber' | 'indigo' | 'rose' | 'slate' | 'blue';

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`${badgeBase} ${TONES[tone]}`} style={poppinsFont}>{children}</span>;
}

const TITLE_STATUS: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Under Guide Review', tone: 'amber' },
  revision_requested: { label: 'Changes Requested', tone: 'rose' },
  guide_accepted: { label: 'Pending HOD', tone: 'indigo' },
  guide_rejected: { label: 'Rejected by Guide', tone: 'rose' },
  hod_accepted: { label: 'Pending Finalization', tone: 'indigo' },
  hod_rejected: { label: 'Rejected by HOD', tone: 'rose' },
  finalized: { label: 'Finalized', tone: 'emerald' },
};

export function TitleStatusBadge({ status }: { status: string | undefined }) {
  const entry = status ? TITLE_STATUS[status as SubmissionStatus] : undefined;
  if (!entry) return <Badge tone="slate">No title submitted</Badge>;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function titleStage(status: string | undefined) {
  switch (status) {
    case 'finalized': return 'After title finalization';
    case 'hod_accepted': return 'With the PG Director';
    case 'guide_accepted': return 'With the HOD';
    case 'guide_rejected':
    case 'hod_rejected': return 'Title rejected — clarifications still welcome';
    case 'submitted':
    case 'revision_requested': return 'Before title finalization';
    default: return 'No title submitted yet';
  }
}

export const TITLE_STEPS = ['Submitted', 'Guide Accepted', 'HOD Accepted', 'Finalized'] as const;

export function titleStepIndex(status: string | undefined) {
  switch (status) {
    case 'finalized': return 3;
    case 'hod_accepted': return 2;
    case 'guide_accepted': return 1;
    case 'guide_rejected': return 0;
    case 'hod_rejected': return 1;
    case 'submitted':
    case 'revision_requested': return 0;
    default: return -1;
  }
}

const TASK_STATES: Record<TaskState, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'slate' },
  in_progress: { label: 'In progress', tone: 'blue' },
  submitted: { label: 'Submitted', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'indigo' },
  changes_required: { label: 'Changes requested', tone: 'rose' },
  approved: { label: 'Approved', tone: 'emerald' },
};

export function taskStateLabel(state: string) {
  return TASK_STATES[state as TaskState]?.label ?? state.replaceAll('_', ' ');
}

export function TaskStateBadge({ state }: { state: string }) {
  return <Badge tone={TASK_STATES[state as TaskState]?.tone ?? 'slate'}>{taskStateLabel(state)}</Badge>;
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'emerald' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Verified research progress"
      className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#4361EE] to-[#2D46B9]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TitleStepper({ status }: { status: string | undefined }) {
  const current = titleStepIndex(status);
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Title approval progress">
      {TITLE_STEPS.map((step, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-[#4361EE] text-white' : 'bg-slate-100 text-slate-400'
              }`}
              style={authorFont}
            >
              {done ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <p
                className={`truncate text-xs font-bold ${done ? 'text-emerald-700' : active ? 'text-[#4361EE]' : 'text-slate-400'}`}
                style={poppinsFont}
              >
                {step}
              </p>
              <p className="text-[10px] text-slate-400" style={poppinsFont}>
                {done ? 'Complete' : active ? 'Current stage' : 'Pending'}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LinkedTitleSummary({ submission }: { submission: Record<string, unknown> | undefined }) {
  if (!submission) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <p className="text-sm text-slate-600" style={poppinsFont}>No title has been submitted for this student yet.</p>
      </div>
    );
  }
  const status = String(submission.status ?? '');
  const description = typeof submission.description === 'string' ? submission.description.trim() : '';
  const details = (submission.criteria_details && typeof submission.criteria_details === 'object' ? submission.criteria_details : {}) as Record<string, unknown>;
  const methodology = typeof details.methodology === 'string' ? details.methodology.trim() : '';
  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400" style={poppinsFont}>Submitted dissertation title</p>
          <h3 className="mt-1 text-lg font-bold text-[#1E293B] leading-snug" style={authorFont}>{String(submission.title ?? 'Untitled submission')}</h3>
          <p className="mt-1 text-xs text-slate-500" style={poppinsFont}>
            Submitted {submission.created_at ? new Date(String(submission.created_at)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unavailable'}
            {submission.finalized_at ? ` · Finalized ${new Date(String(submission.finalized_at)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </p>
        </div>
        <TitleStatusBadge status={status} />
      </div>
      {(description || methodology) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {description && (
            <div className="rounded-xl bg-[#F0F2F8] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>Research description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed" style={poppinsFont}>{description}</p>
            </div>
          )}
          {methodology && (
            <div className="rounded-xl bg-[#F0F2F8] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>Methodology</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed" style={poppinsFont}>{methodology}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LegacyEvidenceSection({ legacy, projectId }: { legacy: { titles: Record<string, unknown>[]; requests: Record<string, unknown>[]; presentations: Record<string, unknown>[] }; projectId: string }) {
  const titles = legacy.titles.filter(t => t.research_project_id === projectId);
  const submissions = titles.length ? titles : legacy.requests.length || legacy.presentations.length ? legacy.titles.filter(t => !t.research_project_id) : [];
  const linked = submissions[submissions.length - 1];
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Linked title & earlier research evidence</h2>
      </div>
      <LinkedTitleSummary submission={linked} />
      {!!submissions.length && <LegacyDetails submission={linked} />}
    </section>
  );
}

function LegacyDetails({ submission }: { submission: Record<string, unknown> | undefined }) {
  if (!submission) return null;
  const remarks = [
    ['Guide', submission.guide_remarks],
    ['HOD', submission.hod_remarks],
    ['Rejection reason', submission.rejection_reason],
  ].filter(([, value]) => typeof value === 'string' && value.trim()) as [string, string][];
  const history = (Array.isArray(submission.history) ? submission.history : []) as { id: string; action: string; created_at: string; remarks: string | null }[];
  if (!remarks.length && !history.length) return null;
  return (
    <details className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-slate-700" style={poppinsFont}>Remarks & title history</summary>
      <div className="mt-3 space-y-2">
        {remarks.map(([label, value]) => (
          <p key={label} className="text-sm text-slate-700" style={poppinsFont}><strong>{label}:</strong> {value}</p>
        ))}
        {!!history.length && (
          <ol className="space-y-1 border-t border-slate-100 pt-2">
            {history.map(e => (
              <li key={e.id} className="text-xs text-slate-500" style={poppinsFont}>
                {new Date(e.created_at).toLocaleString()} · {e.action.replaceAll('_', ' ')}{e.remarks ? ` · ${e.remarks}` : ''}
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

export function MilestoneTable({ tasks, titleStatus, onOpen, onAssign }: { tasks: Task[]; titleStatus?: string; onOpen?: (id: string) => void; onAssign?: () => void }) {
  if (!tasks.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        {titleStatus === 'finalized' ? (
          <>
            <Badge tone="indigo">Title Finalized — Ready for Milestone Assignment</Badge>
            <p className="mt-2 text-sm text-slate-500" style={poppinsFont}>No research milestones have been assigned to this student yet. The PG Director can assign milestones at any stage.</p>
          </>
        ) : (
          <>
            <Badge tone="slate">No milestones assigned</Badge>
            <p className="mt-2 text-sm text-slate-500" style={poppinsFont}>No research milestones have been assigned to this student yet. Milestones can be assigned at any time (before or after title finalization).</p>
          </>
        )}
        {onAssign && (
          <div className="mt-3">
            <button
              type="button"
              onClick={onAssign}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95"
              style={authorFont}
            >
              + Assign Research Milestones / Workflow
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#F0F2F8] text-slate-500">
          <tr>
            {['Milestone / Activity', 'Deliverable', 'Reviewer', 'Due date', 'Status', 'Action'].map(h => (
              <th key={h} scope="col" className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap" style={poppinsFont}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const deliverable = t.kind === 'pptx' ? 'Presentation (.pptx)' : t.kind === 'document' ? 'Document (.pdf)' : t.kind === 'assessment' ? 'Online assessment' : t.kind === 'questionnaire' ? 'Written response' : t.kind === 'title' ? 'Resubmission form' : t.kind === 'final_review' ? 'Final review record' : 'Form / notes';
            return (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#1E293B]" style={authorFont}>{t.name}</p>
                  {t.locked && <p className="text-[11px] text-slate-400" style={poppinsFont}>{t.lock_reason}</p>}
                  {t.blocked && <p className="text-[11px] text-rose-600" style={poppinsFont}>Blocked: {t.blocker}</p>}
                </td>
                <td className="px-4 py-3 text-slate-600" style={poppinsFont}>{deliverable}</td>
                <td className="px-4 py-3 capitalize text-slate-600" style={poppinsFont}>{t.config.reviewer.replaceAll('_', ' ')}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600" style={poppinsFont}>{new Date(t.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td className="px-4 py-3"><TaskStateBadge state={t.state} /></td>
                <td className="px-4 py-3">
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(t.id)} className="rounded-lg border border-[#4361EE]/30 px-3 py-1.5 text-xs font-bold text-[#4361EE] hover:bg-[#4361EE]/5" style={authorFont}>
                      {t.state === 'approved' ? 'View evidence' : ['submitted', 'under_review'].includes(t.state) ? 'Faculty review' : t.state === 'changes_required' ? 'Revise' : 'Open'}
                    </button>
                  ) : <span className="text-xs text-slate-400" style={poppinsFont}>Read-only</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MilestoneProgress({ tasks }: { tasks: Task[] }) {
  const weighted = tasks.filter(t => t.kind !== 'title');
  const approved = weighted.filter(t => t.state === 'approved').length;
  const pct = weighted.length ? (approved / weighted.length) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700" style={poppinsFont}>Research milestones</span>
        <span className="font-bold text-[#4361EE]" style={authorFont}>{weighted.length ? `${approved}/${weighted.length} · ${Math.round(pct)}%` : 'Not assigned'}</span>
      </div>
      <ProgressBar value={pct} tone={pct === 100 ? 'emerald' : 'brand'} />
      <p className="text-[11px] text-slate-500" style={poppinsFont}>{weighted.length ? 'Counts only milestones approved by the assigned reviewer.' : 'Milestones appear once a workflow is assigned to this research project.'}</p>
    </div>
  );
}