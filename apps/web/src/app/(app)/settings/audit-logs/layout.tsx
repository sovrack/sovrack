import { ProtectedRoute } from "@/shared/common/protected-route";

export default function AuditLogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="SUPER_ADMIN">{children}</ProtectedRoute>;
}
