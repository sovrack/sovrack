"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/api/use-auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireWorkspaceAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireWorkspaceAdmin = false,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const hasRequiredRole = !requireWorkspaceAdmin || isAdmin;

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (!hasRequiredRole) {
        router.replace("/access-denied");
      }
    }
  }, [hasRequiredRole, isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-border border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!hasRequiredRole) {
    return null;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
