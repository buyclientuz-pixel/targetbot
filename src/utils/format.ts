import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { loadEnv } from "./env";

dayjs.extend(utc);
dayjs.extend(timezone);

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(date: Date | string): string {
  const { DEFAULT_TZ } = loadEnv();
  return dayjs(date).tz(DEFAULT_TZ).format("DD.MM.YYYY HH:mm");
}
