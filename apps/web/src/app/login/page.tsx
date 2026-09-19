import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/components/login-screen";

export default function LoginAliasPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
