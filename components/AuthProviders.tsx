'use client';
import {AuthProvider} from '@/hooks/useAuth';
import {RoleProvider} from '@/hooks/useRole';
export default function AuthProviders({children}:{children:React.ReactNode}){return <AuthProvider><RoleProvider>{children}</RoleProvider></AuthProvider>;}
