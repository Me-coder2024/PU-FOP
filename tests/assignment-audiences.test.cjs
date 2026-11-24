/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
test('assignment audiences use assigned roles, deduplicate recipients, and preserve private drafts; PPT requires finalization',async()=>{
 const db=new PGlite();try{
 const file=async p=>db.exec(fs.readFileSync(p,'utf8'));
 await file('tests/fixtures/research-baseline.sql');
 await db.exec('create table role_grants(id uuid primary key default gen_random_uuid(),email text,role app_role,institute_id uuid,department_id uuid)');
 for(const n of ['research_progress','title_workflow','workflow_mail_outbox','pg_research_requests','student_research_tracking','research_director_access','rpms'])await file(`database/migration_${n}.sql`);
 await file('supabase/migrations/20261124043858_faculty_wide_research_access.sql');
 await file('supabase/migrations/20261124051146_assignment_audiences_and_finalized_ppt.sql');
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const person=async role=>(await one('insert into profiles(role,email,full_name) values($1::app_role,$2,$1) returning id',[role,`${randomUUID()}@test.edu`])).id;
 const pg=await person('pg_director'),dean=await person('dean'),guide=await person('guide'),hod=await person('hod'),s1=await person('student'),s2=await person('student');
 await db.query("insert into role_grants(email,role) select email,'guide' from profiles where id in ($1,$2)",[hod,guide]);
 const publish=async(audience,selected=[],actor=pg,key=randomUUID())=>(await one("select publish_assignment($1,$2,$3,$4,'Assignment','Instructions','[\"Work?\"]',now()+interval '7 days') id",[actor,key,audience,selected])).id;
 const recipients=async id=>(await db.query('select student_id from student_research_assignments where request_id=$1',[id])).rows.map(r=>r.student_id).sort();
 assert.deepEqual(await recipients(await publish('students')),[s1,s2].sort());
 const staffRequest=await publish('guides');assert.deepEqual(await recipients(staffRequest),[guide,hod].sort());
 assert.deepEqual(await recipients(await publish('hods')),[hod]);
 assert.deepEqual(await recipients(await publish('selected',[s1,s2,s1])),[s1,s2].sort());
 assert.equal((await recipients(await publish('everyone'))).length,6);
 await assert.rejects(publish('selected',[guide]));await assert.rejects(publish('everyone',[],s1));await assert.rejects(publish('students',[],dean));
 const snapshot=async id=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return (await one('select student_research_snapshot() data')).data;};
 const assigned=(await snapshot(guide)).records.find(r=>r.request.id===staffRequest);assert.ok(assigned?.isOwner);
 const action=async(actor,kind,response=null)=>one('select student_research_action($1,$2,$3,$4,$5) id',[actor,assigned.assignment.id,kind,{'0':'Private staff response'},response]);
 const draft=(await action(guide,'save')).id;
 assert.equal((await snapshot(pg)).records.find(r=>r.assignment.id===assigned.assignment.id).responses.length,0);
 await action(guide,'submit',draft);await action(pg,'accepted',draft);
 assert.equal((await snapshot(guide)).records.find(r=>r.assignment.id===assigned.assignment.id).assignment.state,'accepted');
 await assert.rejects(action(hod,'save'));
 const title=(await one("insert into submissions(student_id,title,status) values($1,'Synthetic title','submitted') returning id",[s1])).id;
 const ppt='83198cf0-ec3a-4cfe-84ad-e5c9214ff8bd';
 const reserve=()=>one("select research_action($1,$2,$3,'reserve',null,'test.pptx',100) data",[s1,title,ppt]);
 await assert.rejects(reserve(),/finaliz/i);
 await db.query("update submissions set status='finalized' where id=$1",[title]);
 assert.ok((await reserve()).data.id);
 }finally{await db.close();}
});
