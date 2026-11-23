'use client';
import { useState } from 'react';
import type { MilestoneDefinition, ResearchSnapshot } from '@/lib/progress/types';
import RequestHistory from './RequestHistory';
import { requestLabels, requestState } from '@/lib/progress/request-state';
const button='rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40';
export default function WrittenUpdate({record,definition,busy,run,action,canManage,now}:{
 now:number;record:ResearchSnapshot;definition:MilestoneDefinition;busy:boolean;canManage:boolean;
 run:(work:()=>Promise<void>)=>Promise<void>;action:(body:Record<string,unknown>)=>Promise<{updateId?:string}>;
}) {
 const milestone=record.milestones.find(m=>m.definition_id===definition.id);
 const updates=(record.updates || []).filter(u=>u.milestone_id===milestone?.id);
 const draft=updates.find(u=>u.state==='draft');
 const submitted=updates.filter(u=>u.state==='submitted');
 const events=record.events.filter(e=>e.milestone_id===milestone?.id);
 const requestEvents=(record.requestEvents || []).filter(e=>e.definition_id===definition.id);
 const [answers,setAnswers]=useState<Record<string,string>>(draft?.answers || submitted[0]?.answers || {});
 const [remarks,setRemarks]=useState('');
 const [notice,setNotice]=useState('');
 const [dirty,setDirty]=useState(false);
 const current=requestState(record,definition,now);
 const state=milestone?.state || 'pending';
 const canEdit=record.isOwner && (state==='pending' || (state==='revision_requested' && definition.allow_revision)) && (current!=='overdue' || definition.allow_late) && !['guide_rejected','hod_rejected'].includes(record.submission.status);
 const canReview=!record.isOwner && definition.reviewer_roles.includes(record.reviewerRole) && state==='submitted';
 const context={submissionId:record.submission.id,definitionId:definition.id};
 return <section className="space-y-4 rounded-xl border p-5">
   <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{definition.name}</h4><span className={`rounded-full px-3 py-1 text-xs font-medium ${current==='overdue'?'bg-red-100 text-red-800':current==='accepted'?'bg-green-100 text-green-800':'bg-blue-50 text-blue-800'}`}>{requestLabels[current]}</span></div>
   {definition.test_only && <p className="text-sm text-amber-700">Staging test request</p>}
   <p className="text-sm font-medium">Due {definition.deadline ? new Date(definition.deadline).toLocaleString() : 'date not set'}</p>
   {definition.instructions && <p className="whitespace-pre-wrap text-sm text-slate-600">{definition.instructions}</p>}
   {current==='overdue' && record.isOwner && !definition.allow_late && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">The deadline has passed. Ask your PG Director for an extension; your saved draft is still available.</p>}
   {state==='revision_requested' && <p className="rounded-lg bg-amber-50 p-3 text-sm">Revision requested: {events.filter(e=>e.action==='revision_requested').at(-1)?.remarks}</p>}
   {record.isOwner && state!=='accepted' && state!=='submitted' && <div className="space-y-3">
     {definition.questions.map((question,index)=><label key={index} className="block text-sm font-medium">{index+1}. {question}<textarea disabled={!canEdit || busy} maxLength={10000} rows={4} value={answers[String(index)] || ''} className="mt-1 block w-full rounded-lg border p-3 font-normal disabled:bg-slate-50" onChange={e=>{setAnswers({...answers,[index]:e.target.value});setDirty(true);setNotice('');}} /></label>)}
     <p className="text-xs text-slate-500">{dirty?'Unsaved changes. Save your draft before leaving.':draft?`Draft saved ${new Date(draft.updated_at).toLocaleString()}`:'Your draft is private until you submit it.'}</p>
     {canEdit && <div className="flex flex-wrap gap-3">
       <button disabled={busy} className={button} onClick={()=>void run(async()=>{await action({...context,action:'save',answers});setDirty(false);setNotice('Draft saved. You can return to it later.');})}>Save draft</button>
       <button disabled={busy || definition.questions.some((_,i)=>!answers[String(i)]?.trim())} className={button} onClick={()=>void run(async()=>{
         const saved=await action({...context,action:'save',answers});
         await action({...context,action:'submit',updateId:saved.updateId});
         setDirty(false);setNotice('Update submitted to the PG Director.');
       })}>Submit update</button>
     </div>}
   </div>}
   {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
   {state==='submitted' && record.isOwner && <p className="text-sm text-blue-800">Your update is with the PG Director. No further action is needed unless a revision is requested.</p>}
   {submitted.map((update,index)=><details key={update.id} open={index===0} className="rounded-lg bg-slate-50 p-4">
     <summary className="cursor-pointer text-sm font-semibold">Version {update.version} · Submitted {new Date(update.submitted_at!).toLocaleString()}{update.deadline_at_submission && Date.parse(update.submitted_at!)>Date.parse(update.deadline_at_submission)?' · Late':' · On time'}</summary>
     <dl className="mt-3 space-y-3">{definition.questions.map((question,i)=><div key={i}><dt className="text-sm font-medium">{question}</dt><dd className="whitespace-pre-wrap text-sm text-slate-600">{update.answers[String(i)]}</dd></div>)}</dl>
     {events.filter(e=>e.update_id===update.id && e.action!=='submit').map(e=><p key={e.id} className="mt-3 border-t pt-2 text-sm">{e.action==='accepted'?'Accepted':'Revision requested'} · {new Date(e.created_at).toLocaleString()}{e.remarks && ` — ${e.remarks}`}</p>)}
   </details>)}
   {canReview && submitted[0] && <div className="space-y-2"><label className="block text-sm">Feedback to the student<textarea className="mt-1 block w-full rounded-lg border p-2" maxLength={4000} value={remarks} onChange={e=>setRemarks(e.target.value)} /></label><div className="flex gap-2">{(['accepted','revision_requested'] as const).map(review=><button key={review} className={button} disabled={busy || (review==='revision_requested' && (!remarks.trim() || !definition.allow_revision))} onClick={()=>void run(async()=>{await action({...context,action:review,updateId:submitted[0].id,remarks});setRemarks('');})}>{review==='accepted'?'Accept update':'Request revision'}</button>)}</div></div>}
   <RequestHistory definition={definition} events={requestEvents} canManage={canManage} busy={busy} run={run} />
 </section>;
}
