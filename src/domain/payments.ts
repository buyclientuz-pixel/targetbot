import { R2_KEYS } from "../config/r2";
import type { R2Client } from "../infra/r2";
import { DataValidationError } from "../errors";

export type PaymentStatus = "PLANNED" | "PAID" | "CANCELLED";

export interface Payment {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  status: PaymentStatus;
  paidAt: string | null;
  comment: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

const normaliseNumber = (value: unknown, field: string): number => {
  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (Number.isNaN(num)) {
    throw new DataValidationError(`${field} must be a number`);
  }
  return num;
};

const normaliseString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DataValidationError(`${field} is required`);
  }
  return value.trim();
};

const normaliseOptionalString = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    return String(value);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const normaliseDate = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DataValidationError(`${field} is required`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DataValidationError(`${field} must be a valid ISO date`);
  }
  return parsed.toISOString();
};

const normaliseDateOnly = (value: unknown, field: string): string => {
  const iso = normaliseDate(value, field);
  return iso.split("T")[0] ?? iso;
};

const normaliseStatus = (value: unknown): PaymentStatus => {
  const allowed: PaymentStatus[] = ["PLANNED", "PAID", "CANCELLED"];
  const status = typeof value === "string" ? (value.trim().toUpperCase() as PaymentStatus) : value;
  if (!allowed.includes(status as PaymentStatus)) {
    throw new DataValidationError(`Unsupported payment status '${value}'`);
  }
  return status as PaymentStatus;
};

export const parsePayment = (raw: unknown): Payment => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Payment payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    id: normaliseString(record.id, "payment.id"),
    projectId: normaliseString(record.projectId, "payment.projectId"),
    amount: normaliseNumber(record.amount, "payment.amount"),
    currency: normaliseString(record.currency, "payment.currency"),
    periodStart: normaliseDateOnly(record.periodStart, "payment.periodStart"),
    periodEnd: normaliseDateOnly(record.periodEnd, "payment.periodEnd"),
    status: normaliseStatus(record.status ?? "PLANNED"),
    paidAt: normaliseOptionalString(record.paidAt),
    comment: normaliseOptionalString(record.comment),
    createdBy: Number.parseInt(String(record.createdBy ?? 0), 10),
    createdAt: normaliseDate(record.createdAt ?? new Date().toISOString(), "payment.createdAt"),
    updatedAt: normaliseDate(record.updatedAt ?? new Date().toISOString(), "payment.updatedAt"),
  };
};

export const serialisePayment = (payment: Payment): Record<string, unknown> => ({
  ...payment,
});

const nowIso = (): string => new Date().toISOString();

export interface CreatePaymentInput {
  projectId: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  status?: PaymentStatus;
  paidAt?: string | null;
  comment?: string | null;
  createdBy: number;
}

export const createPayment = (input: CreatePaymentInput & { id?: string }): Payment => {
  const id =
    input.id ??
    `pay_${input.projectId}_${input.periodEnd.replace(/[^0-9]/g, "")}_${Math.random().toString(36).slice(2, 8)}`;
  const now = nowIso();
  return parsePayment({
    id,
    projectId: input.projectId,
    amount: input.amount,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: input.status ?? "PLANNED",
    paidAt: input.paidAt ?? null,
    comment: input.comment ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
};

export const savePayment = async (r2: R2Client, payment: Payment): Promise<void> => {
  const key = R2_KEYS.payment(payment.projectId, payment.id);
  await r2.putJson(key, serialisePayment(payment));
};

export const listProjectPayments = async (
  r2: R2Client,
  projectId: string,
  options?: { limit?: number },
): Promise<Payment[]> => {
  const prefix = `payments/${projectId}/`;
  const { objects } = await r2.list(prefix, { limit: options?.limit });
  if (objects.length === 0) {
    return [];
  }
  const payments = await Promise.all(
    objects.map(async (object) => {
      const json = await r2.getJson<Record<string, unknown>>(object.key);
      if (!json) {
        return null;
      }
      try {
        return parsePayment(json);
      } catch {
        return null;
      }
    }),
  );
  return payments.filter((payment): payment is Payment => payment !== null);
};
