/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,dependencies){const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext(`(function(require,exports){${source}\n})`)(name=>{assert.ok(dependencies[name],name);return dependencies[name];},exports);return exports;}
const request=(body,headers={})=>new Request('https://portal.test/api/dean/role-grants',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('role guard ignores browser identity and denies sessions, roles, and cross-origin writes',async()=>{
 let user={id:'student'},role='student';const admin={from:()=>({select(){return this},eq(k,v){assert.equal(v,'student');return this},single:async()=>({data:{id:'student',role},error:null})})};
 const {requireRole}=load('lib/utils/require-role.ts',{'@/lib/supabase/server':{createServerClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})}}),createServiceClient:()=>admin}});
 assert.equal((await requireRole(request({}, {'x-user-id':'dean'}),['dean'])).response.status,403);
 assert.equal((await requireRole(request({}, {origin:'https://foreign.test'}))).response.status,403);
 role='dean';assert.equal((await requireRole(request({userId:'other'}),['dean'])).user.id,'student');
 user=null;assert.equal((await requireRole(request({}))).response.status,401);
});
function grantRoute(role='dean'){
 const rows={profiles:[{id:'person',email:'person@test.edu',role:'pg_director',institute_id:'inst',department_id:'dept'}],role_grants:[{id:'guide-grant',email:'person@test.edu',role:'guide',institute_id:'inst',department_id:'dept'},{id:'pg-grant',email:'person@test.edu',role:'pg_director',institute_id:null,department_id:null}],audit_logs:[],departments:[{id:'dept',institute_id:'inst'}]};
 const admin={from(table){const filters=[];let op='select',value,head=false;const q={select(_s,opts){head=opts?.head;return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},order(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},run(single=false){const matched=rows[table].filter(r=>filters.every(f=>f(r)));if(op==='insert')rows[table].push(value);if(op==='update')matched.forEach(r=>Object.assign(r,value));if(op==='delete')rows[table]=rows[table].filter(r=>!matched.includes(r));return {data:head?null:single?matched[0]||null:matched,error:null,count:matched.length}},single:async()=>q.run(true),maybeSingle:async()=>q.run(true),then(resolve,reject){return Promise.resolve(q.run()).then(resolve,reject)}};return q}};
 const {POST}=load('app/api/dean/role-grants/route.ts',{'next/server':{NextResponse:Response},'@/lib/utils/require-role':{requireRole:async()=>({user:{id:'actor'},profile:{id:'actor',role,institute_id:'inst',department_id:'dept'}})},'@/lib/supabase/server':{createServiceClient:()=>admin}});
 return {POST,rows};
}
test('revoking one grant preserves another active role and ignores forged grantEmail',async()=>{
 const {POST,rows}=grantRoute();const res=await POST(request({action:'revoke',grantId:'guide-grant',grantEmail:'someone-else@test.edu'}));assert.equal(res.status,200);assert.equal(rows.profiles[0].role,'pg_director');assert.deepEqual(rows.role_grants.map(r=>r.id),['pg-grant']);
});
test('revoking active role falls back to a remaining assigned role and scope',async()=>{
 const {POST,rows}=grantRoute();assert.equal((await POST(request({action:'revoke',grantId:'pg-grant'}))).status,200);assert.equal(rows.profiles[0].role,'guide');assert.equal(rows.profiles[0].institute_id,'inst');
});
test('Dean cannot grant super admin; HOD cannot grant leadership or revoke out-of-scope roles',async()=>{
 const dean=grantRoute();assert.equal((await dean.POST(request({action:'create',email:'person@test.edu',role:'super_admin'}))).status,400);
 const hod=grantRoute('hod');assert.equal((await hod.POST(request({action:'create',email:'person@test.edu',role:'dean'}))).status,400);assert.equal((await hod.POST(request({action:'revoke',grantId:'pg-grant'}))).status,403);
 hod.rows.role_grants[0].department_id='other';assert.equal((await hod.POST(request({action:'revoke',grantId:'guide-grant'}))).status,403);
});
