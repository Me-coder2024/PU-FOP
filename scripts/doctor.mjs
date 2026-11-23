import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let failed=false;
function report(ok,label){console.log(`${ok?'OK':'NEEDS ATTENTION'}: ${label}`);if(!ok)failed=true;}
report(Number(process.versions.node.split('.')[0])===24,`Node.js ${process.versions.node} (project uses Node 24 LTS)`);
for(const name of ['next','react','typescript','@supabase/supabase-js','firebase','@electric-sql/pglite']) {
 try { require.resolve(name==='firebase'?'firebase/app':name);report(true,`${name} installed`); } catch { report(false,`${name} missing; run npm ci`); }
}
report(existsSync('.env.local'),'.env.local exists (values are never printed)');
const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_FIREBASE_API_KEY','NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN','NEXT_PUBLIC_FIREBASE_PROJECT_ID','NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET','NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID','NEXT_PUBLIC_FIREBASE_APP_ID'];
for(const name of required) report(!!process.env[name] && !/^(your-|placeholder|replace[-_])/i.test(process.env[name]),`${name} configured`);
for(const name of ['GROQ_API_KEY','RESEND_API_KEY','SMTP_HOST']) console.log(`OPTIONAL: ${name} ${process.env[name]?'configured':'not configured'}`);
if(process.argv.includes('--online')){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(url && key){
  try {
   const {createClient}=require('@supabase/supabase-js');
   const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   for(const table of ['profiles','submissions','research_milestone_definitions','research_updates','research_request_events','workflow_mail_outbox','student_research_requests','student_research_assignments','student_research_responses','student_research_history','research_projects','research_workflow_versions','research_project_tasks','research_assessment_attempts','research_activity_logs']){
    const {error,status}=await client.from(table).select(table==='research_milestone_definitions'?'id,response_kind,target_submission_id':'id').limit(1);
    report(!error && status>=200 && status<300,`${table}: ${error || status>=300 ? `unavailable (${error?.code || `HTTP ${status}`}); check staging migrations/configuration` : 'reachable'}`);
   }
   const {data:bucket,error}=await client.storage.getBucket('research-presentations');
   report(!error && bucket?.public===false,`research-presentations bucket: ${error ? 'missing or inaccessible' : bucket?.public ? 'public (must be private)' : 'private'}`);
  }catch{report(false,'Supabase connectivity check failed; check network and credentials');}
 }
}
console.log('No database writes, migrations, uploads, or emails were performed.');
process.exitCode=failed?1:0;
