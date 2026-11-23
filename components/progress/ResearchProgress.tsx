'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ResearchSnapshot } from '@/lib/progress/types';
import RequestComposer from './RequestComposer';
import RequestHistory from './RequestHistory';
import WrittenUpdate from './WrittenUpdate';
import { requestLabels, requestState, type RequestState } from '@/lib/progress/request-state';
import SchemaDataViewer from '@/components/forms/SchemaDataViewer';

async function action(body: Record<string, unknown>) {
  const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Action failed.');
  return data;
}
const button = 'rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40';
export default function ResearchProgress({ submissionId, titlesOnly = false }: { submissionId?: string; titlesOnly?: boolean }) {
  const [records, setRecords] = useState<ResearchSnapshot[]>([]);
  const [canManage,setCanManage] = useState(false);
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState<RequestState | 'all'>('all');
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer=setInterval(() => setNow(Date.now()),30000); return () => clearInterval(timer); },[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const load = useCallback(async (): Promise<{records:ResearchSnapshot[];canManage:boolean}> => {
    const response = await fetch('/api/research', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }, []);
  async function refresh() {
    try { const data=await load();setRecords(data.records);setCanManage(data.canManage); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load progress.'); }
  }
  useEffect(() => {
    let active = true;
    load().then(data => { if (active) {setRecords(data.records);setCanManage(data.canManage);} })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load progress.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed. Please retry.'); await refresh(); }
    finally { locked.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">Loading research progress…</p>;
  const scoped = records.filter(r => !submissionId || r.submission.id === submissionId);
  const visible = scoped.filter(r => `${r.submission.title} ${r.studentName || ''} ${r.universityId || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter==='all' || r.definitions.some(d=>requestState(r,d,now)===filter || (filter==='pending' && requestState(r,d,now)==='revision_requested'))));
  const counts = scoped.flatMap(r=>r.definitions.map(d=>requestState(r,d,now)));

  return <section className="space-y-5">
    <h2 className="text-xl font-bold">{titlesOnly ? 'Title Browser' : 'Title-linked presentations and requests'}</h2>
    {!titlesOnly && <p className="text-sm text-slate-600">Use this section for requests linked to a submitted title, including PowerPoint presentations. General research questions can be sent before the title is finalized in the student tracker above.</p>}
    {canManage && !titlesOnly && <RequestComposer records={records} onSaved={refresh} />}
    {!titlesOnly && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['pending','overdue','submitted','accepted'] as const).map(status=><button key={status} onClick={()=>setFilter(filter===status?'all':status)} className={`rounded-xl border bg-white p-4 text-left ${filter===status?'ring-2 ring-blue-600':''}`}><span className="block text-2xl font-bold">{counts.filter(s=>s===status || (status==='pending' && s==='revision_requested')).length}</span><span className="text-xs text-slate-600">{requestLabels[status]}</span></button>)}</div>}
    {!submissionId && <label className="block text-sm">Find a student or title<input value={query} onChange={e=>setQuery(e.target.value)} className="mt-1 block w-full rounded-lg border p-3" placeholder="Search student name, university ID, or research title" /></label>}
    {filter!=='all' && <button className="text-sm text-blue-700 underline" onClick={()=>setFilter('all')}>Show all requests</button>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error} <button onClick={() => { setError(''); void refresh(); }} className="underline">Reload</button></div>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-4">{message}</p>}
    {busy && <p role="status">Processing… Please keep this page open.</p>}
    {!visible.length && !error && <p>No matching submissions or requests are available within your scope.</p>}
    {visible.map(record => <article key={record.submission.id} className="space-y-4 rounded-xl border bg-white p-5">
      {!submissionId && <h3 className="font-bold">{record.submission.title} <span className="text-sm font-normal">({record.submission.status.replaceAll('_',' ')})</span></h3>}
      {!record.isOwner && <p className="text-sm font-medium text-slate-600">{record.studentName || 'Student'} {record.universityId && `· ${record.universityId}`}</p>}
      {!record.isOwner && <details><summary className="cursor-pointer text-blue-700">View submitted title fields</summary><p className="my-3">{record.submission.description}</p><SchemaDataViewer department={String(record.submission.criteria_details.department || '')} data={record.submission.criteria_details} /></details>}
      {!titlesOnly && !record.definitions.length && <p className="text-slate-500">No update requests yet. The PG Director can publish a request at any stage of title review.</p>}
      {!titlesOnly && record.definitions.filter(d=>filter==='all' || requestState(record,d,now)===filter || (filter==='pending' && requestState(record,d,now)==='revision_requested')).map(definition => {
        if (definition.response_kind==='text') return <WrittenUpdate key={`${definition.id}:${record.milestones.find(m=>m.definition_id===definition.id)?.state}`} record={record} definition={definition} busy={busy} run={run} action={action} canManage={canManage} now={now} />;
        const milestone = record.milestones.find(m => m.definition_id === definition.id);
        const events = record.events.filter(e => e.milestone_id === milestone?.id);
        const files = record.files.filter(f => f.milestone_id === milestone?.id);
        const latest = files.find(f => f.state === 'submitted');
        const state = milestone?.state || 'pending';
        const lockedReason = ['guide_rejected','hod_rejected'].includes(record.submission.status) ? 'Title was rejected.'
          : definition.unlock_after && !record.milestones.some(m => m.definition_id === definition.unlock_after && m.state === 'accepted') ? 'Waiting for the previous milestone.'
          : definition.deadline && Date.parse(definition.deadline) < now && !definition.allow_late ? 'Deadline has passed.'
          : !['pending','revision_requested'].includes(state) ? 'Uploads are locked until a reviewer requests revision.'
          : state === 'revision_requested' && !definition.allow_revision ? 'Revisions are disabled.' : '';
        const context = { submissionId: record.submission.id, definitionId: definition.id };
        const canReview = !record.isOwner && definition.reviewer_roles.includes(record.reviewerRole);
        return <div key={definition.id} className="space-y-3 rounded-xl border p-4">
          <h4 className="font-semibold">{definition.name} — {requestLabels[requestState(record,definition,now)]}</h4>
          {definition.instructions && <p className="whitespace-pre-wrap text-sm text-slate-600">{definition.instructions}</p>}
          {definition.test_only && <p className="text-amber-700">Test milestone; university workflow pending confirmation.</p>}
          <p className="text-sm">Deadline: {definition.deadline ? new Date(definition.deadline).toLocaleString() : 'Not configured'} · .pptx up to {Math.floor(definition.max_bytes / 1048576)} MB</p>
          {record.isOwner && <>
            {lockedReason && <p className="text-sm text-slate-600">{lockedReason}</p>}
            <label className="block text-sm font-medium">Upload or replace draft
              <input type="file" accept=".pptx" disabled={busy || !!lockedReason} className="mt-2 block w-full" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (!file) return;
                void run(async () => {
                  if (!/\.pptx$/i.test(file.name) || !file.size || file.size > definition.max_bytes) throw new Error('Choose a .pptx file within the displayed size limit.');
                  const upload = await action({ ...context, action: 'reserve', filename: file.name, size: file.size });
                  const { error } = await createClient().storage.from('research-presentations').uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.mime });
                  if (error) throw new Error('Upload was interrupted or the link expired. Choose the file again. No submission was recorded.');
                  await action({ ...context, action: 'confirm', fileId: upload.fileId });
                  setMessage(`${file.name} uploaded and verified as a draft. Click Submit to send it for review.`);
                });
              }} />
            </label>
          </>}
          {files.length === 0 && <p className="text-sm text-slate-500">No files uploaded.</p>}
          {files.map((file, index) => <div key={file.id} className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
            <span>{file.filename} · {file.state} · Uploaded {new Date(file.created_at).toLocaleString()}{file.submitted_at ? ` · Submitted ${new Date(file.submitted_at).toLocaleString()}` : ''}</span>
            {file.state === 'uploading' ? <span className="text-amber-700">Not verified. Upload again if interrupted.</span> : <button disabled={busy} className="text-blue-700 underline" onClick={() => void run(async () => {
              const data = await action({ ...context, action: 'download', fileId: file.id });
              const link = document.createElement('a'); link.href = data.url; link.rel = 'noopener'; link.click();
              setMessage('Download link created; it expires in 60 seconds. Click Download again if it expires.');
            })}>Download</button>}
            {record.isOwner && index === 0 && file.state === 'draft' && !lockedReason && <button className={button} disabled={busy} onClick={() => void run(async () => { await action({ ...context, action: 'submit', fileId: file.id }); setMessage('PowerPoint submitted for review.'); })}>Submit this draft</button>}
          </div>)}
          {canReview && state === 'submitted' && latest && <div className="space-y-2">
            <label className="block">Reviewer remarks<textarea className="block w-full rounded border p-2" maxLength={4000} value={remarks[definition.id] || ''} onChange={e => setRemarks({ ...remarks, [definition.id]: e.target.value })} /></label>
            {(['accepted','revision_requested'] as const).filter(a => a !== 'revision_requested' || definition.allow_revision).map(a => <button key={a} disabled={busy} className={`${button} mr-2`} onClick={() => void run(async () => { await action({ ...context, action: a, fileId: latest.id, remarks: remarks[definition.id] || '' }); setMessage('Review saved.'); })}>{a === 'accepted' ? 'Accept' : 'Request revision'}</button>)}
          </div>}
          <RequestHistory definition={definition} events={(record.requestEvents || []).filter(e=>e.definition_id===definition.id)} canManage={canManage} busy={busy} run={run} />
          <details><summary className="cursor-pointer">Audit history ({events.length})</summary>{!events.length && <p>No recorded milestone events yet.</p>}{events.map(e => <p key={e.id} className="my-2 text-sm">{new Date(e.created_at).toLocaleString()} · {e.action.replaceAll('_',' ')} · Actor {e.actor_id}{e.remarks ? ` · ${e.remarks}` : ''}</p>)}</details>
        </div>;
      })}
    </article>)}
  </section>;
}
