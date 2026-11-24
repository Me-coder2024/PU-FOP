import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
export default function sitemap(): MetadataRoute.Sitemap {
 return ['','/portal-guide','/login'].map(path=>({url:`${SITE_URL}${path}`}));
}
