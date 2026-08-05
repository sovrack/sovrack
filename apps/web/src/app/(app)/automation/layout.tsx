import { ProtectedRoute } from "@/shared/common/protected-route";

export default function AutomationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="SUPER_ADMIN">{children}</ProtectedRoute>;
}
