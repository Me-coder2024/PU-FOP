/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function endpoint({user={id:'signed-in',email:'staff@example.test'},grants=[{role:'dean',institute_id:null,department_id:null}],saveError=null}={}) {
 const writes=[];
 const profile={id:'signed-in',role:'pg_director',institute_id:'old-institute',department_id:'old-department'};
 const admin={from(table){let update=null;return {
  select(){return this;},eq(key,value){if(table==='profiles')assert.equal(value,'signed-in');return this;},ilike(){return this;},abortSignal(){return this;},
  update(value){update=value;writes.push(value);return this;},
  async single(){return update?{data:saveError?null:{...profile,...update},error:saveError}:{data:profile,error:null};},
  then(resolve,reject){return Promise.resolve({data:grants,error:null}).then(resolve,reject);},
 };}};
 const exports={};
 const source=ts.transpileModule(fs.readFileSync('app/api/auth/switch-role/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInThisContext(`(function(require,exports){${source}\n})`)(name=>{
  assert.equal(name,'@/lib/supabase/server');
  return {createServerClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})}}),createServiceClient:()=>admin};
 },exports);
 return {post:exports.POST,writes};
}
const request=(role,origin='https://portal.test')=>new Request('https://portal.test/api/auth/switch-role',{method:'POST',headers:{origin,'content-type':'application/json','x-user-id':'someone-else'},body:JSON.stringify({role,userId:'someone-else'})});
test('switches only the authenticated profile to an assigned role and its scope',async()=>{
 const {post,writes}=endpoint();const response=await post(request('dean'));
 assert.equal(response.status,200);assert.deepEqual(writes,[{role:'dean',institute_id:null,department_id:null}]);assert.equal((await response.json()).role,'dean');
});
test('unassigned roles cannot escalate privileges',async()=>{
 const {post,writes}=endpoint();assert.equal((await post(request('super_admin'))).status,403);assert.equal(writes.length,0);
});
test('missing sessions and foreign origins cannot write roles',async()=>{
 const loggedOut=endpoint({user:null});assert.equal((await loggedOut.post(request('dean'))).status,401);assert.equal(loggedOut.writes.length,0);
 const other=endpoint();assert.equal((await other.post(request('dean','https://other.test'))).status,403);assert.equal(other.writes.length,0);
});
test('save failures are returned rather than reporting a completed switch',async()=>{
 const {post}=endpoint({saveError:{code:'42501'}});const response=await post(request('dean'));assert.equal(response.status,503);assert.match((await response.json()).error,/Unable to save/);
});
