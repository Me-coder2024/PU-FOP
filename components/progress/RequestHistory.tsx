'use client';
import { useState } from 'react';
import type { MilestoneDefinition, ResearchRequestEvent } from '@/lib/progress/types';
import { requestAction } from './RequestComposer';
export default function RequestHistory({ definition, events, canManage, busy, run }: {
 definition:MilestoneDefinition;events:ResearchRequestEvent[];canManage:boolean;busy:boolean;
 run:(work:()=>Promise<void>)=>Promise<void>;
}) {
 const [deadline,setDeadline]=useState('');
 const [reason,setReason]=useState('');
 return <>
  {canManage && definition.target_submission_id && <details><summary className="cursor-pointer text-sm text-blue-700">Extend this deadline</summary>
   <div className="mt-2 space-y-3"><label className="block text-sm">New deadline ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} className="ml-2 rounded border p-2" /></label>
    <label className="block text-sm">Reason<input maxLength={4000} value={reason} onChange={e=>setReason(e.target.value)} className="ml-2 rounded border p-2" /></label>
    <button className="rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={busy || !deadline || !reason.trim()} onClick={()=>void run(async()=>{
     await requestAction({action:'extend',definitionId:definition.id,deadline:new Date(deadline).toISOString(),remarks:reason});setDeadline('');setReason('');
    })}>Extend and notify student</button>
   </div>
  </details>}
  {!!events.length && <details><summary className="cursor-pointer text-sm">Request history</summary>{events.map(e=><p key={e.id} className="mt-2 text-xs text-slate-600">{new Date(e.created_at).toLocaleString()} · {e.action.replaceAll('_',' ')}{e.new_deadline ? ` · Deadline ${new Date(e.new_deadline).toLocaleString()}`:''}{e.remarks ? ` · ${e.remarks}`:''}</p>)}</details>}
 </>;
}
