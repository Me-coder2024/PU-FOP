import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
export default function robots(): MetadataRoute.Robots {
 return {
  rules:{userAgent:['*','Googlebot','Bingbot','OAI-SearchBot','Claude-SearchBot'],allow:'/',disallow:['/api/','/auth/','/dashboard','/student','/guide','/hod','/pg-director','/dean','/super-admin','/research','/assignments','/onboarding','/feedback']},
  sitemap:`${SITE_URL}/sitemap.xml`,
 };
}
