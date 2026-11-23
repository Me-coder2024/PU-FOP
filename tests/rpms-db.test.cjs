/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
test('RPMS lifecycle, private assessments, immutable workflows, progress and scoped operations',async()=>{
 const db=new PGlite();try{
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/research-baseline.sql'),'utf8'));
 for(const f of ['migration_student_research_tracking','migration_research_progress','migration_title_workflow','migration_workflow_mail_outbox','migration_pg_research_requests','migration_research_director_access','migration_rpms'])await db.exec(fs.readFileSync(path.join(__dirname,'../database',f+'.sql'),'utf8'));
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const institute=(await one("insert into institutes(name) values('Test pharmacy') returning id")).id;
 const dept=(await one("insert into departments(name,institute_id) values('Test department',$1) returning id",[institute])).id;
 const person=async(role,inst=institute,guide=null)=>(await one('insert into profiles(role,institute_id,department_id,guide_id,full_name) values($1::app_role,$2,$3,$4,$1::text) returning id',[role,inst,dept,guide])).id;
 const pg=await person('pg_director'),guide=await person('guide'),student=await person('student',institute,guide),outsider=await person('pg_director',null),dean=await person('dean');
 const project=(await one('select id from research_projects where student_id=$1',[student])).id;
 assert.ok(project,'onboarding creates a project without a title');
 const call=async(actor,action,p={})=>(await one('select rpms_action($1,$2,$3) result',[actor,action,{...p,requestKey:p.requestKey||randomUUID()}])).result;
 const snapshot=async actor=>(await one('select rpms_snapshot($1) data',[actor])).data;
 const base={instructions:'Test',weight:10,mandatory:true,reviewer:'guide',dependencies:[],priority:'normal',startDay:0,dueDay:10,questions:[]};
 const config={warningDays:3,escalateDays:7,reviewDays:4,tasks:[
 {...base,key:'initial',name:'Initial',kind:'questionnaire',questions:[{id:'q',type:'long',label:'Research interest?',required:true}]},
 {...base,key:'exam',name:'Research test',kind:'assessment',dependencies:['initial'],attempts:2,durationMinutes:10,passPercent:60,release:'after_close',questions:[{id:'mcq',type:'single',label:'Ethics?',options:['Before','After'],correct:['Before'],marks:1,penalty:0,required:true}]},
 {...base,key:'title',name:'Title',kind:'title',dependencies:['exam']},
 {...base,key:'report',name:'Periodic review',kind:'questionnaire',mandatory:false,weight:0,repeatDays:1,maxOccurrences:2,questions:[{id:'q',type:'long',label:'Work?',required:true}]},
 {...base,key:'final',name:'Final review',kind:'final_review',reviewer:'dean',dependencies:['title']}
 ]};
 const w=(await call(pg,'publish',{name:'Test workflow',definition:config})).id;
 await assert.rejects(call(student,'publish',{name:'Not allowed',definition:config}));
 await assert.rejects(call(outsider,'assign',{workflowId:w,students:[student]}));
 await call(pg,'assign',{workflowId:w,students:[student]});
 let snap=await snapshot(student);assert.equal(snap.projects[0].progress,0);assert.equal(snap.tasks.length,5);assert.equal(snap.workflows.length,0);
 assert.ok(!JSON.stringify(snap.tasks).includes('correct'),'answer keys never present before an attempt');
 const task=key=>snap.tasks.find(t=>t.key===key);
 const initial=task('initial').id,exam=task('exam').id,final=task('final').id;
 await assert.rejects(call(student,'attempt_start',{taskId:exam}));
 await assert.rejects(db.query("insert into submissions(student_id,title) values($1,'Too early')",[student]));
 const draft=(await call(student,'save',{taskId:initial,answers:{q:'Drug delivery'}})).id;
 assert.equal((await snapshot(guide)).tasks.find(t=>t.id===initial).responses.length,0);
 await call(student,'submit',{taskId:initial,responseId:draft});
 snap=await snapshot(student);const submitted=task('initial').submitted_at;
 await assert.rejects(call(student,'review',{taskId:initial,state:'approved',expectedSubmittedAt:submitted,reason:'Self approval'}));
 await call(guide,'review',{taskId:initial,state:'approved',expectedSubmittedAt:submitted,reason:'Verified initial evidence'});
 snap=await snapshot(student);assert.equal(snap.projects[0].progress,25);
 const attempt=(await call(student,'attempt_start',{taskId:exam})).id;
 snap=await snapshot(student);assert.ok(!JSON.stringify(snap.tasks).includes('correct'));assert.equal(task('exam').attempts[0].score,null);
 const privateAttempt=(await one('select rpms_private($1,$2) data',[student,exam])).data.attempt;assert.deepEqual(privateAttempt.questions[0].correct,['Before']);
 await call(student,'attempt_submit',{taskId:exam,attemptId:attempt,answers:{mcq:'Before'},score:100});
 snap=await snapshot(student);assert.equal(task('exam').attempts[0].score,null,'grade remains hidden until release');assert.equal(snap.projects[0].progress,50);
 const submission=(await one("insert into submissions(student_id,title,status) values($1,'Authoritative title','submitted') returning id",[student])).id;
 await db.query("update submissions set status='finalized',finalized_at=now() where id=$1",[submission]);
 snap=await snapshot(student);assert.equal(snap.projects[0].progress,75);assert.equal(snap.projects[0].completed,false);
 const f=(await call(student,'save',{taskId:final,answers:{}})).id;await call(student,'submit',{taskId:final,responseId:f});
 snap=await snapshot(student);await call(dean,'review',{taskId:final,state:'approved',expectedSubmittedAt:task('final').submitted_at,reason:'All research requirements verified'});
 snap=await snapshot(student);assert.equal(snap.projects[0].progress,100);assert.equal(snap.projects[0].completed,true);
 await call(guide,'reopen',{taskId:initial,reason:'Evidence needs reassessment'});
 snap=await snapshot(student);assert.equal(snap.projects[0].progress,0,'dependent approvals lose effective credit after a prerequisite reopens');assert.equal(snap.projects[0].completed,false);
 assert.equal((await snapshot(outsider)).projects.length,0);
 const key=randomUUID();await call(pg,'hold',{projectId:project,onHold:true,reason:'Approved pause',requestKey:key});await call(pg,'hold',{projectId:project,onHold:true,reason:'Approved pause',requestKey:key});
 assert.equal((await one("select count(*)::int n from research_activity_logs where action='hold'")).n,1);
 await call(pg,'hold',{projectId:project,onHold:false,reason:'Resume'});
 await db.exec("update research_project_tasks set starts_at=now()-interval '2 days',deadline=now()-interval '1 hour' where key='report'");
 await db.query('select rpms_jobs()');await db.query('select rpms_jobs()');const jobs=(await one('select count(*)::int n from research_job_events')).n;await db.query('select rpms_jobs()');assert.equal((await one('select count(*)::int n from research_job_events')).n,jobs);
 assert.equal((await one("select count(*)::int n from research_project_tasks where key='report'")).n,2,'recurring occurrence is generated only once');
 const w2=(await call(pg,'publish',{name:'Test workflow',definition:config})).id;
 await assert.rejects(call(pg,'assign',{workflowId:w2,students:[student]}));await call(pg,'assign',{workflowId:w2,students:[student],reason:'Explicit version migration'});
 assert.ok((await one('select count(*)::int n from research_project_tasks where not active')).n>0);
 assert.equal((await one('select answers from research_task_responses where id=$1',[draft])).answers.q,'Drug delivery');


 const ref=(await one('select rpms_reference($1,$2,$3) data',[pg,'reserve',{filename:'rubric.pdf',size:500}])).data;
 await assert.rejects(db.query('select rpms_reference($1,$2,$3)',[student,'reserve',{filename:'bad.pdf',size:500}]));
 await assert.rejects(db.query('select rpms_reference($1,$2,$3)',[outsider,'get',{referenceId:ref.id}]));
 await db.query('select rpms_reference($1,$2,$3)',[pg,'confirm',{referenceId:ref.id,sealedPath:'verified/reference-test.pdf'}]);
 const followupConfig={...config,tasks:config.tasks.map(x=>x.key==='initial'?{...x,referenceId:ref.id}:x)};
 const referenced=(await call(pg,'publish',{name:'Template workflow',definition:followupConfig})).id;
 await call(pg,'add_task',{projectId:project,workflowId:referenced,activityKey:'initial'});
 assert.equal((await one('select rpms_reference($1,$2,$3) data',[student,'get',{referenceId:ref.id}])).data.id,ref.id);
 await assert.rejects(db.query('select rpms_reference($1,$2,$3)',[outsider,'get',{referenceId:ref.id}]));
 const timedStudent=await person('student',institute,guide);
 const timedConfig={...config,tasks:[{...config.tasks[1],dependencies:[],key:'timed'}, {...config.tasks.at(-1),dependencies:['timed']}]};
 const timedWorkflow=(await call(pg,'publish',{name:'Timed workflow',definition:timedConfig})).id;
 await call(pg,'assign',{workflowId:timedWorkflow,students:[timedStudent]});
 let timed=(await snapshot(timedStudent)).tasks.find(t=>t.key==='timed');
 const first=(await call(timedStudent,'attempt_start',{taskId:timed.id})).id;
 await call(timedStudent,'attempt_submit',{taskId:timed.id,attemptId:first,answers:{mcq:'After'},score:100});
 assert.equal((await one('select score from research_assessment_attempts where id=$1',[first])).score,'0.00','SQL grades from the stored key, ignoring a forged score');
 const second=(await call(timedStudent,'attempt_start',{taskId:timed.id})).id;
 await db.query("update research_assessment_attempts set expires_at=now()-interval '1 minute' where id=$1",[second]);
 await assert.rejects(call(timedStudent,'attempt_submit',{taskId:timed.id,attemptId:second,answers:{mcq:'Before'},score:100}));
 await db.query('select rpms_jobs()');
 await assert.rejects(call(timedStudent,'attempt_start',{taskId:timed.id}));
 const bank=(await call(pg,'bank_publish',{name:'Ethics bank',category:'Research ethics',difficulty:'introductory',questions:timedConfig.tasks[0].questions})).id;
 assert.ok((await snapshot(pg)).banks.some(b=>b.id===bank));assert.equal((await snapshot(timedStudent)).banks.length,0);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from research_assessment_attempts'));await assert.rejects(db.query('select rpms_snapshot($1)',[pg]));await db.exec('reset role');
 }finally{await db.close();}
});
