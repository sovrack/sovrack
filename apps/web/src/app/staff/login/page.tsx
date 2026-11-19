import { Suspense } from "react";
import { StaffLoginScreen } from "@/features/auth/components/staff-login-screen";

export default function StaffLoginPage() {
  return (
    <Suspense fallback={null}>
      <StaffLoginScreen />
    </Suspense>
  );
}
