import type { Metadata } from 'next';
export const metadata: Metadata = {
 title:'PU-FOP Login | Parul University Pharmacy Research Portal',
 description:'Sign in to PU-FOP to access your student or faculty dashboard, manage research titles, complete assignments and review dissertation progress.',
 alternates:{canonical:'/login'},
};
export default function LoginLayout({children}:{children:React.ReactNode}) {return children;}
