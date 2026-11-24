import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/supabase/types';
/** Cookie identity is authoritative. Never trust an actor ID supplied by the browser. */
export async function requireRole(request:Request, roles?:AppRole[]) {
  if(!['GET','HEAD'].includes(request.method) && request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) {
    return {response:Response.json({error:'Invalid origin.'},{status:403})} as const;
  }
  const session=await createServerClient();
  const {data:{user},error}=await session.auth.getUser();
  if(error||!user)return {response:Response.json({error:'Sign in again.'},{status:401})} as const;
  const {data:profile,error:profileError}=await createServiceClient().from('profiles').select('*').eq('id',user.id).single();
  if(profileError||!profile)return {response:Response.json({error:'Unable to verify your account.'},{status:503})} as const;
  if(roles&&!roles.includes(profile.role))return {response:Response.json({error:'Your role cannot perform this action.'},{status:403})} as const;
  return {user,profile} as const;
}
