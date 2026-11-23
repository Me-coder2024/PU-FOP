import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
export const runtime='nodejs';
// Vercel runs daily by default; a trusted external scheduler can invoke more often.
async function run(request:Request){
 const expected=process.env.RPMS_JOB_SECRET||process.env.CRON_SECRET;const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return Response.json({error:'Unauthorized'},{status:401});
 const {data,error}=await createServiceClient().rpc('rpms_jobs',{});
 return Response.json(error?{error:'Research job failed'}:{processed:data},{status:error?500:200});
}
export const GET=run;export const POST=run;
