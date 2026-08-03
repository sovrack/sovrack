import api from "@/shared/lib/api";
import type { BillingInfo, Plan } from "@/features/billing/types/billing";

export const billingService = {
  /** Vue billing complète (abonnement, limites, usage, factures). */
  async getMyBilling(): Promise<BillingInfo> {
    const res = await api.get<BillingInfo>("/billing");
    return res.data;
  },

  /** Change le plan de l'équipe. */
  async subscribe(plan: Plan): Promise<{ success: boolean; message: string }> {
    const res = await api.post<{ success: boolean; message: string }>(
      "/billing/subscribe",
      { plan },
    );
    return res.data;
  },
};
