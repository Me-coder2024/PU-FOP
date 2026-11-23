import { createServerClient, createServiceClient } from '@/lib/supabase/server';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (data: unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET() {
 const session=await createServerClient();
 const {data:{user}}=await session.auth.getUser();
 if (!user) return reply({error:'Sign in to see research requests.'},401);
 const {data,error}=await session.rpc('student_research_snapshot',{});
 if(error) return reply({error:'Student research tracking is unavailable. Apply the student research tracking migration.'},503);
 const {data:profile,error:profileError}=await createServiceClient().from('profiles').select('institute_id').eq('id',user.id).single();
 if(profileError) return reply({error:'Unable to check your institute assignment. Reload and try again.'},503);
 const {data:facultyAccess}=await createServiceClient().rpc('has_faculty_research_access',{p_actor:user.id});
 return reply({...data,facultyAccess:facultyAccess===true,needsInstitute:data?.role==='pg_director'&&!profile?.institute_id&&facultyAccess!==true});
}
export async function POST(request: Request) {
 try {
  const session=await createServerClient();
  const {data:{user}}=await session.auth.getUser();
  if(!user) return reply({error:'Sign in again.'},401);
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return reply({error:'Invalid origin.'},403);
  const body=await request.json();
  const admin=createServiceClient();
  if(body.action==='publish') {
   if(!uuid.test(body.requestKey || '') || !Array.isArray(body.studentIds) || !body.studentIds.length || body.studentIds.length>1000 || !body.studentIds.every((id:unknown)=>typeof id==='string' && uuid.test(id)) || typeof body.name!=='string' || body.name.length>160 || typeof body.instructions!=='string' || body.instructions.length>4000 || typeof body.stage!=='string' || !Array.isArray(body.questions) || body.questions.length>10 || !body.questions.every((q:unknown)=>typeof q==='string' && q.length<=500) || !Number.isFinite(Date.parse(body.deadline))) return reply({error:'Check the recipients, questions and deadline.'},400);
   const {data,error}=await admin.rpc('publish_student_research',{p_actor:user.id,p_key:body.requestKey,p_students:body.studentIds,p_name:body.name,p_stage:body.stage,p_instructions:body.instructions,p_questions:body.questions,p_deadline:new Date(body.deadline).toISOString()});
   if(error) return reply({error:error.message},409);
   return reply({id:data});
  }
  if(!uuid.test(body.assignmentId || '') || !['save','submit','accepted','revision_requested','extend'].includes(body.action) || (body.responseId!=null && !uuid.test(body.responseId))) return reply({error:'Invalid request action.'},400);
  if(body.answers!=null && (typeof body.answers!=='object' || Array.isArray(body.answers) || JSON.stringify(body.answers).length>110000)) return reply({error:'Invalid answers.'},400);
  if(body.remarks!=null && (typeof body.remarks!=='string' || body.remarks.length>4000)) return reply({error:'Remarks must be at most 4,000 characters.'},400);
  if(body.deadline!=null && !Number.isFinite(Date.parse(body.deadline))) return reply({error:'Invalid deadline.'},400);
  const {data,error}=await admin.rpc('student_research_action',{p_actor:user.id,p_assignment:body.assignmentId,p_action:body.action,p_answers:body.answers,p_response:body.responseId,p_remarks:body.remarks,p_deadline:body.deadline});
  if(error) return reply({error:error.message},409);
  return reply({id:data});
 } catch {return reply({error:'Unable to save. Check your connection and retry.'},400);}
}
