import { MetaAccountInfo } from "../types";
import { callGraph } from "./client";

const ACCOUNT_FIELDS = [
  "id",
  "name",
  "currency",
  "account_status",
  "balance",
  "spend_cap",
  "funding_source_details",
  "last_used_time",
  "disable_reason",
].join(",");

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const mapAccountRecord = (account: any): MetaAccountInfo => {
  return {
    id: String(account?.id ?? ""),
    name: String(account?.name ?? "Без названия"),
    currency: String(account?.currency ?? "USD"),
    spend_cap: normalizeNumber(account?.spend_cap),
    balance: normalizeNumber(account?.balance),
    status: account?.account_status ? String(account.account_status) : undefined,
    payment_method: account?.funding_source_details?.display_string
      ? String(account.funding_source_details.display_string)
      : null,
    last_update: account?.last_used_time ? String(account.last_used_time) : null,
    issues: account?.disable_reason ? [String(account.disable_reason)] : undefined,
  };
};

export const fetchAdAccounts = async (env: unknown): Promise<MetaAccountInfo[]> => {
  try {
    const response = await callGraph(env as any, "me/adaccounts", {
      fields: ACCOUNT_FIELDS,
      limit: "50",
    });
    if (!response || !Array.isArray(response.data)) {
      return [];
    }
    return response.data.map(mapAccountRecord);
  } catch (_error) {
    return [];
  }
};
