import { ProtectedRoute } from "@/shared/common/protected-route";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="OWNER">{children}</ProtectedRoute>;
}
