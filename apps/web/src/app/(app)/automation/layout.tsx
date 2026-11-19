import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/shared/common/protected-route";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";

export default function AutomationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isCapabilityEnabled("serverAutomation")) {
    redirect("/dashboard");
  }

  return <ProtectedRoute requireWorkspaceAdmin>{children}</ProtectedRoute>;
}
