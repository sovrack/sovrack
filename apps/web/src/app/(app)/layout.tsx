import { ProtectedRoute } from '@/components/protected-route';
import { DashboardShell } from '@/components/dashboard-shell';

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
