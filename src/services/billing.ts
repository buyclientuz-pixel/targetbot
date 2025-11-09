import { kvGet, kvPut } from "./kv";
import { BillingSnapshot } from "../types/domain";

const BILLING_KEY = "billing:snapshot";

export async function getBillingSnapshot(): Promise<BillingSnapshot | null> {
  const raw = await kvGet(BILLING_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as BillingSnapshot;
}

export async function saveBillingSnapshot(snapshot: BillingSnapshot): Promise<void> {
  await kvPut(BILLING_KEY, JSON.stringify(snapshot));
}

export async function updateSpend(amount: number): Promise<BillingSnapshot> {
  const current = (await getBillingSnapshot()) ?? {
    limit: 0,
    spent: 0,
    alertsEnabled: true,
    updatedAt: new Date().toISOString(),
  };
  const updated: BillingSnapshot = {
    ...current,
    spent: amount,
    updatedAt: new Date().toISOString(),
  };
  await saveBillingSnapshot(updated);
  return updated;
}

export async function setLimit(limit: number): Promise<BillingSnapshot> {
  const current = (await getBillingSnapshot()) ?? {
    limit: 0,
    spent: 0,
    alertsEnabled: true,
    updatedAt: new Date().toISOString(),
  };
  const updated: BillingSnapshot = {
    ...current,
    limit,
    updatedAt: new Date().toISOString(),
  };
  await saveBillingSnapshot(updated);
  return updated;
}

export async function toggleAlerts(enabled: boolean): Promise<BillingSnapshot> {
  const current = (await getBillingSnapshot()) ?? {
    limit: 0,
    spent: 0,
    alertsEnabled: true,
    updatedAt: new Date().toISOString(),
  };
  const updated: BillingSnapshot = {
    ...current,
    alertsEnabled: enabled,
    updatedAt: new Date().toISOString(),
  };
  await saveBillingSnapshot(updated);
  return updated;
}
