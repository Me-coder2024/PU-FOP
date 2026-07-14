import DashboardShell from '@/components/layout/DashboardShell';

export default function DeanLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
