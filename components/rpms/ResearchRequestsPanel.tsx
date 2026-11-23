'use client';
import { useCallback, useEffect, useState } from 'react';
import type { StudentResearchRecord, StudentResearchSnapshot } from '@/lib/progress/student-types';
import { StudentResearchComposer, StudentResearchCard } from '@/components/progress/StudentResearchTracker';
import ResearchProgress from '@/components/progress/ResearchProgress';
import type { Project } from '@/lib/rpms/model';
import { authorFont, poppinsFont, titleStage } from './ui';

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm';
const primary = 'inline-flex items-center rounded-xl bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-40';

type Loaded = { students: StudentResearchSnapshot['students']; records: StudentResearchRecord[] };

export default function ResearchRequestsPanel({ project, titles, role, embedded = false }: { project: Project; titles: Record<string, unknown>[]; role: string; embedded?: boolean }) {
  const canManage = role === 'pg_director' || role === 'super_admin';
  const submission = titles.find(t => t.research_project_id === project.id);
  const submissionId = submission ? String(submission.id) : '';
  const [view, setView] = useState<'questions' | 'presentations'>('questions');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [compose, setCompose] = useState(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const response = await fetch('/api/research/students', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load research questions.');
    return {
      students: (body.students || []) as StudentResearchSnapshot['students'],
      records: (body.records || []).filter((r: StudentResearchRecord) => r.assignment.student_id === project.student_id) as StudentResearchRecord[],
    };
  }, [project.student_id]);

  useEffect(() => {
    let active = true;
    load()
      .then(data => { if (active) { setLoaded(data); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load research questions.'); });
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    try {
      setLoaded(await load());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load research questions.');
    }
  }

  const records = loaded?.records ?? [];
  const registered = !!loaded?.students.some(s => s.id === project.student_id);

  return (
    <section className={embedded ? 'space-y-3' : `${card} space-y-3 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1E293B]" style={authorFont}>Questions, assignments & responses</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500" style={poppinsFont}>
            Send literature review questions, MCQs or lab assignments at any stage — before title finalization, while the title is with the Guide or HOD, or during dissertation work. Responses, files and Guide/HOD remarks stay together in one history.
          </p>
        </div>
        {canManage && (
          <button type="button" className={primary} disabled={!loaded || !registered} onClick={() => setCompose(true)}>
            Send questions / assignment
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!loaded && !error && <p role="status" className="text-xs text-slate-500" style={poppinsFont}>Loading requests…</p>}

      {loaded && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={view === 'questions'} onClick={() => setView('questions')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${view === 'questions' ? 'border-[#4361EE] bg-[#4361EE]/10 text-[#4361EE]' : 'border-slate-200 bg-white text-slate-600'}`} style={poppinsFont}>
              Questions & assignments ({records.length})
            </button>
            <button type="button" aria-pressed={view === 'presentations'} onClick={() => setView('presentations')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${view === 'presentations' ? 'border-[#4361EE] bg-[#4361EE]/10 text-[#4361EE]' : 'border-slate-200 bg-white text-slate-600'}`} style={poppinsFont}>
              Title-linked presentations
            </button>
          </div>

          {view === 'questions' && (
            <div className="space-y-3">
              {!records.length && (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500" style={poppinsFont}>
                  No questions or assignments have been sent to this student yet.
                  {canManage ? ' Use Send questions / assignment — the title does not need to be finalized.' : ''}
                </p>
              )}
              {records.map(record => (
                <StudentResearchCard key={record.assignment.id} record={record} role={role} refresh={refresh} now={now} />
              ))}
            </div>
          )}

          {view === 'presentations' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500" style={poppinsFont}>
                {submission
                  ? `Linked to the title stage: ${titleStage(String(submission.status ?? ''))}.`
                  : 'This student has no submitted title yet, so there is no title-linked presentation record to show.'}
              </p>
              {submissionId && <ResearchProgress submissionId={submissionId} />}
            </div>
          )}
        </>
      )}

      {compose && loaded && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1E293B]" style={authorFont}>New request for {project.name}</h3>
            <button type="button" className="text-xs text-slate-500 underline" onClick={() => setCompose(false)}>Close form</button>
          </div>
          <StudentResearchComposer
            key={project.student_id}
            students={loaded.students.filter(s => s.id === project.student_id)}
            initialTarget={project.student_id}
            onSaved={async () => { setCompose(false); await refresh(); }}
          />
        </div>
      )}

      <p className="text-[11px] text-slate-400" style={poppinsFont}>
        Requests sit in the student’s private research record. Title decisions remain with the Guide, HOD and PG Director.
      </p>
    </section>
  );
}