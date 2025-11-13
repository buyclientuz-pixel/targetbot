import { MetaAccountLinkRecord, MetaAdAccount } from "../types";

export interface MergeMetaAccountLinksResult {
  records: MetaAccountLinkRecord[];
  changed: boolean;
}

const normalizeCurrency = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : trimmed;
};

export const mergeMetaAccountLinks = (
  stored: MetaAccountLinkRecord[],
  fetched: MetaAdAccount[] | null,
): MergeMetaAccountLinksResult => {
  const storedMap = new Map(stored.map((item) => [item.accountId, item]));
  const fetchedMap = new Map((fetched ?? []).map((item) => [item.id, item]));
  const ids = new Set<string>([...storedMap.keys(), ...fetchedMap.keys()]);
  const now = new Date().toISOString();
  let changed = false;
  const records: MetaAccountLinkRecord[] = [];

  for (const id of Array.from(ids)) {
    const storedRecord = storedMap.get(id);
    const fetchedRecord = fetchedMap.get(id);
    const accountName = fetchedRecord?.name?.trim() || storedRecord?.accountName || id;
    const currency = normalizeCurrency(fetchedRecord?.currency ?? storedRecord?.currency ?? null);
    const spentToday =
      fetchedRecord && fetchedRecord.spend !== undefined
        ? fetchedRecord.spend ?? 0
        : storedRecord?.spentToday ?? null;
    const isLinked = storedRecord?.isLinked ?? false;
    const linkedProjectId = storedRecord?.linkedProjectId ?? null;
    let updatedAt = storedRecord?.updatedAt;

    if (!storedRecord) {
      updatedAt = fetchedRecord ? now : undefined;
      changed = true;
    } else if (
      storedRecord.accountName !== accountName ||
      storedRecord.currency !== currency ||
      (storedRecord.spentToday ?? null) !== (spentToday ?? null)
    ) {
      updatedAt = fetchedRecord ? now : storedRecord.updatedAt;
      changed = true;
    }

    records.push({
      accountId: id,
      accountName,
      currency,
      spentToday,
      isLinked,
      linkedProjectId,
      updatedAt,
    });
  }

  return { records, changed };
};

export interface SpendAnomaly {
  accountId: string;
  previous: number;
  current: number;
  percent: number;
  currency?: string | null;
}

export const detectSpendAnomalies = (
  previous: MetaAccountLinkRecord[],
  fetched: MetaAdAccount[] | null,
  options: { minPercent?: number; minDelta?: number } = {},
): Map<string, SpendAnomaly> => {
  const minPercent = options.minPercent ?? 100;
  const minDelta = options.minDelta ?? 30;
  const previousMap = new Map(previous.map((item) => [item.accountId, item.spentToday ?? null]));
  const anomalies = new Map<string, SpendAnomaly>();

  for (const account of fetched ?? []) {
    if (account.spend === undefined || account.spend === null) {
      continue;
    }
    const previousValue = previousMap.get(account.id);
    if (previousValue === undefined || previousValue === null || previousValue <= 0) {
      continue;
    }
    const diff = account.spend - previousValue;
    if (diff <= 0 || diff < minDelta) {
      continue;
    }
    const percent = (diff / previousValue) * 100;
    if (percent < minPercent) {
      continue;
    }
    anomalies.set(account.id, {
      accountId: account.id,
      previous: previousValue,
      current: account.spend,
      percent,
      currency: normalizeCurrency(account.spendCurrency ?? account.currency ?? null),
    });
  }

  return anomalies;
};
