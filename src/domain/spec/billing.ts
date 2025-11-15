import { KV_KEYS } from "../../config/kv";
import type { KvClient } from "../../infra/kv";
import { DataValidationError } from "../../errors";
import { assertBoolean, assertNumber, assertString } from "../validation";

export interface BillingRecord {
  tariff: number;
  currency: string;
  nextPaymentDate: string;
  autobilling: boolean;
}

export const parseBillingRecord = (raw: unknown): BillingRecord => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("billing payload must be an object");
  }
  const record = raw as Record<string, unknown>;
  return {
    tariff: assertNumber(record.tariff ?? record["tariff"], "billing.tariff"),
    currency: assertString(record.currency ?? record["currency"], "billing.currency"),
    nextPaymentDate: assertString(
      record.next_payment_date ?? record["next_payment_date"],
      "billing.next_payment_date",
    ),
    autobilling: assertBoolean(record.autobilling ?? record["autobilling"], "billing.autobilling"),
  };
};

export const serialiseBillingRecord = (record: BillingRecord): Record<string, unknown> => ({
  tariff: record.tariff,
  currency: record.currency,
  next_payment_date: record.nextPaymentDate,
  autobilling: record.autobilling,
});

export const getBillingRecord = async (
  kv: KvClient,
  projectId: string,
): Promise<BillingRecord | null> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.billing(projectId));
  return raw ? parseBillingRecord(raw) : null;
};

export const putBillingRecord = async (
  kv: KvClient,
  projectId: string,
  record: BillingRecord,
): Promise<void> => {
  await kv.putJson(KV_KEYS.billing(projectId), serialiseBillingRecord(record));
};
