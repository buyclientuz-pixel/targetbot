import type { WorkerEnv, MetaAccountInfo } from "../types";
import { callGraph } from "./client";
import { readStoredMetaAuth } from "./auth";

const ACCOUNT_FIELDS = [
  "id",
  "account_id",
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

const normalizeAccountId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^act_\w+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return `act_${trimmed}`;
  }
  return trimmed;
};

const collectStringTokens = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringTokens(entry));
  }

  if (typeof value === "object") {
    return collectStringTokens(Object.values(value as Record<string, unknown>));
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if (
    (firstChar === "[" && lastChar === "]") ||
    (firstChar === "{" && lastChar === "}")
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return collectStringTokens(parsed);
    } catch (_error) {
      // fall back to plain tokenization below
    }
  }

  return trimmed.split(/[\s,;]+/);
};

const parseAccountList = (value: unknown): string[] => {
  return collectStringTokens(value)
    .map((part) => normalizeAccountId(part))
    .filter(Boolean);
};

const normalizeBusinessId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed;
};

const parseBusinessList = (value: unknown): string[] => {
  return collectStringTokens(value)
    .map((part) => normalizeBusinessId(part))
    .filter(Boolean);
};

const mapAccountRecord = (account: any): MetaAccountInfo => {
  const identifier = account?.id || account?.account_id || "";
  return {
    id: String(identifier || ""),
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

const fetchDirectAdAccounts = async (env: WorkerEnv): Promise<MetaAccountInfo[]> => {
  try {
    const response = await callGraph(env as any, "me/adaccounts", {
      fields: ACCOUNT_FIELDS,
      limit: "50",
    });
    if (!response || !Array.isArray(response.data)) {
      return [];
    }
    return response.data.map(mapAccountRecord);
  } catch (error) {
    console.warn("Failed to fetch me/adaccounts", error);
    return [];
  }
};

const fetchBusinessAdAccounts = async (env: WorkerEnv): Promise<MetaAccountInfo[]> => {
  try {
    const businesses = await callGraph(env as any, "me/businesses", { limit: "25" });
    const ids: string[] = Array.isArray(businesses?.data)
      ? businesses.data
          .map((entry: any) => (typeof entry?.id === "string" ? entry.id : null))
          .filter((id: string | null): id is string => Boolean(id))
      : [];

    if (!ids.length) {
      return [];
    }

    const collected: MetaAccountInfo[] = [];
    for (const businessId of ids) {
      try {
        const [owned, client] = await Promise.all([
          callGraph(env as any, `${businessId}/owned_ad_accounts`, {
            fields: ACCOUNT_FIELDS,
            limit: "50",
          }),
          callGraph(env as any, `${businessId}/client_ad_accounts`, {
            fields: ACCOUNT_FIELDS,
            limit: "50",
          }),
        ]);

        const ownedAccounts = Array.isArray(owned?.data) ? owned.data.map(mapAccountRecord) : [];
        const clientAccounts = Array.isArray(client?.data) ? client.data.map(mapAccountRecord) : [];
        collected.push(...ownedAccounts, ...clientAccounts);
      } catch (error) {
        console.warn(`Failed to fetch ad accounts for business ${businessId}`, error);
      }
    }

    return collected;
  } catch (error) {
    console.warn("Failed to enumerate businesses for ad accounts", error);
    return [];
  }
};

const fetchExplicitAdAccounts = async (
  env: WorkerEnv,
  configuredIds: string[]
): Promise<MetaAccountInfo[]> => {
  const results: MetaAccountInfo[] = [];
  for (const id of configuredIds) {
    const accountId = normalizeAccountId(id);
    if (!accountId) {
      continue;
    }
    try {
      const data = await callGraph(env as any, accountId, { fields: ACCOUNT_FIELDS });
      if (data) {
        results.push(mapAccountRecord(data));
      }
    } catch (error) {
      console.warn(`Failed to fetch explicit ad account ${accountId}`, error);
    }
  }
  return results;
};

const dedupeAccounts = (accounts: MetaAccountInfo[]): MetaAccountInfo[] => {
  const seen = new Map<string, MetaAccountInfo>();
  for (const account of accounts) {
    if (!account.id) {
      continue;
    }
    if (!seen.has(account.id)) {
      seen.set(account.id, account);
      continue;
    }
    const existing = seen.get(account.id)!;
    seen.set(account.id, {
      ...existing,
      ...account,
      issues: account.issues || existing.issues,
    });
  }
  return Array.from(seen.values());
};

const resolveConfiguredAccountIds = async (env: WorkerEnv): Promise<string[]> => {
  const directKeys = ["META_ACCOUNT_IDS", "FB_ACCOUNT_IDS", "FACEBOOK_ACCOUNT_IDS", "AD_ACCOUNT_IDS"];
  for (const key of directKeys) {
    const value = env[key as keyof WorkerEnv];
    if (typeof value === "string" && value.trim()) {
      const parsed = parseAccountList(value);
      if (parsed.length) {
        return parsed;
      }
    }
  }

  try {
    const record = await readStoredMetaAuth(env);
    const stored = record?.account_id;
    if (stored && typeof stored === "string") {
      return parseAccountList(stored);
    }
  } catch (error) {
    console.warn("Failed to read stored Meta auth while resolving account ids", error);
  }

  return [];
};

const resolveConfiguredBusinessIds = (env: WorkerEnv): string[] => {
  const keys = [
    "META_BUSINESS_IDS",
    "FB_BUSINESS_IDS",
    "FACEBOOK_BUSINESS_IDS",
    "AD_BUSINESS_IDS",
  ];

  for (const key of keys) {
    const value = env[key as keyof WorkerEnv];
    if (typeof value === "string" && value.trim()) {
      const parsed = parseBusinessList(value);
      if (parsed.length) {
        return parsed;
      }
    }
  }

  return [];
};

const fetchConfiguredBusinessAccounts = async (
  env: WorkerEnv,
  businessIds: string[]
): Promise<MetaAccountInfo[]> => {
  const collected: MetaAccountInfo[] = [];

  for (const businessId of businessIds) {
    const normalized = normalizeBusinessId(businessId);
    if (!normalized) {
      continue;
    }

    try {
      const [owned, client] = await Promise.all([
        callGraph(env as any, `${normalized}/owned_ad_accounts`, {
          fields: ACCOUNT_FIELDS,
          limit: "50",
        }),
        callGraph(env as any, `${normalized}/client_ad_accounts`, {
          fields: ACCOUNT_FIELDS,
          limit: "50",
        }),
      ]);

      const ownedAccounts = Array.isArray(owned?.data) ? owned.data.map(mapAccountRecord) : [];
      const clientAccounts = Array.isArray(client?.data) ? client.data.map(mapAccountRecord) : [];
      collected.push(...ownedAccounts, ...clientAccounts);
    } catch (error) {
      console.warn(`Failed to fetch ad accounts for configured business ${normalized}`, error);
    }
  }

  return collected;
};

export const fetchAdAccounts = async (env: unknown): Promise<MetaAccountInfo[]> => {
  const workerEnv = env as WorkerEnv;

  const [directAccounts, businessAccounts, configuredIds, configuredBusinessIds] = await Promise.all([
    fetchDirectAdAccounts(workerEnv),
    fetchBusinessAdAccounts(workerEnv),
    resolveConfiguredAccountIds(workerEnv),
    Promise.resolve(resolveConfiguredBusinessIds(workerEnv)),
  ]);

  const results: MetaAccountInfo[] = [];
  results.push(...directAccounts, ...businessAccounts);

  if (configuredIds.length) {
    const explicitAccounts = await fetchExplicitAdAccounts(workerEnv, configuredIds);
    results.push(...explicitAccounts);
  }

  if (configuredBusinessIds.length) {
    const configuredBusinessAccounts = await fetchConfiguredBusinessAccounts(
      workerEnv,
      configuredBusinessIds
    );
    results.push(...configuredBusinessAccounts);
  }

  return dedupeAccounts(results);
};
