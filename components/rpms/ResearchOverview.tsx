'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import type { Snapshot, Project, Task, Deliverable, WorkflowDefinition } from '@/lib/rpms/model';
import { rpmsPost } from '@/lib/rpms/client';
import WorkflowBuilder from './WorkflowBuilder';
import QuestionBankEditor from './QuestionBankEditor';
import {
  authorFont,
  poppinsFont,
  TitleStatusBadge,
  TitleStepper,
  MilestoneProgress,
  MilestoneTable,
  ProgressBar,
  Badge,
} from './ui';
import ResearchRequestsPanel from './ResearchRequestsPanel';

const HEALTH: Record<string, { label: string; tone: 'emerald' | 'amber' | 'indigo' | 'rose' | 'slate' }> = {
  completed: { label: 'Completed', tone: 'emerald' },
  on_track: { label: 'On track', tone: 'emerald' },
  at_risk: { label: 'At risk', tone: 'amber' },
  delayed: { label: 'Delayed', tone: 'rose' },
  on_hold: { label: 'On hold', tone: 'indigo' },
  not_initiated: { label: 'Not started', tone: 'slate' },
};

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm';
const field = 'mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20';
const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-40';

function TitleOf(project: Project, snapshot: Snapshot) {
  const linked = snapshot.legacy.titles.find(t => t.research_project_id === project.id);
  return linked ? String(linked.title ?? '') : '';
}

function progressPct(project: Project) {
  return project.progress ?? 0;
}

