import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getProjectObjective, getProjectInsights } from "./meta";
import {
  BillingSnapshot,
  DigestPreset,
  Project,
  ReportSchedule,
} from "../types/domain";
import { formatCurrency, formatPercent } from "../utils/format";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface DigestResult {
  title: string;
  lines: string[];
  totals?: BillingSnapshot;
}

export async function buildDigest(
  project: Project,
  preset: DigestPreset
): Promise<DigestResult> {
  const objective = await getProjectObjective(project.id);
  if (!objective) {
    return {
      title: `📊 Отчёт по проекту ${project.projectName ?? project.id}`,
      lines: ["Цель кампании не настроена."],
    };
  }

  const insights = await getProjectInsights(project.id, objective.objective, preset);

  return {
    title: `📊 ${project.projectName ?? project.id} — ${preset}`,
    lines: [JSON.stringify(insights, null, 2)],
  };
}

export async function buildBillingDigest(snapshot: BillingSnapshot): Promise<string> {
  const limitText = snapshot.limit ? `Лимит: ${formatCurrency(snapshot.limit)}` : "Лимит не задан";
  const spentText = `Расход: ${formatCurrency(snapshot.spent)}`;
  const ratio = snapshot.limit ? formatPercent(snapshot.spent / snapshot.limit) : null;
  const ratioText = ratio ? `(${ratio})` : "";
  return `🧾 Биллинг: ${spentText} ${ratioText}. ${limitText}`.trim();
}

let runnerStarted = false;

export function ensureScheduleRunner(start: () => Promise<void>): void {
  if (runnerStarted) return;
  runnerStarted = true;
  void start();
}
