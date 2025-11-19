export interface ManualBillingInput {
  amount: number;
  date: string;
  status: string | null;
}

const AMOUNT_PATTERN = /([0-9]+(?:[.,][0-9]+)?)/;
const DATE_PATTERN = /(\d{4}-\d{2}-\d{2}|\d{2}[.]\d{2}[.]\d{4})/;

export const parseManualBillingInput = (input: string): ManualBillingInput => {
  const amountMatch = input.match(AMOUNT_PATTERN);
  if (!amountMatch) {
    throw new Error("Не удалось распознать сумму");
  }
  const rawAmount = amountMatch[1].replace(",", ".");
  const amount = Number.parseFloat(rawAmount);
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error("Сумма должна быть больше нуля");
  }

  const rest = input.slice(amountMatch.index! + amountMatch[0].length).trim();
  if (!rest) {
    throw new Error("Введите дату после суммы");
  }
  const dateMatch = rest.match(DATE_PATTERN);
  if (!dateMatch) {
    throw new Error("Используйте формат даты YYYY-MM-DD или DD.MM.YYYY");
  }
  const date = dateMatch[0];
  const status = rest.slice(dateMatch.index! + dateMatch[0].length).trim();

  return { amount, date, status: status.length ? status : null };
};
