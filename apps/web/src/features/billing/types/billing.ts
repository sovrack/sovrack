export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type BillingStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE" | "VOID";

export type PlanLimits = {
  maxProjects: number;
  maxServers: number;
  maxTeamMembers: number;
  storageLimitMb: number;
  maxBackups: number;
};

export type SubscriptionInfo = {
  id: string;
  plan: Plan;
  status: BillingStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  canceledAt: string | null;
};

export type BillingInvoice = {
  id: string;
  teamId: string;
  amountMillimes: number;
  currency: string;
  status: InvoiceStatus;
  stripeInvoiceId: string | null;
  pdfUrl: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

export type BillingInfo = {
  subscription: SubscriptionInfo;
  prices: Record<Plan, number>;
  limits: PlanLimits;
  usage: {
    projects: number;
    servers: number;
    members: number;
  };
  invoices: BillingInvoice[];
};
