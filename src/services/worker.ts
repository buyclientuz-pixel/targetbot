import { fetch } from "undici";
import { loadEnv } from "../utils/env";
import {
  BillingSnapshot,
  PortalLinkResponse,
  Project,
  ReportSchedule,
  WorkerLogEntry,
} from "../types/domain";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { WORKER_URL } = loadEnv();
  const url = `${WORKER_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker request failed (${response.status}) ${path}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function fetchReports(): Promise<unknown> {
  return request("/reports");
}

export async function fetchBillingSnapshot(): Promise<BillingSnapshot> {
  return request("/billing");
}

export async function updateBillingSpent(spent: number): Promise<void> {
  await request("/billing/update", {
    method: "POST",
    body: JSON.stringify({ spent }),
  });
}

export async function setBillingLimit(limit: number): Promise<void> {
  await request("/billing/set_limit", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
}

export async function fetchBalance(): Promise<{ balance: number }> {
  return request("/balance");
}

export async function fetchLogs(limit = 20): Promise<WorkerLogEntry[]> {
  return request(`/logs?limit=${encodeURIComponent(String(limit))}`);
}

export async function clearLogs(): Promise<void> {
  await request("/logs", { method: "DELETE" });
}

export async function sendTestWebhook(payload: unknown): Promise<void> {
  await request("/webhook", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPortalLink(projectId: string): Promise<PortalLinkResponse> {
  return request(`/portal/link?project=${encodeURIComponent(projectId)}`);
}

export async function rotatePortalLink(projectId: string): Promise<PortalLinkResponse> {
  return request(`/portal/new?project=${encodeURIComponent(projectId)}`);
}

export interface WorkerProjectResponse {
  project: Project;
  schedule?: ReportSchedule;
}
