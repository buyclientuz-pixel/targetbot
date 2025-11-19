import { DataValidationError } from "../errors";
import type { PaymentRecord } from "./spec/payments-history";

const STATUS_ALIASES: Record<string, PaymentRecord["status"]> = {
  planned: "planned",
  plan: "planned",
  pending: "planned",
  schedule: "planned",
  scheduled: "planned",
  "запланировано": "planned",
  "запланирован": "planned",
  "запланирована": "planned",
  "ожидание": "planned",
  "ожидает": "planned",
  paid: "paid",
  payed: "paid",
  "оплачено": "paid",
  "оплачен": "paid",
  "оплачена": "paid",
  "оплата": "paid",
  "оплаченo": "paid",
  overdue: "overdue",
  late: "overdue",
  "просрочено": "overdue",
  "просрочен": "overdue",
  "просрочена": "overdue",
  cancelled: "cancelled",
  canceled: "cancelled",
  cancel: "cancelled",
  decline: "cancelled",
  declined: "cancelled",
  "отменено": "cancelled",
  "отменён": "cancelled",
  "отменена": "cancelled",
  "отказ": "cancelled",
  "отклонено": "cancelled",
};

export const normalisePaymentStatusLabel = (
  input: string | null | undefined,
): PaymentRecord["status"] => {
  if (input == null) {
    return "planned";
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return "planned";
  }
  const key = trimmed.toLowerCase();
  const status = STATUS_ALIASES[key];
  if (!status) {
    throw new DataValidationError(`Неизвестный статус оплаты: ${input}`);
  }
  return status;
};
