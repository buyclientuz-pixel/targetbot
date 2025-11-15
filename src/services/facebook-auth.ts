const GRAPH_API_BASE = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v18.0";

export interface FacebookAdAccountRecord {
  id: string;
  name: string;
  currency: string;
}

interface AdAccountsResponse {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string | null };
}

const normaliseString = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normaliseCurrency = (value: unknown): string => {
  const currency = normaliseString(value, "USD").toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) {
    return currency;
  }
  return "USD";
};

const buildAdAccountsUrl = (accessToken: string, after?: string): URL => {
  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/me/adaccounts`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "id,name,currency");
  url.searchParams.set("limit", "200");
  if (after) {
    url.searchParams.set("after", after);
  }
  return url;
};

export const fetchFacebookAdAccounts = async (
  accessToken: string,
): Promise<FacebookAdAccountRecord[]> => {
  if (!accessToken || accessToken.trim().length === 0) {
    throw new Error("Facebook access token is required");
  }

  const accounts: FacebookAdAccountRecord[] = [];
  let nextCursor: string | undefined;
  do {
    const url = buildAdAccountsUrl(accessToken, nextCursor);
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Facebook API error ${response.status}: ${errorBody}`);
    }
    const payload = (await response.json()) as AdAccountsResponse;
    const data = Array.isArray(payload.data) ? payload.data : [];
    for (const record of data) {
      const id = normaliseString(record?.id, "");
      const name = normaliseString(record?.name, "Без названия");
      if (!id) {
        continue;
      }
      accounts.push({ id, name, currency: normaliseCurrency(record?.currency) });
    }
    const paging = payload.paging ?? {};
    const next = typeof paging.next === "string" ? paging.next : undefined;
    if (next) {
      try {
        const parsed = new URL(next);
        nextCursor = parsed.searchParams.get("after") ?? undefined;
      } catch {
        nextCursor = undefined;
      }
    } else {
      nextCursor = undefined;
    }
  } while (nextCursor);

  return accounts;
};
