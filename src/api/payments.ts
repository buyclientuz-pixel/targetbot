import { jsonResponse } from "../utils/http";
import { createId } from "../utils/ids";
import { EnvBindings, listPayments, savePayments } from "../utils/storage";
import { ApiError, ApiSuccess, PaymentRecord, PaymentStatus } from "../types";

const ensureEnv = (env: unknown): EnvBindings => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings;
};

const parsePaymentStatus = (value: unknown): PaymentStatus => {
  if (value === "active" || value === "overdue" || value === "pending" || value === "cancelled") {
    return value;
  }
  return "pending";
};

const sanitizeCurrency = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toUpperCase();
  }
  return "USD";
};

const sanitizeNotes = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 500);
  }
  return undefined;
};

const ensureIsoDate = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
};

const ensureAmount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2));
    }
  }
  return 0;
};

const loadPaymentCollection = async (env: EnvBindings, projectId?: string | null) => {
  const payments = await listPayments(env);
  if (!projectId) {
    return payments;
  }
  return payments.filter((payment) => payment.projectId === projectId);
};

const savePaymentCollection = async (env: EnvBindings, payments: PaymentRecord[]): Promise<void> => {
  await savePayments(env, payments);
};

export const handlePaymentsList = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const payments = await loadPaymentCollection(bindings, projectId);
    const payload: ApiSuccess<PaymentRecord[]> = { ok: true, data: payments };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handlePaymentsCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const periodStart = ensureIsoDate(body.periodStart, now);
    const periodEnd = ensureIsoDate(body.periodEnd, periodStart);
    const paidAt =
      body.paidAt === null
        ? null
        : body.paidAt
        ? ensureIsoDate(body.paidAt, now)
        : null;
    const payment: PaymentRecord = {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : createId(),
      projectId: typeof body.projectId === "string" ? body.projectId : "",
      amount: ensureAmount(body.amount),
      currency: sanitizeCurrency(body.currency),
      status: parsePaymentStatus(body.status),
      periodStart,
      periodEnd,
      paidAt,
      notes: sanitizeNotes(body.notes),
      createdAt: now,
      updatedAt: now,
    };
    if (!payment.projectId) {
      throw new Error("projectId is required");
    }
    const payments = await listPayments(bindings);
    const existingIndex = payments.findIndex((entry) => entry.id === payment.id);
    if (existingIndex >= 0) {
      throw new Error("Payment with this id already exists");
    }
    payments.push(payment);
    await savePaymentCollection(bindings, payments);
    const payload: ApiSuccess<PaymentRecord> = { ok: true, data: payment };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handlePaymentUpdate = async (
  request: Request,
  env: unknown,
  paymentId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = (await request.json()) as Record<string, unknown>;
    const payments = await listPayments(bindings);
    const index = payments.findIndex((entry) => entry.id === paymentId);
    if (index < 0) {
      return jsonResponse({ ok: false, error: "Payment not found" }, { status: 404 });
    }
    const current = payments[index];
    const updated: PaymentRecord = {
      ...current,
      amount: body.amount !== undefined ? ensureAmount(body.amount) : current.amount,
      currency: body.currency !== undefined ? sanitizeCurrency(body.currency) : current.currency,
      status: body.status !== undefined ? parsePaymentStatus(body.status) : current.status,
      periodStart:
        body.periodStart !== undefined
          ? ensureIsoDate(body.periodStart, current.periodStart)
          : current.periodStart,
      periodEnd:
        body.periodEnd !== undefined
          ? ensureIsoDate(body.periodEnd, current.periodEnd)
          : current.periodEnd,
      paidAt:
        body.paidAt !== undefined
          ? body.paidAt === null
            ? null
            : ensureIsoDate(body.paidAt, current.paidAt ?? current.updatedAt)
          : current.paidAt ?? null,
      notes: body.notes !== undefined ? sanitizeNotes(body.notes) : current.notes,
      updatedAt: new Date().toISOString(),
    };
    payments[index] = updated;
    await savePaymentCollection(bindings, payments);
    const payload: ApiSuccess<PaymentRecord> = { ok: true, data: updated };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handlePaymentDelete = async (
  _request: Request,
  env: unknown,
  paymentId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const payments = await listPayments(bindings);
    const filtered = payments.filter((entry) => entry.id !== paymentId);
    if (filtered.length === payments.length) {
      return jsonResponse({ ok: false, error: "Payment not found" }, { status: 404 });
    }
    await savePaymentCollection(bindings, filtered);
    const payload: ApiSuccess<{ id: string }> = { ok: true, data: { id: paymentId } };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
