const ESCAPE_REGEX = /[&<>"']/g;
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeValue = (value: unknown): string => {
  const string = value === undefined || value === null ? "" : String(value);
  return string.replace(ESCAPE_REGEX, (char) => ESCAPE_MAP[char]);
};

export const escapeHtml = (value: unknown): string => escapeValue(value);

export const escapeAttribute = (value: unknown): string => escapeValue(value);
