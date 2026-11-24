'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { studentResearchStatus, type StudentResearchRecord, type StudentResearchSnapshot } from '@/lib/progress/student-types';
const input='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const labels:Record<string,string>={all:'All assignments',pending:'To do',overdue:'Overdue',submitted:'Awaiting review',revision_requested:'Changes requested',accepted:'Completed'};
const button='rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50';
const stages: Record<string,{name:string;questions:string[]}>={
 planning:{name:'Research planning',questions:['Which pharmacy research area interests you and why?','What problem or research question would you like to investigate?','What support do you need from your guide?','What will you complete before the next update?']},
 literature:{name:'Literature review',questions:['Which papers have you reviewed? Include references or links.','What research gap have you identified?','How does the evidence inform your proposed study?','What will you read or complete next?']},
 methodology:{name:'Protocol and methodology',questions:['What are your objectives and proposed study methods?','What ethics or institutional approvals are needed, and what is their current status?','What resources, instruments or study materials do you need?','What decisions require your guide’s feedback?']},
 data_collection:{name:'Experimental work / data collection',questions:['What experiments or data collection have you completed?','What results and quality checks can you report? Avoid patient-identifying information.','What problems or deviations need your guide’s help?','What is your next activity and expected completion date?']},
 analysis:{name:'Analysis and interpretation',questions:['What analyses have you completed?','What do the findings suggest about your research question?','What limitations or unresolved issues remain?','What will you analyse next?']},
 writing:{name:'Dissertation and presentation',questions:['Which dissertation sections have you completed?','What feedback have you addressed?','What remains before submission or presentation?','What support do you need to finish?']},
 other:{name:'Other update',questions:['What have you completed?','What difficulties do you need help with?','What will you do next?']},
};
async function post(body:Record<string,unknown>):Promise<{id:string}> {
 const response=await fetch('/api/research/students',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to save.');return data;
}
export function StudentResearchComposer({students,onSaved,initialTarget='',facultyAccess=false}:{students:StudentResearchSnapshot['students'];onSaved:()=>Promise<void>;initialTarget?:string;facultyAccess?:boolean}) {
 const [target,setTarget]=useState(initialTarget);const stage='other';
 const [name,setName]=useState('');const [instructions,setInstructions]=useState('');
 const [questions,setQuestions]=useState('Submit your work here, or paste a link to your document.');const [deadline,setDeadline]=useState('');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 const pending=useRef<{fingerprint:string;key:string}|null>(null);const lock=useRef(false);
 return <details open className="rounded-xl border border-blue-200 bg-blue-50 p-4"><summary className="cursor-pointer font-semibold">Create assignment</summary>
 <p className="my-3 text-sm">Choose one student or all currently registered students {facultyAccess?'across all institutes':'in your institute'}. No research title or title approval is required. {!facultyAccess&&'Students need an institute on their profile to appear here.'}</p>
 {!students.length?<p>No eligible students yet.</p>:<form className="grid gap-4 sm:grid-cols-2" onSubmit={async e=>{
  e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try {const body={action:'publish',studentIds:target==='all'?students.map(s=>s.id):[target],stage,name,instructions,questions:questions.split('\n').map(q=>q.trim()).filter(Boolean),deadline:new Date(deadline).toISOString()};
   const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};
   await post({...body,requestKey:pending.current.key});pending.current=null;setName('');setDeadline('');setMessage(`Sent to ${body.studentIds.length} student(s).`);await onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Unable to publish.');}finally{lock.current=false;setBusy(false);}
 }}>
 <label>Recipients<select required className={input} value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose recipients</option><option value="all">All {students.length} currently registered students</option>{students.map(s=><option key={s.id} value={s.id}>{s.name || 'Student'} {s.universityId || s.id}</option>)}</select></label>

 <label>Assignment title<input required maxLength={160} className={input} value={name} onChange={e=>setName(e.target.value)} placeholder="For example: Literature review" /></label>
 <label>Deadline ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input required type="datetime-local" className={input} value={deadline} onChange={e=>setDeadline(e.target.value)} /></label>
 <label className="sm:col-span-2">Instructions<textarea maxLength={4000} className={input} value={instructions} onChange={e=>setInstructions(e.target.value)} /></label>
 <label className="sm:col-span-2">What should students submit? — one item per line, up to 10<textarea required rows={6} className={input} value={questions} onChange={e=>setQuestions(e.target.value)} /><span className="text-xs text-slate-600">Students can write their response or paste a document link. Make sure linked documents are shared with the reviewer.</span></label>
 <p className="text-sm sm:col-span-2">Each student gets a separate private response and review history. Students registering later are not included in this request.</p>
 <button disabled={busy} className={button}>{busy?'Sending…':`Send assignment${target==='all'?` to ${students.length} students`:''}`}</button>
 </form>}{error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}{message&&<p role="status" className="mt-2 text-green-800">{message}</p>}</details>;
}
export function StudentResearchCard({record,role,refresh,now}:{record:StudentResearchRecord;role:string|null;refresh:()=>Promise<void>;now:number}) {
 const {request,assignment,responses}=record;const draft=responses.find(r=>!r.submitted_at);const latest=responses.find(r=>r.submitted_at);
 const [answers,setAnswers]=useState<Record<string,string>>(draft?.answers || latest?.answers || {});
 const [remarks,setRemarks]=useState('');const [deadline,setDeadline]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
 const status=studentResearchStatus(record,now);const editable=record.isOwner&&['pending','revision_requested'].includes(assignment.state)&&status!=='overdue';
 const manage=['pg_director','super_admin'].includes(role || '');const review=!record.isOwner&&['guide','pg_director','super_admin'].includes(role || '');
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await work();await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{lock.current=false;setBusy(false);}}
 const context={assignmentId:assignment.id};
 return <article className="space-y-3 rounded-xl border bg-white p-5">
 <h3 className="font-bold">{request.name} — {labels[status] || status}</h3>
 {!record.isOwner&&<p>{record.studentName || 'Student'} {record.universityId&&`· ${record.universityId}`}</p>}
 <p className="text-sm text-slate-600">Due {new Date(request.deadline).toLocaleString()}</p>
 <p className="whitespace-pre-wrap">{request.instructions}</p>
 {status==='overdue'&&<p className="text-amber-800">An update is overdue. The PG Director can extend the deadline.</p>}
 {record.isOwner&&<div className="space-y-3">{request.questions.map((q,i)=><label key={i} className="block">{i+1}. {q}<textarea rows={3} maxLength={10000} className={input} disabled={!editable||busy} value={answers[i]||''} onChange={e=>setAnswers({...answers,[i]:e.target.value})}/></label>)}
 {editable&&<div className="flex gap-3"><button disabled={busy} className={button} onClick={()=>void run(async()=>{await post({...context,action:'save',answers});setMessage('Draft saved. Only you can see it.');})}>Save private draft</button><button disabled={busy} className={button} onClick={()=>void run(async()=>{const saved=await post({...context,action:'save',answers});await post({...context,action:'submit',responseId:saved.id});setMessage('Submitted for review.');})}>Submit assignment</button></div>}
 </div>}
 {!record.isOwner&&!latest&&<p className="text-slate-500">Awaiting the student’s submission. Private drafts are not shown.</p>}
 {latest&&<details open={!record.isOwner}><summary className="cursor-pointer">Submitted responses ({responses.filter(r=>r.submitted_at).length} versions)</summary>{responses.filter(r=>r.submitted_at).map(r=><div key={r.id} className="my-3 rounded-lg bg-slate-50 p-3"><p className="font-medium">Version {r.version} · {new Date(r.submitted_at!).toLocaleString()}</p>{request.questions.map((q,i)=><div key={i} className="mt-2"><p className="text-sm font-semibold">{q}</p><p className="whitespace-pre-wrap">{r.answers[i]}</p></div>)}</div>)}</details>}
 {review&&assignment.state==='submitted'&&latest&&<div className="space-y-2"><label>Feedback<textarea maxLength={4000} className={input} value={remarks} onChange={e=>setRemarks(e.target.value)}/></label>{(['accepted','revision_requested'] as const).map(action=><button key={action} disabled={busy} className={`${button} mr-2`} onClick={()=>void run(async()=>{await post({...context,action,responseId:latest.id,remarks});})}>{action==='accepted'?'Mark complete':'Request revision'}</button>)}</div>}
 {manage&&<details><summary className="cursor-pointer text-blue-700">Extend deadline</summary><p className="text-sm">This changes the deadline for every recipient of this request.</p><label>New deadline<input type="datetime-local" className={input} value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Reason<textarea maxLength={4000} className={input} value={remarks} onChange={e=>setRemarks(e.target.value)}/></label><button disabled={busy||!deadline||!remarks.trim()} className={`${button} mt-2`} onClick={()=>void run(async()=>{await post({...context,action:'extend',deadline:new Date(deadline).toISOString(),remarks});})}>Extend for all recipients</button></details>}
 <details><summary className="cursor-pointer">Progress and feedback history ({record.history.length})</summary>{record.history.map(e=><p key={e.id} className="my-2 text-sm">{new Date(e.created_at).toLocaleString()} · {e.action.replaceAll('_',' ')}{e.remarks&&` · ${e.remarks}`}{e.new_deadline&&` · Deadline: ${new Date(e.new_deadline).toLocaleString()}`}</p>)}</details>
 {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status" className="text-green-800">{message}</p>}
 </article>;
}
export function StudentResearchRoster({students,records,now,query,onSelect,onRequest}:{students:StudentResearchSnapshot['students'];records:StudentResearchRecord[];now:number;query:string;onSelect:(id:string)=>void;onRequest?:(id:string)=>void}) {
 const visible=students.filter(s=>`${s.name || ''} ${s.universityId || ''}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="overflow-x-auto rounded-xl border bg-white">
 <table className="w-full text-left text-sm"><caption className="border-b p-4 text-left font-semibold">Student roster · {students.length} registered students</caption>
 <thead className="bg-slate-50 text-slate-600"><tr>{['Student','Research progress','Latest submitted update','Next deadline','Actions'].map(h=><th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr></thead>
 <tbody>{visible.map(student=>{
  const assigned=records.filter(r=>r.assignment.student_id===student.id);
  const overdue=assigned.filter(r=>studentResearchStatus(r,now)==='overdue').length;
  const submitted=assigned.filter(r=>r.assignment.state==='submitted').length;
  const accepted=assigned.filter(r=>r.assignment.state==='accepted').length;
  const latest=assigned.flatMap(r=>r.responses).filter(r=>r.submitted_at).map(r=>r.submitted_at!).sort().at(-1);
  const next=assigned.filter(r=>['pending','revision_requested'].includes(r.assignment.state)).map(r=>r.request.deadline).sort()[0];
  return <tr key={student.id} className="border-t align-top"><td className="px-4 py-4"><button className="font-semibold text-blue-800 underline" onClick={()=>onSelect(student.id)}>{student.name || 'Student'}</button><p className="mt-1 text-xs text-slate-500">{student.universityId || 'University ID not assigned'}</p></td>
  <td className="px-4 py-4">{!assigned.length?<span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Not started · no requests</span>:<><p>{accepted} of {assigned.length} assignments completed</p><p className={overdue?'mt-1 text-amber-800':'mt-1 text-slate-500'}>{overdue?`${overdue} overdue · `:''}{submitted} awaiting review</p></>}</td>
  <td className="px-4 py-4">{latest?new Date(latest).toLocaleString():'No submitted update'}</td><td className="px-4 py-4">{next?new Date(next).toLocaleString():'No pending deadline'}</td>
  <td className="space-y-2 px-4 py-4">{onRequest&&<button className={button} onClick={()=>onRequest(student.id)}>Assign work</button>}<button className="block text-blue-700 underline" onClick={()=>onSelect(student.id)}>View progress</button></td></tr>;
 })}</tbody></table>
 {!students.length&&<p className="p-5 text-slate-600">No student profiles are assigned to your institute. Check the institute on your PG Director profile and on student profiles. Students do not need a research title to appear.</p>}
 {!!students.length&&!visible.length&&<p className="p-5 text-slate-600">No students match this search.</p>}
 </div>;
}
export default function StudentResearchTracker(){
 const [data,setData]=useState<StudentResearchSnapshot|null>(null);const [error,setError]=useState('');const [query,setQuery]=useState('');const [filter,setFilter]=useState('all');const [now,setNow]=useState(()=>Date.now());
 const [view,setView]=useState<'students'|'requests'>('students');const [selected,setSelected]=useState<string|null>(null);const [compose,setCompose]=useState<string|null>(null);
 const load=useCallback(async()=>{const r=await fetch('/api/research/students',{cache:'no-store',signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw new Error(body.error || 'Unable to load.');return body as StudentResearchSnapshot;},[]);
 const refresh=async()=>{const body=await load();setData(body);setError('');};
 useEffect(()=>{let active=true;load().then(body=>{if(active)setData(body);}).catch(e=>{if(active)setError(e.message);});const timer=setInterval(()=>setNow(Date.now()),30000);return()=>{active=false;clearInterval(timer);};},[load]);
 const records=data?.records || [];const counts=records.map(r=>studentResearchStatus(r,now));
 const manage=['pg_director','super_admin'].includes(data?.role || '');
 const faculty=data?.role!=='student';
 const showRoster=manage||data?.role==='dean';
 const selectedStudent=data?.students.find(s=>s.id===selected);
 const selectedRecords=selected?records.filter(r=>r.assignment.student_id===selected):records;
 const visible=selectedRecords.filter(r=>(filter==='all'||studentResearchStatus(r,now)===filter)&&(selected||`${r.studentName} ${r.universityId} ${r.request.name} ${stages[r.request.stage]?.name}`.toLowerCase().includes(query.toLowerCase())));
 function selectStudent(id:string){setSelected(id);setView('requests');setFilter('all');setQuery('');setCompose(null);}
 function requestStudent(id:string){setCompose(id);}
 return <section className="space-y-5">
 <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-blue-700">{showRoster?`${data?.role==='dean'?'Dean':'PG Director'} · ${data?.facultyAccess?'All institutes':'Research management'}`:'Research progress'}</p><h2 className="mt-1 text-2xl font-bold">{faculty?'Student assignments':'My assignments'}</h2><p className="mt-2 text-sm text-slate-600">{faculty?'Review assignments and see student progress.':'Open an assignment, submit your work, and check feedback.'}</p></div>
 {data&&<div className="flex gap-3"><button className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh</button>{manage&&<button disabled={!data.students.length} className={button} onClick={()=>requestStudent('all')}>Create assignment</button>}</div>}</div>
 {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error} <button className="underline" onClick={()=>void refresh().catch(e=>setError(e.message))}>Reload</button></p>}
 {!data&&!error&&<p role="status">Loading students and research requests…</p>}
 {data&&<>
 {!faculty&&<div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Assignment progress</h3><p className="mt-2">{counts.filter(s=>s==='accepted').length} of {records.length} completed</p><progress aria-label="Completed assignments" className="mt-2 w-full" max={records.length||1} value={counts.filter(s=>s==='accepted').length}/><p className="mt-1 text-sm text-slate-500">Work counts as complete when accepted by your reviewer.</p></div>}
 {data.needsInstitute&&<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-semibold text-amber-900">Your PG Director account needs an institute assignment</h3><p className="mt-1 text-sm text-amber-900">Students cannot be listed until an administrator assigns your account to the correct pharmacy institute. This is an account setup issue, not an empty student register.</p></div>}
 {faculty&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{(showRoster?[['Registered students',data.students.length],['No requests yet',data.students.filter(s=>!records.some(r=>r.assignment.student_id===s.id)).length],['Awaiting review',counts.filter(s=>s==='submitted').length],['Overdue',counts.filter(s=>s==='overdue').length]]:[['Assignments',records.length],['Awaiting review',counts.filter(s=>s==='submitted').length],['Completed assignments',counts.filter(s=>s==='accepted').length],['Overdue',counts.filter(s=>s==='overdue').length]]).map(([label,count])=><div key={label} className="rounded-xl border bg-white p-4"><p className="text-2xl font-bold">{count}</p><p className="mt-1 text-sm text-slate-600">{label}</p></div>)}</div>}
 {manage&&compose!==null&&<div><div className="mb-2 flex justify-between"><h3 className="font-semibold">New assignment</h3><button className="text-sm text-slate-600 underline" onClick={()=>setCompose(null)}>Close form</button></div><StudentResearchComposer key={compose} students={data.students} initialTarget={compose} facultyAccess={data.facultyAccess} onSaved={refresh}/></div>}
 {showRoster&&<nav aria-label="Research views" className="flex gap-2 border-b pb-3"><button aria-pressed={view==='students'} className={`rounded-lg px-4 py-2 ${view==='students'?'bg-blue-700 text-white':'bg-white'}`} onClick={()=>{setView('students');setSelected(null);setQuery('');}}>Students ({data.students.length})</button><button aria-pressed={view==='requests'} className={`rounded-lg px-4 py-2 ${view==='requests'?'bg-blue-700 text-white':'bg-white'}`} onClick={()=>{setView('requests');setSelected(null);setQuery('');}}>Assignments and reviews ({records.length})</button></nav>}
 {showRoster&&view==='students'?<><label className="block text-sm font-medium">Search registered students<input className={input} placeholder="Student name or university ID" value={query} onChange={e=>setQuery(e.target.value)}/></label><StudentResearchRoster students={data.students} records={records} now={now} query={query} onSelect={selectStudent} onRequest={manage?requestStudent:undefined}/></>:<>
 {selectedStudent&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><h3 className="font-bold">{selectedStudent.name || 'Student'}</h3><p className="text-sm text-slate-500">{selectedStudent.universityId} · Research progress and feedback</p></div>{manage&&<button className={button} onClick={()=>requestStudent(selectedStudent.id)}>Assign work to this student</button>}</div>}
 <label className="block text-sm">Assignment status<select className={input} value={filter} onChange={e=>setFilter(e.target.value)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label} ({value==='all'?selectedRecords.length:selectedRecords.filter(r=>studentResearchStatus(r,now)===value).length})</option>)}</select></label>
 {!selected&&<label className="block text-sm">Search assignments<input className={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Assignment title or student"/></label>}
 {!selectedRecords.length&&<div className="rounded-xl border bg-white p-5"><p>{manage?'No research requests have been sent'+(selectedStudent?' to this student':'')+' yet. Use Assign work to start tracking.':'No assignments yet. Work sent by your PG Director will appear here.'}</p><p className="mt-2 text-sm text-slate-500">A title submission is not required — questions can be sent before, during or after title approval.</p></div>}
 {!!selectedRecords.length&&!visible.length&&<p>No requests match these filters.</p>}
 {visible.map(r=><StudentResearchCard key={r.assignment.id} record={r} role={data.role} refresh={refresh} now={now}/>)}
 </>}
 </>}
 </section>;
}
