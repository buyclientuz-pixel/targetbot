export interface ManualBillingInput {
  amount: number;
  date: string;
}

const AMOUNT_PATTERN = /([0-9]+(?:[.,][0-9]+)?)/;

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

  return { amount, date: rest };
};
