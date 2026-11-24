/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration='supabase/migrations/20261124043858_faculty_wide_research_access.sql';
test('PG Director and Dean see all institutes by role, including students without an institute',async()=>{
 const db=new PGlite();
 try {
  const runFile=async file=>db.exec(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  await runFile('tests/fixtures/research-baseline.sql');
  for(const name of ['research_progress','title_workflow','workflow_mail_outbox','pg_research_requests','student_research_tracking','research_director_access','rpms'])await runFile(`database/migration_${name}.sql`);
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const institute=(await one("insert into institutes(name) values('One') returning id")).id;
  const other=(await one("insert into institutes(name) values('Two') returning id")).id;
  const person=async(role,inst)=>(await one('insert into profiles(role,institute_id) values($1::app_role,$2) returning id',[role,inst])).id;
  const pg=await person('pg_director',institute), dean=await person('dean',institute), noInstitutePg=await person('pg_director',null), guide=await person('guide',institute),hod=await person('hod',institute);
  await db.query("insert into profiles(role,institute_id,full_name) select 'student',$1,'Local '||n from generate_series(1,45) n",[institute]);
  const remoteStudent=await person('student',other), unassigned=await person('student',null);
  const snapshot=async actor=>{
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
   return (await one('select student_research_snapshot() data')).data;
  };
  assert.equal((await snapshot(pg)).students.length,45,'reproduces the previous institute-only count');
  await runFile(migration);
  await runFile(migration); // Existing installations can safely reapply this patch.
  for(const actor of [pg,dean,noInstitutePg]){
   const roster=(await snapshot(actor)).students;
   assert.equal(roster.length,47);
   assert.ok(roster.some(s=>s.id===remoteStudent));
   assert.ok(roster.some(s=>s.id===unassigned));
   assert.equal((await one('select has_faculty_research_access($1) ok',[actor])).ok,true);
   assert.equal((await one('select rpms_snapshot($1) data',[actor])).data.projects.length,47);
  }
  const scope=async(actor,student,manage=false)=>(await one('select student_research_scope($1,$2,$3) ok',[actor,student,manage])).ok;
  assert.equal(await scope(pg,remoteStudent,true),true);
  const publish=actor=>one("select publish_student_research($1,gen_random_uuid(),$2,'Faculty assignment','other','Submit your work','[\"Update?\"]'::jsonb,now()+interval '7 days') id",[actor,[remoteStudent,unassigned]]);
  assert.ok((await publish(pg)).id,'PG Director can assign across institutes without an extra grant');
  await assert.rejects(publish(dean));
  assert.equal(await scope(dean,remoteStudent,true),false,'visibility does not grant Dean assignment-creation permission');
  for(const actor of [guide,hod])assert.equal(await scope(actor,remoteStudent),false);
  assert.equal(await scope(remoteStudent,unassigned),false);
  assert.equal(await scope(remoteStudent,remoteStudent),true);
  const title=(await one("insert into submissions(student_id,title) values($1,'Other institute title') returning id",[remoteStudent])).id;
  for(const actor of [pg,dean])assert.equal((await one('select research_scope($1,$2) ok',[actor,title])).ok,true);
  assert.equal((await one('select research_scope($1,$2) ok',[guide,title])).ok,false);
  await db.query("update profiles set role='guide' where id=$1",[pg]);
  assert.equal(await scope(pg,remoteStudent),false,'removing the leadership role revokes faculty scope');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[dean]);
  await db.exec('set role authenticated');
  assert.equal((await one('select student_research_snapshot() data')).data.students.length,47);
  await assert.rejects(db.query('select student_research_scope($1,$2,true)',[noInstitutePg,remoteStudent]));
 } finally {await db.close();}
});
