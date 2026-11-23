'use client';
import {useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {rpmsPost} from '@/lib/rpms/client';
import {starterWorkflow} from '@/lib/rpms/template';
import {validateWorkflow,type WorkflowDefinition,type TaskDefinition,type Question,type Workflow,type QuestionBank} from '@/lib/rpms/model';
export const field='mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
export const btn='rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50';
const newQuestion=(n:number):Question=>({id:`q${n}`,label:'',type:'long',required:true});
export const newActivity=(n:number):TaskDefinition=>({key:`activity_${n}`,name:'New activity',instructions:'',kind:'questionnaire',weight:0,mandatory:true,reviewer:'guide',dependencies:[],priority:'normal',startDay:0,dueDay:14,questions:[newQuestion(1)],attempts:2,durationMinutes:30,passPercent:60,release:'after_close',maxBytes:26214400});
export function QuestionEditor({questions,onChange,assessment=false}:{questions:Question[];onChange:(q:Question[])=>void;assessment?:boolean}){
 function update(i:number,patch:Partial<Question>){onChange(questions.map((q,j)=>j===i?{...q,...patch}:q));}
 return <div className="space-y-3">{questions.map((q,i)=><fieldset key={i} className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Question {i+1}</legend>
 <div className="grid gap-3 sm:grid-cols-2"><label>Question<input className={field} value={q.label} maxLength={500} onChange={e=>update(i,{label:e.target.value})}/></label><label>Response type<select className={field} value={q.type} onChange={e=>update(i,{type:e.target.value as Question['type'],options:['single','multiple','dropdown','checklist'].includes(e.target.value)?['Option 1','Option 2']:undefined,correct:assessment?['Option 1']:undefined,marks:assessment?1:undefined,penalty:assessment?0:undefined})}>{(assessment?['single','multiple']:['short','long','yes_no','single','multiple','dropdown','number','date','url','rating','checklist','file']).map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select></label></div>
 <label className="flex gap-2"><input type="checkbox" checked={q.required} onChange={e=>update(i,{required:e.target.checked})}/>Required</label>
 {['single','multiple','dropdown','checklist'].includes(q.type)&&<label className="block">Choices — one per line<textarea className={field} value={(q.options||[]).join('\n')} onChange={e=>update(i,{options:e.target.value.split('\n')})}/></label>}
 {['number','rating'].includes(q.type)&&<div className="flex gap-3"><label>Minimum<input className={field} type="number" value={q.min??''} onChange={e=>update(i,{min:e.target.value===''?undefined:Number(e.target.value)})}/></label><label>Maximum<input className={field} type="number" value={q.max??''} onChange={e=>update(i,{max:e.target.value===''?undefined:Number(e.target.value)})}/></label></div>}
 {!assessment&&i>0&&<div className="grid gap-2 sm:grid-cols-2"><label>Show when earlier answer<select className={field} value={q.when?.question||''} onChange={e=>update(i,{when:e.target.value?{question:e.target.value,equals:''}:undefined})}><option value="">Always show</option>{questions.slice(0,i).map(x=><option key={x.id} value={x.id}>{x.label || x.id}</option>)}</select></label>{q.when&&<label>Equals<input className={field} value={q.when.equals} onChange={e=>update(i,{when:{question:q.when!.question,equals:e.target.value}})}/></label>}</div>}
 {assessment&&<><div className="grid gap-2 sm:grid-cols-3"><label>Correct choices (one per line)<textarea className={field} value={(q.correct||[]).join('\n')} onChange={e=>update(i,{correct:e.target.value.split('\n')})}/></label><label>Marks<input className={field} type="number" min={1} max={100} value={q.marks??1} onChange={e=>update(i,{marks:Number(e.target.value)})}/></label><label>Wrong-answer penalty<input className={field} type="number" min={0} max={100} value={q.penalty??0} onChange={e=>update(i,{penalty:Number(e.target.value)})}/></label></div><label>Explanation<textarea className={field} value={q.explanation||''} onChange={e=>update(i,{explanation:e.target.value})}/></label></>}
 <div className="flex gap-3 text-sm"><button type="button" disabled={i===0} onClick={()=>{const copy=[...questions];[copy[i-1],copy[i]]=[copy[i],copy[i-1]];onChange(copy);}}>Move up</button><button type="button" onClick={()=>onChange([...questions,{...q,id:`q_${crypto.randomUUID().slice(0,8)}`}])}>Duplicate</button><button type="button" onClick={()=>onChange(questions.filter((_,j)=>j!==i))}>Remove</button></div>
 </fieldset>)}<button type="button" className={btn} onClick={()=>onChange([...questions,{...newQuestion(questions.length+1),id:`q_${crypto.randomUUID().slice(0,8)}`,...(assessment?{type:'single' as const,options:['Option 1','Option 2'],correct:['Option 1'],marks:1,penalty:0}:{})}])}>Add question</button></div>;
}
export default function WorkflowBuilder({workflows,banks,publish}:{workflows:Workflow[];banks:QuestionBank[];publish:(name:string,definition:WorkflowDefinition)=>Promise<void>}){
 const [name,setName]=useState('');const [definition,setDefinition]=useState<WorkflowDefinition>({tasks:[],warningDays:3,escalateDays:7,reviewDays:7});const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [preview,setPreview]=useState(false);
 function update(i:number,patch:Partial<TaskDefinition>){setDefinition({...definition,tasks:definition.tasks.map((t,j)=>j===i?{...t,...patch}:t)});}
 return <section className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
  <div className="border-b border-slate-100 pb-3">
    <h3 className="text-xl font-bold text-[#1E293B]">Workflow and Assignment Builder</h3>
    <p className="mt-1 text-sm text-slate-600">
      Create and customize research roadmaps, milestones, and assessment criteria. Publish a verified version, then assign it to students.
    </p>
  </div>

  {/* Toolbar: Template selection */}
  <div className="grid gap-4 sm:grid-cols-2 items-end rounded-xl bg-[#F0F2F8] p-4">
    <label className="block text-xs font-semibold text-slate-700">
      Copy from existing workflow
      <select className={field} defaultValue="" onChange={e=>{const w=workflows.find(w=>w.id===e.target.value);if(w){setDefinition(structuredClone(w.definition));setName(w.name);}}}>
        <option value="">Start a new blank workflow</option>
        {workflows.map(w=><option key={w.id} value={w.id}>{w.name} · v{w.version}</option>)}
      </select>
    </label>
    <div>
      <button
        type="button"
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4361EE] to-[#2D46B9] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95"
        onClick={()=>{setDefinition(starterWorkflow());setName('Illustrative Pharmacy Lifecycle');}}
      >
        Load Illustrative 12-Stage Starter
      </button>
    </div>
  </div>

  {/* Workflow Name (placed cleanly below) */}
  <div>
    <label className="block text-sm font-bold text-[#1E293B]">
      Workflow Name
      <input
        className={`${field} mt-1`}
        placeholder="e.g. M.Pharm Dissertation Lifecycle 2026-27"
        maxLength={160}
        value={name}
        onChange={e=>setName(e.target.value)}
      />
    </label>
  </div>

  {/* Timeline Rules in Simple English */}
  <div className="grid gap-3 sm:grid-cols-3">
    {(['warningDays','reviewDays','escalateDays'] as const).map(k=>(
      <label key={k} className="block text-xs font-semibold text-slate-700">
        {k==='warningDays'?'Reminder before deadline (days)':k==='reviewDays'?'Faculty review deadline (days)':'Escalate when overdue (days)'}
        <input className={field} type="number" min={1} max={365} value={definition[k]} onChange={e=>setDefinition({...definition,[k]:Number(e.target.value)})}/>
      </label>
    ))}
  </div>
 <details className="rounded-lg border p-3"><summary>Reminder and escalation recipients</summary>{['upcoming','overdue','review_delay','escalation'].map(event=><fieldset key={event} className="my-2"><legend>{event.replaceAll('_',' ')}</legend>{['student','guide','hod','pg_director','dean'].map(role=><label key={role} className="mr-3 inline-flex gap-1 text-sm"><input type="checkbox" checked={(definition.notifications?.[event]||(event==='upcoming'?['student']:event==='overdue'?['student','guide','pg_director']:event==='escalation'?['pg_director','dean']:['guide'])).includes(role)} onChange={e=>{const roles=definition.notifications?.[event]||(event==='upcoming'?['student']:event==='overdue'?['student','guide','pg_director']:event==='escalation'?['pg_director','dean']:['guide']);setDefinition({...definition,notifications:{...definition.notifications,[event]:e.target.checked?[...roles,role]:roles.filter(r=>r!==role)}});}}/>{role.replaceAll('_',' ')}</label>)}</fieldset>)}</details>
 {definition.tasks.map((t,i)=><details key={t.key} className="rounded-lg border p-3" open><summary className="cursor-pointer font-semibold">{i+1}. {t.name} · {t.weight}% weight</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
 <label>Name<input className={field} value={t.name} maxLength={160} onChange={e=>update(i,{name:e.target.value})}/></label>
 <label>Activity type<select className={field} value={t.kind} onChange={e=>{const kind=e.target.value as TaskDefinition['kind'];update(i,{kind,questions:kind==='assessment'?[{id:'q1',label:'',type:'single',required:true,options:['Option 1','Option 2'],correct:['Option 1'],marks:1,penalty:0}]:kind==='questionnaire'?[newQuestion(1)]:[]});}}>{['questionnaire','assessment','document','pptx','title','task','meeting','final_review'].map(k=><option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}</select></label>
 <label className="sm:col-span-2">Instructions<textarea className={field} maxLength={8000} value={t.instructions} onChange={e=>update(i,{instructions:e.target.value})}/></label>
 <label>Progress weight (%)<input className={field} type="number" min={0} max={100} value={t.weight} onChange={e=>update(i,{weight:Number(e.target.value)})}/></label>
 <label>Reviewer<select className={field} value={t.reviewer} onChange={e=>update(i,{reviewer:e.target.value as TaskDefinition['reviewer']})}>{['guide','hod','pg_director','dean'].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label>
 <label>Available to student (days from start)<input className={field} type="number" min={0} value={t.startDay} onChange={e=>update(i,{startDay:Number(e.target.value)})}/></label><label>Assignment deadline (days from start)<input className={field} type="number" min={0} value={t.dueDay} onChange={e=>update(i,{dueDay:Number(e.target.value)})}/></label>
 <label>Priority<select className={field} value={t.priority} onChange={e=>update(i,{priority:e.target.value as TaskDefinition['priority']})}>{['low','normal','high','urgent'].map(p=><option key={p}>{p}</option>)}</select></label>
 <label>Parent task<select className={field} value={t.parent||''} onChange={e=>update(i,{parent:e.target.value||undefined})}><option value="">Top-level activity</option>{definition.tasks.filter(x=>x.key!==t.key).map(x=><option key={x.key} value={x.key}>{x.name}</option>)}</select></label>
 <label className="flex gap-2"><input type="checkbox" checked={t.mandatory} onChange={e=>update(i,{mandatory:e.target.checked})}/>Mandatory for research completion</label>
 <fieldset className="sm:col-span-2"><legend>Prerequisites</legend><div className="flex flex-wrap gap-3">{definition.tasks.filter(x=>x.key!==t.key).map(x=><label key={x.key} className="flex gap-2 text-sm"><input type="checkbox" checked={t.dependencies.includes(x.key)} onChange={e=>update(i,{dependencies:e.target.checked?[...t.dependencies,x.key]:t.dependencies.filter(k=>k!==x.key)})}/>{x.name}</label>)}</div></fieldset>
 {t.kind==='assessment'&&<><label>Import reusable question bank<select className={field} defaultValue="" onChange={e=>{const bank=banks.find(b=>b.id===e.target.value);if(bank)update(i,{questions:structuredClone(bank.questions),questionCount:bank.questions.length});}}><option value="">Choose a bank</option>{banks.map(b=><option key={b.id} value={b.id}>{b.category} · {b.name} · {b.difficulty}</option>)}</select></label><label>Questions per attempt<input className={field} type="number" min={1} max={t.questions.length} value={t.questionCount??t.questions.length} onChange={e=>update(i,{questionCount:Number(e.target.value)})}/></label><label>Maximum attempts<input type="number" className={field} min={1} max={20} value={t.attempts} onChange={e=>update(i,{attempts:Number(e.target.value)})}/></label><label>Duration (minutes)<input type="number" className={field} min={1} max={240} value={t.durationMinutes} onChange={e=>update(i,{durationMinutes:Number(e.target.value)})}/></label><label>Pass percentage<input type="number" className={field} min={1} max={100} value={t.passPercent} onChange={e=>update(i,{passPercent:Number(e.target.value)})}/></label><label>Results and answer release<select className={field} value={t.release} onChange={e=>update(i,{release:e.target.value as TaskDefinition['release']})}><option value="immediate">After submission</option><option value="after_close">After activity deadline</option><option value="never">Do not release answers or score</option></select></label><p className="text-sm sm:col-span-2">Multi-select: exact matching earns marks; any incorrect selection applies the penalty. Unanswered earns zero. Total scores cannot go below zero.</p></>}
 <fieldset className="sm:col-span-2"><legend>Evaluation criteria (optional)</legend>{(t.criteria||[]).map((c,j)=><div key={j} className="my-2 flex gap-2"><input aria-label="Criterion name" className={field} placeholder="Criterion" value={c.label} onChange={e=>update(i,{criteria:t.criteria!.map((x,k)=>k===j?{...x,label:e.target.value}:x)})}/><input aria-label="Maximum criterion marks" className={field} type="number" min={1} max={100} value={c.max} onChange={e=>update(i,{criteria:t.criteria!.map((x,k)=>k===j?{...x,max:Number(e.target.value)}:x)})}/><button onClick={()=>update(i,{criteria:t.criteria!.filter((_,k)=>k!==j)})}>Remove</button></div>)}<button className="text-sm text-blue-700 underline" onClick={()=>update(i,{criteria:[...(t.criteria||[]),{label:'',max:10}]})}>Add evaluation criterion</button></fieldset>
 <label className="sm:col-span-2">Reference template (private PDF/PPTX, up to 25 MB)<input type="file" accept=".pdf,.pptx" className={field} disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{const reserved=await rpmsPost('reference_reserve',{filename:file.name,size:file.size});const uploaded=await createClient().storage.from('research-evidence').uploadToSignedUrl(reserved.path!,reserved.token!,file,{contentType:/[.]pptx$/i.test(file.name)?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/pdf'});if(uploaded.error)throw new Error('Reference upload failed.');await rpmsPost('reference_confirm',{referenceId:reserved.id});update(i,{referenceId:reserved.id});}catch(e){setError(e instanceof Error?e.message:'Upload failed');}finally{setBusy(false);}}}/>{t.referenceId&&<span className="text-sm text-green-800">Verified reference attached</span>}</label>
 {['document','pptx'].includes(t.kind)&&<label>File limit (MB)<input className={field} type="number" min={1} max={25} value={(t.maxBytes||26214400)/1048576} onChange={e=>update(i,{maxBytes:Number(e.target.value)*1048576})}/></label>}
 {['questionnaire','meeting'].includes(t.kind)&&<><label>Repeat every days (blank = once)<input className={field} type="number" min={1} max={365} value={t.repeatDays??''} onChange={e=>update(i,{repeatDays:e.target.value?Number(e.target.value):undefined,maxOccurrences:e.target.value?4:undefined,...(e.target.value?{weight:0,mandatory:false}:{})})}/></label>{t.repeatDays&&<label>Total occurrences<input className={field} type="number" min={1} max={52} value={t.maxOccurrences} onChange={e=>update(i,{maxOccurrences:Number(e.target.value)})}/></label>}</>}
 </div>
 {['questionnaire','assessment','task','meeting','final_review'].includes(t.kind)&&<div className="mt-4"><QuestionEditor questions={t.questions} assessment={t.kind==='assessment'} onChange={questions=>update(i,{questions})}/></div>}
 <div className="mt-4 flex gap-3 text-sm"><button disabled={i===0} onClick={()=>{const tasks=[...definition.tasks];[tasks[i-1],tasks[i]]=[tasks[i],tasks[i-1]];setDefinition({...definition,tasks});}}>Move up</button><button onClick={()=>setDefinition({...definition,tasks:[...definition.tasks,{...structuredClone(t),key:`activity_${crypto.randomUUID().slice(0,8)}`,name:t.name+' copy'}]})}>Duplicate activity</button><button onClick={()=>setDefinition({...definition,tasks:definition.tasks.filter(x=>x.key!==t.key)})}>Remove</button></div></details>)}
 <div className="flex flex-wrap gap-3"><button className={btn} onClick={()=>setDefinition({...definition,tasks:[...definition.tasks,{...newActivity(definition.tasks.length+1),key:`activity_${crypto.randomUUID().slice(0,8)}`}]})}>Add activity</button><button className={btn} onClick={()=>setPreview(!preview)}>Preview workflow</button><button className={btn} disabled={busy} onClick={async()=>{setError('');setBusy(true);try{validateWorkflow(definition);await publish(name,definition);}catch(e){setError(e instanceof Error?e.message:'Unable to publish');}finally{setBusy(false);}}}>{busy?'Publishing…':'Publish immutable version'}</button></div>
 {preview&&<ol className="list-inside list-decimal rounded-lg bg-slate-50 p-4">{definition.tasks.map(t=><li key={t.key}>{t.name} · {t.kind} · due day {t.dueDay} · reviewer {t.reviewer} · {t.mandatory?'mandatory':'optional'} · prerequisites: {t.dependencies.map(k=>definition.tasks.find(x=>x.key===k)?.name||'Missing').join(', ')||'none'}</li>)}</ol>}
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 </section>;
}
