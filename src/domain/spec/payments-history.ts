import { R2_KEYS } from "../../config/r2";
import type { R2Client } from "../../infra/r2";
import { DataValidationError } from "../../errors";
import { assertNumber, assertOptionalString, assertString } from "../validation";

export type PaymentStatus = "planned" | "paid" | "cancelled";

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  periodFrom: string;
  periodTo: string;
  paidAt: string | null;
  status: PaymentStatus;
  comment: string | null;
}

export interface PaymentsHistoryDocument {
  payments: PaymentRecord[];
}

const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = ["planned", "paid", "cancelled"];

const parsePaymentRecord = (raw: unknown, index: number): PaymentRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError(`payments[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  const statusRaw = record.status ?? record["status"];
  if (typeof statusRaw !== "string" || !PAYMENT_STATUS_VALUES.includes(statusRaw as PaymentStatus)) {
    throw new DataValidationError(
      `payments[${index}].status must be one of: ${PAYMENT_STATUS_VALUES.join(", ")}`,
    );
  }
  return {
    id: assertString(record.id ?? record["id"], `payments[${index}].id`),
    amount: assertNumber(record.amount ?? record["amount"], `payments[${index}].amount`),
    currency: assertString(record.currency ?? record["currency"], `payments[${index}].currency`),
    periodFrom: assertString(record.period_from ?? record["period_from"], `payments[${index}].period_from`),
    periodTo: assertString(record.period_to ?? record["period_to"], `payments[${index}].period_to`),
    paidAt: assertOptionalString(record.paid_at ?? record["paid_at"], `payments[${index}].paid_at`),
    status: statusRaw as PaymentStatus,
    comment: assertOptionalString(record.comment ?? record["comment"], `payments[${index}].comment`),
  };
};

export const parsePaymentsHistoryDocument = (raw: unknown): PaymentsHistoryDocument => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("payments history must be an object");
  }
  const record = raw as Record<string, unknown>;
  const payments = record.payments ?? record["payments"];
  if (!Array.isArray(payments)) {
    throw new DataValidationError("payments history requires a payments array");
  }
  return {
    payments: payments.map((entry, index) => parsePaymentRecord(entry, index)),
  };
};

export const getPaymentsHistoryDocument = async (
  r2: R2Client,
  projectId: string,
): Promise<PaymentsHistoryDocument | null> => {
  const raw = await r2.getJson<Record<string, unknown>>(R2_KEYS.paymentsHistory(projectId));
  return raw ? parsePaymentsHistoryDocument(raw) : null;
};

export const putPaymentsHistoryDocument = async (
  r2: R2Client,
  projectId: string,
  document: PaymentsHistoryDocument,
): Promise<void> => {
  await r2.putJson(R2_KEYS.paymentsHistory(projectId), {
    payments: document.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      period_from: payment.periodFrom,
      period_to: payment.periodTo,
      paid_at: payment.paidAt,
      status: payment.status,
      comment: payment.comment,
    })),
  });
};

export const appendPaymentRecord = async (
  r2: R2Client,
  projectId: string,
  record: PaymentRecord,
): Promise<PaymentsHistoryDocument> => {
  const existing = (await getPaymentsHistoryDocument(r2, projectId)) ?? { payments: [] };
  const updated: PaymentsHistoryDocument = {
    payments: [record, ...existing.payments],
  };
  await putPaymentsHistoryDocument(r2, projectId, updated);
  return updated;
};
