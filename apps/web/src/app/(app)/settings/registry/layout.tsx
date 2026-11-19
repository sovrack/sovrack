import { ProtectedRoute } from "@/shared/common/protected-route";

export default function RegistrySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requireWorkspaceAdmin>{children}</ProtectedRoute>;
}
