'use client';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@/lib/rpms/model';
import TaskWorkspace from '@/components/rpms/TaskWorkspace';

// Keep already-issued work accessible without loading the workflow builder.
export default function EarlierAssignments() {
  const [data, setData] = useState<Snapshot|null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  async function load() {
    const response = await fetch('/api/rpms', {cache:'no-store', signal:AbortSignal.timeout(20000)});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load earlier assignments.');
    return body as Snapshot;
  }
  async function refresh() { setData(await load()); setError(''); }
  useEffect(()=>{let active=true;load().then(body=>{if(active)setData(body);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  const tasks = data?.tasks.filter(t=>t.active&&!['title','final_review'].includes(t.kind)) || [];
  const task=tasks.find(t=>t.id===selected);
  const project=data?.projects.find(p=>p.id===task?.project_id);
  return <section className="space-y-4">
    {error&&<p role="alert">{error} <button className="underline" onClick={()=>void refresh().catch(e=>setError(e.message))}>Retry</button></p>}
    {!data&&!error&&<p role="status">Loading earlier assignments…</p>}
    {data&&!tasks.length&&<p>No earlier assignments.</p>}
    {tasks.map(t=><button key={t.id} className="block w-full rounded-xl border bg-white p-4 text-left" onClick={()=>setSelected(t.id)}><strong>{t.name}</strong><span className="mt-1 block text-sm text-slate-600">{data?.role!=='student'?`${data?.projects.find(p=>p.id===t.project_id)?.name || 'Student'} · `:''}{t.state.replaceAll('_',' ')} · Due {new Date(t.deadline).toLocaleDateString()}</span></button>)}
    {task&&project&&data&&<TaskWorkspace key={`${task.id}:${task.state}`} task={task} project={project} role={data.role} canManage={data.canManage} refresh={refresh}/>}
  </section>;
}
