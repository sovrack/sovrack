import { ProtectedRoute } from '@/components/protected-route';

export default function RegistrySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requiredRole="ADMIN">{children}</ProtectedRoute>;
}
