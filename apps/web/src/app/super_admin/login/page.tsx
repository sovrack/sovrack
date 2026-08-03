import { Suspense } from "react";
import { SuperAdminLoginScreen } from "@/features/auth/components/super-admin-login-screen";

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <SuperAdminLoginScreen />
    </Suspense>
  );
}
