const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export const escapeHtml = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "string" ? value : String(value);
  return stringValue.replace(/[&<>"'`]/g, (char) => escapeMap[char]);
};

export const joinHtml = (parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join("");
