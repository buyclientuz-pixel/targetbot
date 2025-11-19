import { DataValidationError } from "../errors";
import { resolvePeriodRange } from "./project-insights";

const formatDateOnly = (date: Date): string => date.toISOString().split("T")[0] ?? date.toISOString();

export const resolvePortalPeriodRange = (
  periodKey: string,
  timeZone: string | null,
  from?: string | null,
  to?: string | null,
): ReturnType<typeof resolvePeriodRange> => {
  if (!from && !to) {
    return resolvePeriodRange(periodKey, timeZone ?? undefined);
  }
  if (!from || !to) {
    throw new DataValidationError("Параметры from и to должны быть указаны вместе");
  }
  const normaliseBoundary = (value: string, mode: "start" | "end"): Date => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DataValidationError(
        mode === "start" ? "Некорректное значение параметра from" : "Некорректное значение параметра to",
      );
    }
    if (!value.includes("T")) {
      const copy = new Date(date);
      if (mode === "start") {
        copy.setUTCHours(0, 0, 0, 0);
      } else {
        copy.setUTCHours(23, 59, 59, 999);
      }
      return copy;
    }
    return date;
  };
  const fromDate = normaliseBoundary(from, "start");
  const toDate = normaliseBoundary(to, "end");
  if (fromDate.getTime() > toDate.getTime()) {
    throw new DataValidationError("Параметр from должен быть раньше to");
  }
  return {
    key: "custom",
    from: fromDate,
    to: toDate,
    period: { from: formatDateOnly(fromDate), to: formatDateOnly(toDate) },
  } satisfies ReturnType<typeof resolvePeriodRange>;
};

export { formatDateOnly };
