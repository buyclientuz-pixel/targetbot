const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const pickRawBase = (input: string | undefined, fallback?: string): string => {
  const trimmed = input?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  const fallbackTrimmed = fallback?.trim();
  return fallbackTrimmed && fallbackTrimmed.length > 0 ? fallbackTrimmed : "";
};

export const normaliseBaseUrl = (input?: string, fallback?: string): string => {
  const raw = pickRawBase(input, fallback);
  if (!raw) {
    return "";
  }
  const trimmed = trimTrailingSlash(raw);
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimTrailingSlash(trimmed)}`;
};
