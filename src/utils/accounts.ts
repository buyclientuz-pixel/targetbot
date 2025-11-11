import { ProjectCard, ProjectReport } from "../types";
import { readJsonFromR2 } from "./r2";

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const extractReportSpend = (
  report: ProjectReport | null,
): { value: number | null; label: string | null } => {
  if (!report || !report.summary) {
    return { value: null, label: null };
  }
  const summary = report.summary as Record<string, unknown>;
  const candidateKeys = ["today_spend", "spend_today", "todaySpend", "spendDaily", "daily_spend"];
  for (const key of candidateKeys) {
    if (key in summary) {
      const value = numberOrNull((summary as any)[key]);
      if (value !== null) {
        return { value, label: "Сегодня" };
      }
    }
  }
  if (summary && typeof (summary as any).today === "object" && (summary as any).today !== null) {
    const todaySpend = numberOrNull((summary as any).today.spend);
    if (todaySpend !== null) {
      return { value: todaySpend, label: "Сегодня" };
    }
  }
  const spendValue = numberOrNull((summary as any).spend);
  const periodLabel = typeof report.period_label === "string" && report.period_label.trim()
    ? report.period_label.trim()
    : typeof (summary as any).period_label === "string" && (summary as any).period_label.trim()
    ? ((summary as any).period_label as string).trim()
    : report.period || null;
  return { value: spendValue, label: periodLabel ? String(periodLabel) : null };
};

export const resolveAccountSpend = async (
  env: unknown,
  project: ProjectCard | null,
): Promise<{ value: number | null; label: string | null; currency: string } | null> => {
  if (!project) {
    return null;
  }
  const currency = project.currency || project.billing?.currency || "USD";
  try {
    const report = await readJsonFromR2<ProjectReport>(env as any, `reports/${project.id}.json`);
    const spend = extractReportSpend(report);
    if (spend.value !== null) {
      return { value: spend.value, label: spend.label, currency };
    }
  } catch (_error) {
    // ignore report errors
  }
  if (project.summary && typeof project.summary.spend === "number") {
    return {
      value: project.summary.spend,
      label:
        typeof (project.summary as any).period_label === "string"
          ? ((project.summary as any).period_label as string).trim()
          : null,
      currency,
    };
  }
  return { value: null, label: null, currency };
};

export const buildChatLabel = (project: ProjectCard | null): string | null => {
  if (!project) {
    return null;
  }
  if (project.chat_link && project.chat_link.trim()) {
    return project.chat_link.trim();
  }
  if (project.chat_username && project.chat_username.trim()) {
    return `@${project.chat_username.replace(/^@/, "")}`;
  }
  if (project.chat_id !== null && project.chat_id !== undefined) {
    const idText = String(project.chat_id).trim();
    if (idText) {
      return `ID: ${idText}`;
    }
  }
  return null;
};
