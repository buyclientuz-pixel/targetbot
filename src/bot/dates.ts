export const parseDateInput = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Дата не может быть пустой");
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [_, year, month, day] = isoMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Неверный формат даты");
    }
    return `${year}-${month}-${day}`;
  }
  const dottedMatch = trimmed.match(/^(\d{2})[.](\d{2})[.](\d{4})$/);
  if (dottedMatch) {
    const [_, day, month, year] = dottedMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Неверный формат даты");
    }
    return `${year}-${month}-${day}`;
  }
  throw new Error("Используйте YYYY-MM-DD или DD.MM.YYYY");
};

export const addDaysIso = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Некорректная дата");
  }
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayIsoDate = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${now.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};
