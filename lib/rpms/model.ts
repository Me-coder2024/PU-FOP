export type Question = {
 id:string; label:string; type:'short'|'long'|'yes_no'|'single'|'multiple'|'dropdown'|'number'|'date'|'url'|'rating'|'checklist'|'file';
 required:boolean; options?:string[]; min?:number; max?:number;
 when?:{question:string;equals:string}; correct?:string[]; marks?:number; penalty?:number; explanation?:string;
};
export type TaskDefinition = {
 key:string; name:string; instructions:string; kind:'questionnaire'|'assessment'|'document'|'pptx'|'title'|'task'|'meeting'|'final_review';
 weight:number; mandatory:boolean; reviewer:'guide'|'hod'|'pg_director'|'dean'; dependencies:string[]; parent?:string;
 priority:'low'|'normal'|'high'|'urgent'; startDay:number; dueDay:number; questions:Question[];
 attempts?:number; durationMinutes?:number; passPercent?:number; release?:'immediate'|'after_close'|'never';
 criteria?:{label:string;max:number}[];referenceId?:string;questionCount?:number; maxBytes?:number; repeatDays?:number; maxOccurrences?:number;
};
export type WorkflowDefinition = {tasks:TaskDefinition[];warningDays:number;escalateDays:number;reviewDays:number;notifications?:Record<string,string[]>};
export type TaskState = 'not_started'|'in_progress'|'submitted'|'under_review'|'changes_required'|'approved';
export type Project = {id:string;student_id:string;cycle:string;batch:string;semester:string;interest:string;initiation_date:string|null;expected_completion:string|null;created_at:string;workflow_id:string|null;on_hold:boolean;hold_reason:string|null;name:string;enrollment:string;institute:string;department:string;guide:string;progress:number|null;health:string;health_reasons:string[];self_reported_progress:number|null;self_initiated:boolean|null;planned_progress:number|null;submitted_progress:number|null;completed:boolean};
export type Task = {active:boolean;id:string;project_id:string;key:string;name:string;kind:TaskDefinition['kind'];state:TaskState;config:TaskDefinition;starts_at:string;deadline:string;submitted_at:string|null;approved_at:string|null;blocked:boolean;blocker:string|null;dependencies:string[];locked:boolean;lock_reason:string|null;attempts:Attempt[];responses:ResponseVersion[];files:Deliverable[]};
export type ResponseVersion = {id:string;version:number;answers:Record<string,unknown>;submitted_at:string|null;created_at:string};
export type Attempt = {id:string;number:number;questions:Question[];answers:Record<string,unknown>;started_at:string;expires_at:string;submitted_at:string|null;score:number|null;passed:boolean|null;feedback?:Question[]};
export type Deliverable = {id:string;task_id:string;filename:string;size:number;state:'reserved'|'verified'|'submitted';created_at:string;submitted_at:string|null};
export type Activity = {id:string;project_id:string;task_id:string|null;actor_id:string|null;actor_name:string|null;action:string;details:Record<string,unknown>;created_at:string;internal:boolean};
export type Workflow = {id:string;name:string;version:number;definition:WorkflowDefinition;created_at:string};
export type QuestionBank = {id:string;name:string;category:string;difficulty:string;questions:Question[];created_at:string};
export type Snapshot = {banks:QuestionBank[];role:string;canManage:boolean;projects:Project[];tasks:Task[];events:Activity[];workflows:Workflow[];legacy:{titles:Record<string,unknown>[];requests:Record<string,unknown>[];presentations:Record<string,unknown>[]}};
export function visibleQuestion(q:Question,answers:Record<string,unknown>){return !q.when || String(answers[q.when.question]??'')===q.when.equals;}
export function validateAnswers(questions:Question[],answers:Record<string,unknown>,complete:boolean){
 if(!answers || typeof answers!=='object'||Array.isArray(answers))throw new Error('Answers must be an object.');
 const known=new Set(questions.map(q=>q.id));
 for(const key of Object.keys(answers))if(!known.has(key))throw new Error('Unknown question.');
 for(const q of questions){
  if(!visibleQuestion(q,answers))continue;
  const v=answers[q.id];const empty=v==null||v===''||(Array.isArray(v)&&v.length===0);
  if(empty){if(complete&&q.required)throw new Error(`Answer: ${q.label}`);continue;}
  if(q.type==='multiple'||q.type==='checklist'){if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!q.options?.includes(x))||new Set(v).size!==v.length)throw new Error(`Invalid choices: ${q.label}`);}
  else if(q.type==='number'||q.type==='rating'){if(typeof v!=='number'||!Number.isFinite(v)||(q.min!=null&&v<q.min)||(q.max!=null&&v>q.max))throw new Error(`Invalid number: ${q.label}`);}
  else {if(typeof v!=='string'||v.length>10000)throw new Error(`Invalid answer: ${q.label}`);
   if(['single','dropdown'].includes(q.type)&&!q.options?.includes(v))throw new Error('Choose a listed option.');
   if(q.type==='yes_no'&&!['Yes','No'].includes(v))throw new Error('Choose Yes or No.');
   if(q.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))))throw new Error('Enter a valid date.');
   if(q.type==='file'&&!/^[0-9a-f-]{36}$/i.test(v))throw new Error('Upload the required evidence file.');
   if(q.type==='url'){try{if(!['https:','http:'].includes(new URL(v).protocol))throw Error();}catch{throw new Error('Enter an http or https reference URL.');}}
  }
 }
}
export function validateWorkflow(d:WorkflowDefinition){
 if(!d||!Array.isArray(d.tasks)||!d.tasks.length||d.tasks.length>100)throw new Error('A workflow needs 1–100 activities.');
 for(const k of ['warningDays','escalateDays','reviewDays'] as const)if(!Number.isInteger(d[k])||d[k]<1||d[k]>365)throw new Error('Health thresholds must be 1–365 days.');
 if(d.notifications){for(const [event,roles] of Object.entries(d.notifications))if(!['upcoming','overdue','review_delay','escalation'].includes(event)||!Array.isArray(roles)||roles.some(r=>!['student','guide','hod','pg_director','dean'].includes(r)))throw new Error('Invalid reminder recipients.');}
 const keys=new Set<string>();
 for(const t of d.tasks){
  if(!/^[a-z0-9_-]{1,50}$/.test(t.key)||keys.has(t.key))throw new Error('Activity keys must be unique.');keys.add(t.key);
  if(typeof t.name!=='string'||!t.name.trim()||t.name.length>160||typeof t.instructions!=='string'||t.instructions.length>8000)throw new Error('Check activity names and instructions.');
  if(!['questionnaire','assessment','document','pptx','title','task','meeting','final_review'].includes(t.kind)||!['guide','hod','pg_director','dean'].includes(t.reviewer)||!['low','normal','high','urgent'].includes(t.priority))throw new Error('Invalid activity configuration.');
  if(typeof t.mandatory!=='boolean'||!Number.isFinite(t.weight)||t.weight<0||t.weight>100||!Number.isInteger(t.startDay)||!Number.isInteger(t.dueDay)||t.startDay<0||t.dueDay<t.startDay||t.dueDay>3650)throw new Error('Check weights and activity dates.');
  if(t.criteria&&(!Array.isArray(t.criteria)||t.criteria.length>20||new Set(t.criteria.map(c=>c.label)).size!==t.criteria.length||t.criteria.some(c=>!c.label.trim()||c.label.length>100||!Number.isFinite(c.max)||c.max<=0||c.max>100)))throw new Error('Rubric criteria need distinct labels and positive maximum marks.');
  if(t.referenceId&&!/^[0-9a-f-]{36}$/i.test(t.referenceId))throw new Error('Invalid reference template.');
  if(!Array.isArray(t.dependencies)||!Array.isArray(t.questions)||t.questions.length>50)throw new Error('Invalid requirements.');
  const ids=new Set<string>();
  for(const q of t.questions){
   if(!/^[a-zA-Z0-9_-]{1,50}$/.test(q.id)||ids.has(q.id)||typeof q.label!=='string'||!q.label.trim()||q.label.length>500||typeof q.required!=='boolean')throw new Error('Question IDs must be unique and labels required.');
   if(!['short','long','yes_no','single','multiple','dropdown','number','date','url','rating','checklist','file'].includes(q.type))throw new Error('Invalid question type.');
   if(q.when&&(!ids.has(q.when.question)||typeof q.when.equals!=='string'))throw new Error('A conditional question must refer to an earlier question.');ids.add(q.id);
   if(['single','multiple','dropdown','checklist'].includes(q.type)&&(!Array.isArray(q.options)||q.options.length<2||q.options.length>20||new Set(q.options).size!==q.options.length||q.options.some(v=>typeof v!=='string'||!v.trim()||v.length>500)))throw new Error('Provide 2–20 distinct choices.');
   if(q.min!=null&&!Number.isFinite(q.min)||q.max!=null&&!Number.isFinite(q.max)||q.min!=null&&q.max!=null&&q.min>q.max)throw new Error('Invalid question bounds.');
   if(t.kind==='assessment'){
    if(!['single','multiple'].includes(q.type)||q.when||!q.correct?.length||q.correct.some(a=>!q.options?.includes(a))||new Set(q.correct).size!==q.correct.length||(q.type==='single'&&q.correct.length!==1)||!Number.isFinite(q.marks)||q.marks!<=0||q.marks!>100||!Number.isFinite(q.penalty)||q.penalty!<0||q.penalty!>100)throw new Error('Assessment questions need valid answer keys, positive marks and nonnegative penalties.');
   }
  }
  if(['questionnaire','assessment'].includes(t.kind)&&!t.questions.length)throw new Error('Add at least one question.');
  if(t.kind==='assessment'&&t.questionCount!=null&&(!Number.isInteger(t.questionCount)||t.questionCount<1||t.questionCount>t.questions.length))throw new Error('Question count must fit the question pool.');
  if(t.kind==='assessment'&&(!Number.isInteger(t.attempts)||t.attempts!<1||t.attempts!>20||!Number.isInteger(t.durationMinutes)||t.durationMinutes!<1||t.durationMinutes!>240||!Number.isFinite(t.passPercent)||t.passPercent!<1||t.passPercent!>100||!['immediate','after_close','never'].includes(t.release!)))throw new Error('Check assessment attempts, duration, pass mark and result release.');
  if((['document','pptx'].includes(t.kind)||t.questions.some(q=>q.type==='file'))&&(!Number.isInteger(t.maxBytes)||t.maxBytes!<1||t.maxBytes!>26214400))throw new Error('File limit must be at most 25 MB.');
  if(t.repeatDays!=null&&(!Number.isInteger(t.repeatDays)||t.repeatDays<1||t.repeatDays>365||!Number.isInteger(t.maxOccurrences)||t.maxOccurrences!<1||t.maxOccurrences!>52||!['questionnaire','meeting'].includes(t.kind)||t.weight!==0||t.mandatory))throw new Error('Recurring check-ins must be optional, unweighted, and limited to 1–52 occurrences.');
 }
 const map=new Map(d.tasks.map(t=>[t.key,t]));const done=new Set<string>(),active=new Set<string>();
 function visit(key:string){if(active.has(key))throw new Error('Circular activity dependencies.');if(done.has(key))return;const t=map.get(key);if(!t)throw new Error('Unknown dependency or parent.');active.add(key);for(const dep of [...t.dependencies,...(t.parent?[t.parent]:[])])visit(dep);active.delete(key);done.add(key);}
 for(const t of d.tasks)visit(t.key);
 if(d.tasks.filter(t=>t.kind==='title').length>1)throw new Error('Only one authoritative title activity is allowed.');
 if(!d.tasks.some(t=>t.kind==='final_review'&&t.mandatory))throw new Error('Include a mandatory final review.');
}
// Exact-set multi-select scoring: all correct options and no extras earn marks;
// unanswered earns zero; other answers lose the configured penalty, total clamped to zero.
export function grade(questions:Question[],answers:Record<string,unknown>){
 validateAnswers(questions,answers,false);let earned=0,total=0;
 for(const q of questions){total+=q.marks||0;const v=answers[q.id];const selected=Array.isArray(v)?v:typeof v==='string'&&v?[v]:[];if(!selected.length)continue;const correct=q.correct||[];earned+=selected.length===correct.length&&selected.every(x=>correct.includes(String(x)))?(q.marks||0):-(q.penalty||0);}
 return total?Math.round(Math.max(0,earned)/total*10000)/100:0;
}
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function validateQuestionBank(questions:Question[]){
 const task:TaskDefinition={key:'bank',name:'Question bank',instructions:'',kind:'assessment',questions,weight:0,mandatory:false,reviewer:'pg_director',dependencies:[],priority:'normal',startDay:0,dueDay:1,attempts:1,durationMinutes:30,passPercent:60,release:'after_close'};
 validateWorkflow({warningDays:1,reviewDays:1,escalateDays:1,tasks:[task,{...task,key:'final',kind:'final_review',mandatory:true,questions:[]}]});
}
