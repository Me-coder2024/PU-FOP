'use client';
import { useRef, useState } from 'react';
import type { ResearchSnapshot } from '@/lib/progress/types';
export async function requestAction(body: Record<string, unknown>) {
  const response = await fetch('/api/research/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save request.');
  return data;
}
const input = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
export default function RequestComposer({ records, onSaved }: { records: ResearchSnapshot[]; onSaved: () => Promise<void> }) {
  const eligible = records.filter(r => r.submission.status==='finalized');
  const [submissionId,setSubmissionId] = useState('');
  const [name,setName] = useState('');
  const [instructions,setInstructions] = useState('');
  const [questions,setQuestions] = useState('What work have you completed since your last update?\nWhat results or findings do you have?\nWhat difficulties do you need help with?\nWhat will you do next?');
  const [kind,setKind] = useState<'text' | 'pptx'>('text');
  const [deadline,setDeadline] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const locked = useRef(false);
  return <details className="rounded-xl border border-blue-200 bg-blue-50 p-5">
    <summary className="cursor-pointer text-lg font-semibold text-blue-900">PG Director: request a research update</summary>
    <p className="my-3 text-sm text-slate-600">Choose a student, tell them what to report, and set a deadline. Their answers and every submitted version stay with this title. The title does not need to be finalized.</p>
    {!eligible.length ? <p>No students with a submitted title are available in your institute yet. Use the student tracker to send early questions without a title.</p> : <form className="grid gap-4 sm:grid-cols-2" onSubmit={async event => {
      event.preventDefault(); if (locked.current) return;
      locked.current=true; setBusy(true);setError('');setSuccess('');
      try {
        const body={action:'publish',submissionId,name,instructions,questions:kind==='text'?questions.split('\n').map(q=>q.trim()).filter(Boolean):[],kind,deadline:new Date(deadline).toISOString()};
        const fingerprint=JSON.stringify(body);
        if (pending.current?.fingerprint!==fingerprint) pending.current={fingerprint,key:crypto.randomUUID()};
        await requestAction({...body,requestKey:pending.current.key});
        pending.current=null;setName('');setInstructions('');setDeadline('');
        setSuccess('Request published. The student can now see it in their Progress Tracker.');
        await onSaved();
      } catch(e) { setError(e instanceof Error?e.message:'Unable to publish.'); }
      finally { locked.current=false;setBusy(false); }
    }}>
      <label className="sm:col-span-2">Student and submitted research title<select required className={input} value={submissionId} onChange={e=>setSubmissionId(e.target.value)}><option value="">Select a student’s title</option>{eligible.map(r=><option key={r.submission.id} value={r.submission.id}>{r.studentName || 'Student'} {r.universityId ? `(${r.universityId})` : ''} — {r.submission.title}</option>)}</select></label>
      <label>Request name<input required maxLength={160} placeholder="For example: November research update" className={input} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>Deadline ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" className={input} value={deadline} onChange={e=>setDeadline(e.target.value)} /></label>
      <label>Student response<select className={input} value={kind} onChange={e=>setKind(e.target.value as 'text'|'pptx')}><option value="text">Written answers</option><option value="pptx">PowerPoint presentation</option></select></label>
      <label className="sm:col-span-2">Instructions<textarea maxLength={4000} className={input} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Explain the evidence or detail you expect." /></label>
      {kind==='text' && <label className="sm:col-span-2">Questions — one per line (up to 10)<textarea required rows={5} className={input} value={questions} onChange={e=>setQuestions(e.target.value)} /><span className="text-xs text-slate-500">These are suggested questions; edit them before publishing.</span></label>}
      <p className="text-sm text-slate-600 sm:col-span-2">Responses close at the deadline. You can extend it with a recorded reason. Submitted answers cannot be changed unless you request a revision.</p>
      {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      {success && <p role="status" className="text-green-800 sm:col-span-2">{success}</p>}
      <button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy?'Publishing…':'Publish request'}</button>
    </form>}
  </details>;
}
