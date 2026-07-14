import DashboardShell from '@/components/layout/DashboardShell';

export default function HodLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
