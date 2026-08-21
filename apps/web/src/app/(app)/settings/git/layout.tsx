import { ProtectedRoute } from "@/shared/common/protected-route";

export default function GitProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requireWorkspaceAdmin>{children}</ProtectedRoute>;
}
