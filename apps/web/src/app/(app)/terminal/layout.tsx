import { ProtectedRoute } from "@/shared/common/protected-route";

export default function TerminalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="OWNER">{children}</ProtectedRoute>;
}
