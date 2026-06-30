import { ProtectedRoute } from "@/shared/common/protected-route";

export default function GitProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="ADMIN">{children}</ProtectedRoute>;
}
