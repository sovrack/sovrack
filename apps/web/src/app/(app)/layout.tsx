import { ProtectedRoute } from '@/shared/common/protected-route';
import { DashboardShell } from '@/shared/layout/dashboard-shell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  );
}
