const GRAPH_API_BASE = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v18.0";

export interface FacebookAdAccountRecord {
  id: string;
  name: string;
  currency: string;
  status: number;
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
  url.searchParams.set("fields", "id,name,currency,account_status");
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
      const status = Number(record?.account_status);
      accounts.push({ id, name, currency: normaliseCurrency(record?.currency), status: Number.isFinite(status) ? status : 0 });
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

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

const buildOAuthTokenUrl = (): string => `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/oauth/access_token`;

export const exchangeOAuthCode = async (options: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; expiresIn: number }> => {
  const url = new URL(buildOAuthTokenUrl());
  url.searchParams.set("client_id", options.appId);
  url.searchParams.set("client_secret", options.appSecret);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code", options.code);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Facebook OAuth exchange failed (${response.status}): ${body}`);
  }
  const payload = (await response.json()) as OAuthTokenResponse;
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
};

export const exchangeLongLivedToken = async (options: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> => {
  const url = new URL(buildOAuthTokenUrl());
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", options.appId);
  url.searchParams.set("client_secret", options.appSecret);
  url.searchParams.set("fb_exchange_token", options.shortLivedToken);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Facebook long-lived token exchange failed (${response.status}): ${body}`);
  }
  const payload = (await response.json()) as OAuthTokenResponse;
  return { accessToken: payload.access_token, expiresIn: payload.expires_in };
};
