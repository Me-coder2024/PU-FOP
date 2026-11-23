import { randomUUID } from 'node:crypto';
import { createServerClient,createServiceClient } from '@/lib/supabase/server';
import { grade,validateAnswers,validateWorkflow,validateQuestionBank } from '@/lib/rpms/model';
import { verifyPptx } from '@/lib/progress/pptx';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const BUCKET='research-evidence';
export async function GET(){
 const session=await createServerClient();const {data:{user}}=await session.auth.getUser();if(!user)return reply({error:'Sign in to view research projects.'},401);
 const {data,error}=await createServiceClient().rpc('rpms_snapshot',{actor:user.id});
 if(error)return reply({error:'The unified research workspace is not available yet. Apply the RPMS migration with the matching release.'},503);
 if(!data?.role)return reply({error:'Complete your profile setup before opening research projects.'},403);
 return reply(data);
}
export async function POST(request:Request){
 try {
  const session=await createServerClient();const {data:{user}}=await session.auth.getUser();if(!user)return reply({error:'Sign in again.'},401);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
  const text=await request.text();if(text.length>250000)return reply({error:'Request too large.'},413);
  const body=JSON.parse(text);const action=body.action;const p:Record<string,unknown>={...body};delete p.action;delete p.score;delete p.sealedPath;
  if(!uuid.test(body.requestKey||''))return reply({error:'Request key required.'},400);
  for(const k of ['taskId','projectId','workflowId','attemptId','responseId','fileId','referenceId'])if(body[k]!=null&&!uuid.test(body[k]))return reply({error:'Invalid identifier.'},400);
  for(const k of ['reason','interest','batch','semester'])if(body[k]!=null&&(typeof body[k]!=='string'||body[k].length>8000))return reply({error:'Text is too long.'},400);
  if(body.deadline!=null&&!Number.isFinite(Date.parse(body.deadline)))return reply({error:'Invalid deadline.'},400);
  const admin=createServiceClient();
  if(['reference_reserve','reference_confirm','reference_download'].includes(action)){
   if(action==='reference_reserve'&&(typeof body.filename!=='string'||body.filename.length>200||/[/\\\x00-\x1f]/.test(body.filename)||!/[.](pdf|pptx)$/i.test(body.filename)||!Number.isInteger(body.size)||body.size<1||body.size>26214400))throw new Error('Choose a PDF/PPTX reference up to 25 MB.');
   const reference=await admin.rpc('rpms_reference',{actor:user.id,action:action==='reference_reserve'?'reserve':'get',p});
   if(reference.error||!reference.data)throw new Error('Reference template unavailable.');
   const file=reference.data;
   if(action==='reference_reserve'){
    const upload=await admin.storage.from(BUCKET).createSignedUploadUrl(file.path,{upsert:false});if(upload.error)throw new Error('Could not prepare reference upload.');
    return reply({id:file.id,path:file.path,token:upload.data.token});
   }
   if(action==='reference_download'){
    if(!file.sealed_path||file.state!=='verified')throw new Error('Template is not verified.');
    const signed=await admin.storage.from(BUCKET).createSignedUrl(file.sealed_path,60,{download:file.filename});if(signed.error)throw new Error('Unable to download template.');return reply({url:signed.data.signedUrl});
   }
   if(file.owner_id!==user.id||file.state!=='reserved')throw new Error('Only the uploader can verify a reference.');
   const sealed=`verified/references/${randomUUID()}`;const copied=await admin.storage.from(BUCKET).copy(file.path,sealed);if(copied.error)throw new Error('Reference upload incomplete.');
   const downloaded=await admin.storage.from(BUCKET).download(sealed);if(downloaded.error)throw new Error('Unable to inspect reference.');const bytes=Buffer.from(await downloaded.data.arrayBuffer());
   if(bytes.length!==file.size||bytes.length>26214400)throw new Error('Reference size mismatch.');
   if(/[.]pptx$/i.test(file.filename))verifyPptx(bytes);else if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-2048).toString().includes('%%EOF'))throw new Error('Invalid reference PDF.');
   const confirmed=await admin.rpc('rpms_reference',{actor:user.id,action:'confirm',p:{referenceId:file.id,sealedPath:sealed}});if(confirmed.error)throw new Error('Unable to verify reference.');return reply({id:file.id});
  }
  if(action==='bank_publish'){
   for(const k of ['name','category','difficulty'])if(typeof body[k]!=='string'||!body[k].trim()||body[k].length>160)throw new Error('Provide a bank name, category and difficulty.');
   validateQuestionBank(body.questions);
  }
  if(action==='publish'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160)throw new Error('Enter a workflow name.');
   validateWorkflow(body.definition);
  }
  if(['assign','announce'].includes(action)&&(!Array.isArray(body.students)||body.students.length<1||body.students.length>1000||!body.students.every((id:unknown)=>typeof id==='string'&&uuid.test(id))))throw new Error('Choose valid student recipients.');
  if(body.taskId){
   const {data:context,error}=await admin.rpc('rpms_private',{actor:user.id,task:body.taskId});
   if(error||!context)return reply({error:'Activity unavailable.'},403);
   const replay=await admin.rpc('rpms_replay',{actor:user.id,action,p});
   if(replay.error)return reply({error:replay.error.message},409);
   if(replay.data){
    if(action==='reserve'&&replay.data.path){const upload=await admin.storage.from(BUCKET).createSignedUploadUrl(replay.data.path,{upsert:false});if(upload.error)throw new Error('Unable to renew upload.');return reply({...replay.data,token:upload.data.token});}
    return reply(replay.data);
   }
   if(action==='save')validateAnswers(context.task.config.questions,body.answers,false);
   if(action==='submit'){
    const draft=context.responses.find(r=>r.id===body.responseId&&!r.submitted_at);if(!draft)throw new Error('Save a draft first.');
    validateAnswers(context.task.config.questions,draft.answers,true);
   }
   if(['attempt_save','attempt_submit'].includes(action)){
    if(!context.attempt||context.attempt.id!==body.attemptId)throw new Error('Use your current assessment attempt.');
    validateAnswers(context.attempt.questions,body.answers,false);
    if(action==='attempt_submit')p.score=grade(context.attempt.questions,body.answers);
   }
   if(action==='reserve'){
    if(typeof body.filename!=='string'||body.filename.length>200||/[/\\\x00-\x1f]/.test(body.filename)||!Number.isInteger(body.size)||!new RegExp(context.task.kind==='pptx'?'\\.pptx$':context.task.kind==='document'?'\\.pdf$':'\\.(pdf|pptx)$','i').test(body.filename))throw new Error('Choose the required PPTX or PDF file.');
   }
   if(action==='download'||action==='confirm'){
    const file=context.files.find(f=>f.id===body.fileId);if(!file)throw new Error('File unavailable.');
    if(action==='download'){
     // Private drafts are owner-only, even for reviewers.
     if(file.state!=='submitted'&&file.uploaded_by!==user.id)return reply({error:'Private draft.'},403);
     if(!file.sealed_path)throw new Error('File has not been verified.');
     const {data,error}=await admin.storage.from(BUCKET).createSignedUrl(file.sealed_path,60,{download:file.filename});if(error)throw new Error('Unable to create download.');
     return reply({url:data.signedUrl});
    }
    if(file.uploaded_by!==user.id||file.state!=='reserved')return reply({error:'Only your reserved file can be verified.'},403);
    const sealed=`verified/${context.task.project_id}/${randomUUID()}`;
    const copied=await admin.storage.from(BUCKET).copy(file.path,sealed);if(copied.error)throw new Error('Upload incomplete. Try again.');
    const downloaded=await admin.storage.from(BUCKET).download(sealed);if(downloaded.error||!downloaded.data)throw new Error('Unable to inspect uploaded file.');
    const bytes=Buffer.from(await downloaded.data.arrayBuffer());
    if(bytes.length!==file.size||bytes.length>(context.task.config.maxBytes||0))throw new Error('File size does not match.');
    if(/\.pptx$/i.test(file.filename))verifyPptx(bytes);
    else if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-2048).toString().includes('%%EOF'))throw new Error('Invalid PDF document.');
    p.sealedPath=sealed;
   }
  }
  const {data,error}=await admin.rpc('rpms_action',{actor:user.id,action,p});
  if(error)return reply({error:error.message},409);
  if(action==='reserve'&&data.path){
   const {data:upload,error}=await admin.storage.from(BUCKET).createSignedUploadUrl(data.path,{upsert:false});
   if(error)throw new Error('Could not prepare upload. Try again.');
   return reply({...data,token:upload.token});
  }
  return reply(data);
 }catch(e){return reply({error:e instanceof Error?e.message:'Unable to save research activity.'},400);}
}