export default function ResearchOverview() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [evidenceTaskId, setEvidenceTaskId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'projects' | 'builder'>('projects');
  const [showMilestoneAssign, setShowMilestoneAssign] = useState(false);
  const [assignWorkflowId, setAssignWorkflowId] = useState('');
  const [assignReason, setAssignReason] = useState('Initial research workflow assignment');
  const [followUpWorkflowId, setFollowUpWorkflowId] = useState('');
  const [followUpActivityKey, setFollowUpActivityKey] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/rpms', { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Unable to load research projects.');
    return body as Snapshot;
  }, []);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load research projects.');
    }
  }, [load]);

  useEffect(() => {
    let active = true;
    load()
      .then(body => { if (active) { setData(body); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load research projects.'); });
    return () => { active = false; };
  }, [load]);

  async function downloadEvidence(task: Task, file: Deliverable) {
    setBusy(true);
    setError('');
    try {
      const result = await rpmsPost('download', { taskId: task.id, fileId: file.id });
      if (!result.url) throw new Error('Download link unavailable.');
      const link = document.createElement('a');
      link.href = result.url;
      link.rel = 'noopener';
      link.click();
      setNotice('Download link created. It expires in 60 seconds.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to download evidence.');
    } finally {
      setBusy(false);
    }
  }

  async function recordNote(projectId: string) {
    if (!note.trim()) return;
    setBusy(true);
    setError('');
    try {
      await rpmsPost('comment', { projectId, reason: note.trim(), internal: true });
      setNote('');
      setNotice('Faculty note recorded.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record the note.');
    } finally {
      setBusy(false);
    }
  }

  async function assignWorkflowToProject(projectId: string, studentId: string) {
    if (!assignWorkflowId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await rpmsPost('assign', { workflowId: assignWorkflowId, students: [studentId], reason: assignReason || 'Workflow assignment' });
      setNotice('Research workflow and milestones assigned successfully.');
      setShowMilestoneAssign(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to assign workflow.');
    } finally {
      setBusy(false);
    }
  }

  async function addMilestoneToProject(projectId: string) {
    if (!followUpWorkflowId || !followUpActivityKey) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await rpmsPost('add_task', { projectId, workflowId: followUpWorkflowId, activityKey: followUpActivityKey });
      setNotice('Milestone added to student project.');
      setShowMilestoneAssign(false);
      setFollowUpActivityKey('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add milestone.');
    } finally {
      setBusy(false);
    }
  }

  async function publishWorkflow(name: string, definition: WorkflowDefinition) {
    setBusy(true); setError(''); setNotice('');
    try {
      await rpmsPost('publish', { name, definition });
      setNotice('Workflow version published successfully. You can now assign it to students.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish workflow.');
      throw e;
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className={`${card} p-8 text-center`}>
        <Icon icon="solar:danger-triangle-bold-duotone" className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="mt-3 text-xl font-bold text-[#1E293B]" style={authorFont}>Research Progress</h1>
        <p role="alert" className="mt-2 text-sm text-slate-600" style={poppinsFont}>{error}</p>
        <button type="button" className={`${primaryBtn} mt-4`} onClick={() => void refresh()}>Try again</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${card} flex items-center justify-center gap-3 p-10`}>
        <Loader2 className="h-6 w-6 animate-spin text-[#4361EE]" />
        <p className="text-sm text-slate-600" style={poppinsFont}>Loading research projects…</p>
      </div>
    );
  }

  const departments = [...new Set(data.projects.map(p => p.department).filter(Boolean))].sort();
  const projects = data.projects
    .filter(p => !department || p.department === department)
    .filter(p => {
      if (!statusFilter) return true;
      const linked = data.legacy.titles.find(t => t.research_project_id === p.id);
      if (statusFilter === 'none') return !linked;
      return linked?.status === statusFilter;
    })
    .filter(p => {
      const haystack = `${p.name} ${p.enrollment} ${TitleOf(p, data)} ${p.guide}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });

  const project = data.projects.find(p => p.id === selected);

  const projectTasks = project ? data.tasks.filter(t => t.active && t.project_id === project.id) : [];
  const projectTitle = project ? data.legacy.titles.find(t => t.research_project_id === project.id) : undefined;
  const projectEvents = project ? data.events.filter(e => e.project_id === project.id) : [];

  if (project) {
    const evidenceTask = data.tasks.find(t => t.id === evidenceTaskId && t.project_id === project.id);
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => { setSelected(''); setEvidenceTaskId(''); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#4361EE] hover:underline" style={poppinsFont}>
          ← All research projects
        </button>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

        {/* Student + title hero */}
        <section className={`${card} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70" style={poppinsFont}>Research / Dissertation Title</p>
                <h1 className="mt-1 text-2xl font-black leading-snug text-white sm:text-3xl" style={authorFont}>
                  {projectTitle ? String(projectTitle.title ?? '') : 'No title submitted yet'}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80" style={poppinsFont}>
                  <span className="font-semibold">{project.name}</span>
                  <span aria-hidden>·</span><span>{project.enrollment || 'No enrollment ID'}</span>
                  <span aria-hidden>·</span><span>{project.department || 'No department'}</span>
                  <span aria-hidden>·</span><span>Guide: {project.guide || 'Not assigned'}</span>
                  <span aria-hidden>·</span><span>Batch {project.batch || '—'} / Semester {project.semester || '—'}</span>
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <TitleStatusBadge status={projectTitle ? String(projectTitle.status) : undefined} />
                {HEALTH[project.health] && <Badge tone={HEALTH[project.health].tone}>{HEALTH[project.health].label}</Badge>}
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400" style={poppinsFont}>Title approval</p>
              <TitleStepper status={projectTitle ? String(projectTitle.status) : undefined} />
            </div>
            <div className="space-y-2 rounded-xl bg-[#F0F2F8] p-4">
              <MilestoneProgress tasks={projectTasks} />
              <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-600" style={poppinsFont}>
                <div className="flex justify-between"><span>Verified progress</span><span className="font-bold text-[#1E293B]">{project.progress == null ? 'Not configured' : `${project.progress}%`}</span></div>
                <div className="flex justify-between"><span>Expected completion</span><span className="font-semibold text-[#1E293B]">{project.expected_completion ? new Date(project.expected_completion).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</span></div>
                {project.on_hold && <p className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700">On hold: {project.hold_reason || 'No reason recorded'}</p>}
                {project.health_reasons.map((r, i) => <p key={i} className="text-amber-700">{r}</p>)}
              </div>
            </div>
          </div>
        </section>

        {/* Milestones */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Academic milestone table</h2>
              <span className="text-xs text-slate-500" style={poppinsFont}>{projectTasks.length} milestone{projectTasks.length === 1 ? '' : 's'}</span>
            </div>
            {data.canManage && (
              <button
                type="button"
                onClick={() => setShowMilestoneAssign(!showMilestoneAssign)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#4361EE] bg-white px-3 py-1.5 text-xs font-bold text-[#4361EE] hover:bg-[#4361EE]/5 shadow-sm"
                style={authorFont}
              >
                <Icon icon="solar:add-circle-bold-duotone" className="h-4 w-4" />
                {showMilestoneAssign ? 'Close assignment panel' : '+ Assign / Create Milestones'}
              </button>
            )}
          </div>
          <MilestoneTable
            tasks={projectTasks}
            titleStatus={projectTitle ? String(projectTitle.status) : undefined}
            onOpen={setEvidenceTaskId}
            onAssign={data.canManage ? () => setShowMilestoneAssign(true) : undefined}
          />

          {showMilestoneAssign && data.canManage && (
            <div className={`${card} p-5 space-y-4 border-[#4361EE]/30 bg-blue-50/20`}>
              <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#1E293B]" style={authorFont}>Assign Milestones to {project.name}</h3>
                  <p className="text-xs text-slate-500" style={poppinsFont}>
                    Assign a full research lifecycle (e.g. 12 milestones) or append an individual milestone at any stage.
                  </p>
                </div>
                <button type="button" onClick={() => setShowMilestoneAssign(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">✕ Close</button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Option 1: Assign Full Workflow */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-[#1E293B]" style={authorFont}>Option 1: Assign Full Workflow (All Milestones)</h4>
                  <label className="block text-xs font-semibold text-slate-600" style={poppinsFont}>
                    Select published workflow
                    <select className={field} value={assignWorkflowId} onChange={e => setAssignWorkflowId(e.target.value)}>
                      <option value="">Choose workflow template</option>
                      {data.workflows.map(w => (
                        <option key={w.id} value={w.id}>{w.name} (v{w.version}) · {w.definition.tasks.length} milestones</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600" style={poppinsFont}>
                    Assignment note / reason
                    <input className={field} value={assignReason} onChange={e => setAssignReason(e.target.value)} placeholder="Reason for milestone assignment" />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !assignWorkflowId}
                    onClick={() => void assignWorkflowToProject(project.id, project.student_id)}
                    className={`${primaryBtn} w-full`}
                  >
                    Assign Full Workflow Milestones
                  </button>
                </div>

                {/* Option 2: Add Individual Milestone */}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-[#1E293B]" style={authorFont}>Option 2: Add Single Milestone / Activity</h4>
                  <label className="block text-xs font-semibold text-slate-600" style={poppinsFont}>
                    Source workflow template
                    <select className={field} value={followUpWorkflowId} onChange={e => { setFollowUpWorkflowId(e.target.value); setFollowUpActivityKey(''); }}>
                      <option value="">Choose template</option>
                      {data.workflows.map(w => (
                        <option key={w.id} value={w.id}>{w.name} (v{w.version})</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600" style={poppinsFont}>
                    Select activity to assign
                    <select className={field} value={followUpActivityKey} onChange={e => setFollowUpActivityKey(e.target.value)}>
                      <option value="">Choose activity</option>
                      {data.workflows.find(w => w.id === followUpWorkflowId)?.definition.tasks.filter(t => !['title', 'final_review'].includes(t.kind)).map(t => (
                        <option key={t.key} value={t.key}>{t.name} ({t.kind}) · {t.weight}% weight</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !followUpWorkflowId || !followUpActivityKey}
                    onClick={() => void addMilestoneToProject(project.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#4361EE] bg-white px-4 py-2.5 text-sm font-bold text-[#4361EE] hover:bg-[#4361EE]/5 disabled:opacity-40"
                    style={authorFont}
                  >
                    + Add Single Milestone
                  </button>
                </div>
              </div>
            </div>
          )}

          {evidenceTask && (
            <div className={`${card} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400" style={poppinsFont}>Milestone evidence</p>
                  <h3 className="mt-1 text-base font-bold text-[#1E293B]" style={authorFont}>{evidenceTask.name}</h3>
                </div>
                <button type="button" onClick={() => setEvidenceTaskId('')} className="text-xs font-bold text-slate-500 hover:underline" style={poppinsFont}>Close</button>
              </div>
              {evidenceTask.config.instructions && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600" style={poppinsFont}>{evidenceTask.config.instructions}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {evidenceTask.files.length ? evidenceTask.files.map((file: Deliverable) => (
                  file.state === 'reserved' ? null : (
                    <button key={file.id} type="button" disabled={busy} onClick={() => void downloadEvidence(evidenceTask, file)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40" style={poppinsFont}>
                      <Icon icon="solar:download-minimalistic-bold-duotone" className="h-4 w-4 text-[#4361EE]" />
                      {file.filename}
                    </button>
                  )
                )) : <p className="text-xs text-slate-400" style={poppinsFont}>No submitted files for this milestone yet.</p>}
              </div>
            </div>
          )}
        </section>

        {/* Title & evidence summary, un-collapsed */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Submitted title & research evidence</h2>
          <div className={`${card} p-5 space-y-3`}>
            {projectTitle ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400" style={poppinsFont}>Dissertation title</p>
                    <h3 className="mt-1 text-lg font-bold leading-snug text-[#1E293B]" style={authorFont}>{String(projectTitle.title ?? 'Untitled')}</h3>
                  </div>
                  <TitleStatusBadge status={String(projectTitle.status)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {typeof projectTitle.description === 'string' && projectTitle.description.trim() && (
                    <div className="rounded-xl bg-[#F0F2F8] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>Research description</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700" style={poppinsFont}>{projectTitle.description}</p>
                    </div>
                  )}
                  {(() => {
                    const details = (projectTitle.criteria_details && typeof projectTitle.criteria_details === 'object' ? projectTitle.criteria_details : {}) as Record<string, unknown>;
                    const methodology = typeof details.methodology === 'string' ? details.methodology.trim() : '';
                    return methodology ? (
                      <div className="rounded-xl bg-[#F0F2F8] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>Methodology</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700" style={poppinsFont}>{methodology}</p>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Link href="/dean/titles" className={primaryBtn}>
                    <Icon icon="solar:document-text-bold-duotone" className="h-4 w-4" /> View submitted form & evidence
                  </Link>
                  <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" style={poppinsFont}
                    onClick={() => document.getElementById('guide-hod-remarks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    <Icon icon="solar:chat-square-like-bold-duotone" className="h-4 w-4 text-[#4361EE]" /> View Guide & HOD remarks
                  </button>
                  <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50" style={poppinsFont}
                    onClick={() => document.getElementById('faculty-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    <Icon icon="solar:pen-new-square-bold-duotone" className="h-4 w-4 text-[#4361EE]" /> View activity history
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600" style={poppinsFont}>This student has not submitted a dissertation title yet.</p>
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <ResearchRequestsPanel project={project} titles={data.legacy.titles} role={data.role} embedded />

          <div className="space-y-5">
            {/* Remarks */}
            <section id="guide-hod-remarks" className={`${card} p-5`}>
              <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Guide & HOD remarks</h2>
              {projectTitle ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl bg-[#F0F2F8] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>Guide</p>
                    <p className="mt-1 text-sm text-slate-700" style={poppinsFont}>{typeof projectTitle.guide_remarks === 'string' && projectTitle.guide_remarks.trim() ? projectTitle.guide_remarks : 'No guide remarks recorded.'}</p>
                  </div>
                  <div className="rounded-xl bg-[#F0F2F8] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>HOD</p>
                    <p className="mt-1 text-sm text-slate-700" style={poppinsFont}>{typeof projectTitle.hod_remarks === 'string' && projectTitle.hod_remarks.trim() ? projectTitle.hod_remarks : 'No HOD remarks recorded.'}</p>
                  </div>
                </div>
              ) : <p className="mt-2 text-sm text-slate-500" style={poppinsFont}>Remarks appear after a title is submitted.</p>}
            </section>

            {/* Activity history */}
            <section id="faculty-notes" className={`${card} p-5`}>
              <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Activity history ({projectEvents.length})</h2>
              {projectEvents.length ? (
                <ol className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                  {projectEvents.map(e => (
                    <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-xs text-slate-500" style={poppinsFont}>{new Date(e.created_at).toLocaleString()} · {e.actor_name || 'System'} · {e.action.replaceAll('_', ' ')}{e.internal ? ' · Internal' : ''}</p>
                      {!!(e.details.reason || e.details.note) && <p className="whitespace-pre-wrap text-sm text-slate-700" style={poppinsFont}>{String(e.details.reason || e.details.note)}</p>}
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-slate-500" style={poppinsFont}>No activity has been recorded for this project yet.</p>}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={poppinsFont}>
                  Record faculty review / note
                  <textarea className={`${field} mt-1`} rows={3} maxLength={8000} value={note} onChange={e => setNote(e.target.value)} placeholder="Internal faculty note — visible to staff, not the student." style={poppinsFont} />
                </label>
                <button type="button" disabled={busy || !note.trim()} onClick={() => void recordNote(project.id)} className={`${primaryBtn} mt-2`}>Save internal note</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
  const visible = projects.slice(page * pageSize, (page + 1) * pageSize);
  const stats = [
    { label: 'Researchers', value: data.projects.length, icon: 'solar:users-group-rounded-bold-duotone' },
    { label: 'Titles finalized', value: data.projects.filter(p => data.legacy.titles.some(t => t.research_project_id === p.id && t.status === 'finalized')).length, icon: 'solar:check-circle-bold-duotone' },
    { label: 'Awaiting review', value: data.tasks.filter(t => t.active && ['submitted', 'under_review'].includes(t.state)).length, icon: 'solar:hourglass-bold-duotone' },
    { label: 'At risk / delayed', value: data.projects.filter(p => ['at_risk', 'delayed'].includes(p.health)).length, icon: 'solar:danger-triangle-bold-duotone' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#4361EE]" style={poppinsFont}>Faculty of Pharmacy · {data.role.replaceAll('_', ' ')}</p>
          <h1 className="mt-0.5 text-2xl font-black text-[#1E293B] sm:text-3xl" style={authorFont}>Research Progress</h1>
          <p className="mt-1 text-sm text-slate-600" style={poppinsFont}>Every student’s submitted title, approval status and academic milestones in one place.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" style={poppinsFont}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {data.canManage && (
        <nav className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'projects'
                ? 'bg-[#4361EE] text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            style={authorFont}
          >
            Research Projects
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('builder')}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'builder'
                ? 'bg-[#4361EE] text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            style={authorFont}
          >
            Workflow & Milestone Builder
          </button>
        </nav>
      )}

      {activeTab === 'builder' && data.canManage ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#1E293B]" style={authorFont}>Workflow & Milestone Builder</h2>
            <p className="mt-1 text-sm text-slate-600" style={poppinsFont}>
              Design, preview and publish versioned research lifecycles and milestone activities. Published workflows can be assigned to students at any stage.
            </p>
          </div>
          <QuestionBankEditor banks={data.banks} refresh={refresh} />
          <WorkflowBuilder banks={data.banks} workflows={data.workflows} publish={publishWorkflow} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className={`${card} p-4`}>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-black text-[#1E293B]" style={authorFont}>{s.value}</p>
              <Icon icon={s.icon} className="h-6 w-6 text-[#4361EE]/70" />
            </div>
            <p className="mt-1 text-xs text-slate-500" style={poppinsFont}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-semibold text-slate-600" style={poppinsFont}>
          Search
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" className={`${field} pl-9`} placeholder="Student, title, enrollment or guide" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
          </div>
        </label>
        <label className="text-sm font-semibold text-slate-600" style={poppinsFont}>
          Department
          <select className={field} value={department} onChange={e => { setDepartment(e.target.value); setPage(0); }}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-600" style={poppinsFont}>
          Status
          <select className={field} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            <option value="submitted">Under guide review</option>
            <option value="revision_requested">Changes requested</option>
            <option value="guide_accepted">Pending HOD</option>
            <option value="hod_accepted">Pending finalization</option>
            <option value="finalized">Finalized</option>
            <option value="none">No title submitted</option>
          </select>
        </label>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F0F2F8] text-slate-500">
              <tr>
                {['Student', 'Submitted title', 'Title status', 'Milestones', 'Action'].map(h => (
                  <th key={h} scope="col" className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap" style={poppinsFont}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const title = data.legacy.titles.find(t => t.research_project_id === p.id);
                const tasks = data.tasks.filter(t => t.active && t.project_id === p.id && t.kind !== 'title');
                const approved = tasks.filter(t => t.state === 'approved').length;
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#1E293B]" style={authorFont}>{p.name}</p>
                      <p className="text-[11px] text-slate-500" style={poppinsFont}>{p.enrollment || 'No enrollment'} · {p.department || 'No department'}</p>
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="truncate text-slate-700" style={poppinsFont} title={title ? String(title.title ?? '') : 'No title submitted'}>{title ? String(title.title ?? '') : <span className="text-slate-400">No title submitted</span>}</p>
                      <p className="text-[11px] text-slate-400" style={poppinsFont}>Guide: {p.guide || 'Not assigned'}</p>
                    </td>
                    <td className="px-4 py-3"><TitleStatusBadge status={title ? String(title.status) : undefined} />{HEALTH[p.health] && <div className="mt-1"><Badge tone={HEALTH[p.health].tone}>{HEALTH[p.health].label}</Badge></div>}</td>
                    <td className="min-w-[150px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={progressPct(p)} />
                        <span className="whitespace-nowrap text-xs font-bold text-slate-600" style={poppinsFont}>{p.progress == null ? '—' : `${Math.round(p.progress)}%`}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400" style={poppinsFont}>{tasks.length ? `${approved}/${tasks.length} approved` : 'No milestones assigned'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelected(p.id)} className="rounded-xl bg-[#4361EE] px-3 py-2 text-xs font-bold text-white hover:bg-[#3A56D4]" style={authorFont}>Open project</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!projects.length && <p className="p-6 text-center text-sm text-slate-500" style={poppinsFont}>No research projects match this search. Project records appear once students are linked to a research project.</p>}
        {projects.length > pageSize && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-3 text-sm">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span className="text-slate-500" style={poppinsFont}>Page {page + 1} of {totalPages}</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
      </>
      )}
      <p className="text-center text-[11px] text-slate-400" style={poppinsFont}>Read-only overview · {data.role === 'dean' ? 'Dean' : 'PG Director'} access</p>
    </div>
  );
}