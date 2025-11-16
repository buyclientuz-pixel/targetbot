import { DataValidationError } from "../errors";

export const assertString = (value: unknown, field: string, { allowEmpty = false } = {}): string => {
  if (typeof value !== "string") {
    throw new DataValidationError(`Expected ${field} to be a string`);
  }
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) {
    throw new DataValidationError(`${field} must not be empty`);
  }
  return trimmed;
};

export const assertOptionalString = (value: unknown, field: string): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new DataValidationError(`Expected ${field} to be a string or null`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const assertNumber = (value: unknown, field: string): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new DataValidationError(`Expected ${field} to be a number`);
};

export const assertBoolean = (value: unknown, field: string): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  throw new DataValidationError(`Expected ${field} to be a boolean`);
};

export const assertIsoDate = (value: unknown, field: string): string => {
  const str = assertString(value, field);
  if (Number.isNaN(Date.parse(str))) {
    throw new DataValidationError(`Expected ${field} to be an ISO date string`);
  }
  return str;
};

export const assertStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) {
    throw new DataValidationError(`Expected ${field} to be an array`);
  }
  return value.map((item, index) => assertString(item, `${field}[${index}]`));
};

export const assertOptionalNumber = (value: unknown, field: string): number | null => {
  if (value == null) {
    return null;
  }
  return assertNumber(value, field);
};

export const assertOptionalBoolean = (value: unknown, field: string): boolean | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new DataValidationError(`Expected ${field} to be a boolean or null`);
};

export const assertEnum = <const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] => {
  const str = assertString(value, field);
  if (allowed.includes(str as T[number])) {
    return str as T[number];
  }
  throw new DataValidationError(
    `Expected ${field} to be one of: ${allowed.join(", ")}, received '${str}'`,
  );
};

export const assertOptionalEnum = <const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] | null => {
  if (value == null) {
    return null;
  }
  return assertEnum(value, field, allowed);
};
