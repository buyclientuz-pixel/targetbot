import { PaymentRecord, PaymentStatus, ProjectBillingState } from "../types";
import { createId } from "./ids";
import { EnvBindings, listPayments, savePayments, updateProjectRecord } from "./storage";

const DEFAULT_CURRENCY = "USD";

const normalizeIsoDate = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) {
    return new Date(direct).toISOString();
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
};

const toDateOnly = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const mapStatusToProject = (status: PaymentStatus): ProjectBillingState => {
  switch (status) {
    case "active":
      return "active";
    case "overdue":
      return "overdue";
    case "pending":
      return "pending";
    case "cancelled":
    default:
      return "blocked";
  }
};

const selectLatestProjectPayment = (
  payments: PaymentRecord[],
  projectId: string,
): { record: PaymentRecord; index: number } | null => {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  payments.forEach((payment, index) => {
    if (payment.projectId !== projectId) {
      return;
    }
    const candidates = [payment.periodEnd, payment.paidAt ?? null, payment.periodStart, payment.updatedAt, payment.createdAt];
    let score = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        score = parsed;
        break;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex < 0) {
    return null;
  }
  return { record: payments[bestIndex], index: bestIndex };
};

const determineAmount = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2));
    }
  }
  return fallback;
};

const resolveCurrency = (value: string | null | undefined): string => {
  if (value && /^[A-Z]{3}$/.test(value)) {
    return value;
  }
  return DEFAULT_CURRENCY;
};

const paymentCollectionByProject = (payments: PaymentRecord[], projectId: string): PaymentRecord[] => {
  return payments.filter((entry) => entry.projectId === projectId);
};

const buildPaymentRecord = (
  projectId: string,
  options: {
    amount: number;
    currency?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    status?: PaymentStatus;
    paidAt?: string | null;
    notes?: string;
  },
  reference?: PaymentRecord | null,
): PaymentRecord => {
  const nowIso = new Date().toISOString();
  const normalizedStart = normalizeIsoDate(options.periodStart ?? reference?.periodEnd ?? reference?.periodStart ?? nowIso);
  const normalizedEnd = normalizeIsoDate(options.periodEnd ?? nowIso) ?? nowIso;
  const normalizedPaidAt = normalizeIsoDate(options.paidAt ?? null);
  return {
    id: createId(),
    projectId,
    amount: Number(options.amount.toFixed(2)),
    currency: resolveCurrency(options.currency ?? reference?.currency ?? null),
    status: options.status ?? reference?.status ?? "pending",
    periodStart: normalizedStart ?? nowIso,
    periodEnd: normalizedEnd,
    paidAt: normalizedPaidAt,
    notes: options.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  } satisfies PaymentRecord;
};

const applyProjectSync = async (
  env: EnvBindings,
  projectId: string,
  payments: PaymentRecord[],
): Promise<void> => {
  const projectPayments = paymentCollectionByProject(payments, projectId);
  if (!projectPayments.length) {
    await updateProjectRecord(env, projectId, {
      nextPaymentDate: null,
      paymentPlan: null,
      billingAmountUsd: null,
      billingPlan: null,
      tariff: 0,
      paymentEnabled: false,
      billingEnabled: false,
      billingStatus: "pending",
    });
    return;
  }
  const latestEntry = selectLatestProjectPayment(projectPayments, projectId);
  const latest = latestEntry?.record ?? projectPayments[projectPayments.length - 1];
  const nextDate = toDateOnly(latest.periodEnd ?? latest.periodStart ?? latest.updatedAt);
  const paidDate = toDateOnly(latest.paidAt ?? null);
  const amount = Number.isFinite(latest.amount) ? Number(latest.amount.toFixed(2)) : 0;
  const patch = {
    nextPaymentDate: nextDate,
    paymentPlan: amount,
    billingAmountUsd: amount,
    tariff: amount,
    paymentEnabled: true,
    billingEnabled: true,
    billingStatus: mapStatusToProject(latest.status),
  } as Partial<Parameters<typeof updateProjectRecord>[2]>;
  if (paidDate) {
    patch.lastPaymentDate = paidDate;
  }
  await updateProjectRecord(env, projectId, patch);
};

export const appendProjectPayment = async (
  env: EnvBindings,
  projectId: string,
  options: {
    amount: number | null | undefined;
    currency?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    status?: PaymentStatus;
    paidAt?: string | null;
    notes?: string;
  },
): Promise<PaymentRecord> => {
  const payments = await listPayments(env);
  const projectPayments = paymentCollectionByProject(payments, projectId);
  const amount = determineAmount(options.amount, projectPayments.length ? projectPayments[projectPayments.length - 1].amount : 0);
  const reference = projectPayments.length
    ? selectLatestProjectPayment(projectPayments, projectId)?.record ?? projectPayments[projectPayments.length - 1]
    : null;
  const record = buildPaymentRecord(projectId, { ...options, amount }, reference ?? undefined);
  payments.push(record);
  await savePayments(env, payments);
  await applyProjectSync(env, projectId, payments);
  return record;
};

export const updateLatestProjectPayment = async (
  env: EnvBindings,
  projectId: string,
  patch: Partial<Omit<PaymentRecord, "id" | "projectId" | "createdAt">>,
): Promise<PaymentRecord | null> => {
  const payments = await listPayments(env);
  const latest = selectLatestProjectPayment(payments, projectId);
  if (!latest) {
    return null;
  }
  const nowIso = new Date().toISOString();
  const current = latest.record;
  const updated: PaymentRecord = {
    ...current,
    amount: determineAmount(patch.amount, current.amount),
    currency: resolveCurrency((patch.currency as string | null | undefined) ?? current.currency),
    status: (patch.status as PaymentStatus | undefined) ?? current.status,
    periodStart: normalizeIsoDate((patch.periodStart as string | null | undefined) ?? current.periodStart) ?? current.periodStart,
    periodEnd: normalizeIsoDate((patch.periodEnd as string | null | undefined) ?? current.periodEnd) ?? current.periodEnd,
    paidAt: normalizeIsoDate((patch.paidAt as string | null | undefined) ?? current.paidAt ?? null),
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updatedAt: nowIso,
  } satisfies PaymentRecord;
  payments[latest.index] = updated;
  await savePayments(env, payments);
  await applyProjectSync(env, projectId, payments);
  return updated;
};

export const syncProjectPayments = async (
  env: EnvBindings,
  projectId: string,
  paymentsInput?: PaymentRecord[],
): Promise<void> => {
  const payments = paymentsInput ?? (await listPayments(env));
  await applyProjectSync(env, projectId, payments);
};
