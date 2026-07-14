import DashboardShell from '@/components/layout/DashboardShell';

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
