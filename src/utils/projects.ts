import { LeadRecord, PaymentRecord, ProjectBillingSummary, ProjectLeadStats, ProjectSummary } from "../types";
import { EnvBindings, listLeads, listPayments, listProjects } from "./storage";

export interface SummarizeProjectsOptions {
  projectIds?: string[];
}

const summarizeLeads = (leads: LeadRecord[]): ProjectLeadStats => {
  let latestTimestamp = 0;
  let newCount = 0;
  let doneCount = 0;

  for (const lead of leads) {
    const created = Date.parse(lead.createdAt);
    if (!Number.isNaN(created) && created > latestTimestamp) {
      latestTimestamp = created;
    }

    if (lead.status === "done") {
      doneCount += 1;
    } else {
      newCount += 1;
    }
  }

  return {
    total: leads.length,
    new: newCount,
    done: doneCount,
    latestAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined,
  };
};

const formatCurrency = (amount: number | undefined, currency: string | undefined): string | undefined => {
  if (amount === undefined) {
    return undefined;
  }
  const safeCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: safeCurrency }).format(amount);
  } catch (error) {
    console.warn("Failed to format currency", safeCurrency, error);
    return `${amount.toFixed(2)} ${safeCurrency}`;
  }
};

const formatDateRange = (start?: string, end?: string): string | undefined => {
  const formatDate = (value?: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed));
  };

  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  if (startLabel && endLabel) {
    return `${startLabel} — ${endLabel}`;
  }
  return startLabel ?? endLabel ?? undefined;
};

const detectBillingStatus = (payment: PaymentRecord | undefined): ProjectBillingSummary => {
  if (!payment) {
    return {
      status: "missing",
      active: false,
      overdue: false,
    };
  }

  const now = Date.now();
  const periodEndTime = payment.periodEnd ? Date.parse(payment.periodEnd) : Number.NaN;
  const isPeriodPast = Number.isFinite(periodEndTime) ? periodEndTime < now : false;
  const overdue = payment.status === "overdue" || (payment.status !== "active" && isPeriodPast);
  const active = !overdue && (payment.status === "active" || payment.status === "pending");

  return {
    status: payment.status,
    active,
    overdue,
    amount: payment.amount,
    currency: payment.currency,
    amountFormatted: formatCurrency(payment.amount, payment.currency),
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    periodLabel: formatDateRange(payment.periodStart, payment.periodEnd),
    paidAt: payment.paidAt ?? null,
    updatedAt: payment.updatedAt,
    notes: payment.notes,
  };
};

const latestPayment = (payments: PaymentRecord[]): PaymentRecord | undefined => {
  if (!payments.length) {
    return undefined;
  }
  return [...payments].sort((a, b) => {
    const aTime = Date.parse(a.periodEnd || a.updatedAt || a.createdAt);
    const bTime = Date.parse(b.periodEnd || b.updatedAt || b.createdAt);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return 0;
    }
    if (Number.isNaN(aTime)) {
      return 1;
    }
    if (Number.isNaN(bTime)) {
      return -1;
    }
    return bTime - aTime;
  })[0];
};

const summarizeBilling = (payments: PaymentRecord[]): ProjectBillingSummary => {
  return detectBillingStatus(latestPayment(payments));
};

export const summarizeProjects = async (
  env: EnvBindings,
  options: SummarizeProjectsOptions = {},
): Promise<ProjectSummary[]> => {
  const [projects, payments] = await Promise.all([
    listProjects(env),
    listPayments(env).catch(() => [] as PaymentRecord[]),
  ]);
  const ids = options.projectIds?.length ? new Set(options.projectIds) : null;
  const targetProjects = ids ? projects.filter((project) => ids.has(project.id)) : projects;

  const paymentsByProject = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    if (!paymentsByProject.has(payment.projectId)) {
      paymentsByProject.set(payment.projectId, []);
    }
    paymentsByProject.get(payment.projectId)!.push(payment);
  }

  const summaries = await Promise.all(
    targetProjects.map(async (project) => {
      const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
      const billing = summarizeBilling(paymentsByProject.get(project.id) ?? []);
      return {
        ...project,
        leadStats: summarizeLeads(leads),
        billing,
      } satisfies ProjectSummary;
    }),
  );

  return summaries;
};

export const sortProjectSummaries = (summaries: ProjectSummary[]): ProjectSummary[] => {
  return [...summaries].sort((a, b) => {
    if (b.leadStats.new !== a.leadStats.new) {
      return b.leadStats.new - a.leadStats.new;
    }

    const bLatest = b.leadStats.latestAt ? Date.parse(b.leadStats.latestAt) : 0;
    const aLatest = a.leadStats.latestAt ? Date.parse(a.leadStats.latestAt) : 0;
    if (bLatest !== aLatest) {
      return bLatest - aLatest;
    }

    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
};

export const projectLeadStats = {
  summarizeLeads,
};

export const projectBilling = {
  summarize: summarizeBilling,
};
