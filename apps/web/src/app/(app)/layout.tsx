import { Header } from '@/components/header';
import { ProtectedRoute } from '@/components/protected-route';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </ProtectedRoute>
  );
}
