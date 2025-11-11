const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const smallNumberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return numberFormatter.format(value);
};

export const formatDecimal = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

export const formatCurrency = (value: number | null | undefined, currency = "USD"): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
};

export const formatFrequency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return smallNumberFormatter.format(value);
};

export const formatDateTime = (
  isoDate: string | null | undefined,
  timeZone = "Asia/Tashkent"
): string => {
  if (!isoDate) {
    return "—";
  }
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return isoDate;
    }
    return date.toLocaleString("ru-RU", { timeZone });
  } catch (_error) {
    return isoDate;
  }
};

export const formatDate = (
  isoDate: string | null | undefined,
  timeZone = "Asia/Tashkent"
): string => {
  if (!isoDate) {
    return "—";
  }
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return isoDate;
    }
    return date.toLocaleDateString("ru-RU", { timeZone });
  } catch (_error) {
    return isoDate;
  }
};

export const kFormatter = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  if (Math.abs(value) < 1000) {
    return formatNumber(value);
  }
  return `${smallNumberFormatter.format(value / 1000)}K`;
};

const normalizeStatus = (status: string | null | undefined): string => {
  if (!status) {
    return "";
  }
  return String(status).trim().toLowerCase();
};

export const metaAccountStatusIcon = (status: string | null | undefined): string => {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return "⚪️";
  }
  if (normalized === "1" || normalized.includes("active") || normalized.includes("approved")) {
    return "🟢";
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("review") ||
    normalized.includes("await") ||
    normalized === "0"
  ) {
    return "🟡";
  }
  if (
    normalized === "2" ||
    normalized === "3" ||
    normalized.includes("disable") ||
    normalized.includes("suspend") ||
    normalized.includes("closed")
  ) {
    return "⚫️";
  }
  return "⚪️";
};
