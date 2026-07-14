import DashboardShell from '@/components/layout/DashboardShell';

export default function PgDirectorLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
