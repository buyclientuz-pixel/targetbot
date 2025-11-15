import { EnvBindings } from "./storage";

const DEFAULT_EXCHANGE_RATE = 12_000;

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const resolveFallbackRate = (env: Record<string, unknown>): number => {
  const fallback = parseNumber(env.PAYMENT_EXCHANGE_RATE);
  if (fallback !== null) {
    return fallback;
  }
  return DEFAULT_EXCHANGE_RATE;
};

export interface ExchangeRateResult {
  rate: number;
  source: string;
  fetchedAt: string;
}

const BANKI_ENDPOINT = "https://bank.uz/currency/get-json/USD";

interface BankiResponseEntry {
  id?: number;
  title?: string;
  nb_buy?: string;
  buy?: string;
  cb_price?: string;
  updated_at?: string;
}

const extractRateFromBanki = (entries: BankiResponseEntry[]): ExchangeRateResult | null => {
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }
  const first = entries[0];
  const rate = parseNumber(first.buy ?? first.nb_buy ?? first.cb_price);
  if (rate === null) {
    return null;
  }
  const updated =
    (typeof first.updated_at === "string" && first.updated_at.trim() ? new Date(first.updated_at).toISOString() : null) ||
    new Date().toISOString();
  return { rate, source: "banki.uz", fetchedAt: updated };
};

export const fetchUsdToUzsRate = async (env: EnvBindings & Record<string, unknown>): Promise<ExchangeRateResult> => {
  try {
    const response = await fetch(BANKI_ENDPOINT, { method: "GET" });
    if (!response.ok) {
      throw new Error(`banki.uz responded with ${response.status}`);
    }
    const data = (await response.json()) as BankiResponseEntry[];
    const result = extractRateFromBanki(data);
    if (result) {
      return result;
    }
  } catch (error) {
    console.warn("Failed to fetch exchange rate", error);
  }
  const fallback = resolveFallbackRate(env);
  return { rate: fallback, source: "fallback", fetchedAt: new Date().toISOString() };
};

export const formatUzsAmount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
};
