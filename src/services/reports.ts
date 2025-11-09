import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { kvGet, kvList, kvPut } from "./kv";
import { getProjectObjective, getProjectInsights } from "./meta";
import { BillingSnapshot, DigestPreset, Project, ReportSchedule } from "../types/domain";
import { formatCurrency, formatPercent } from "../utils/format";

dayjs.extend(utc);
dayjs.extend(timezone);

const PROJECT_PREFIX = "project:";
const SCHEDULE_PREFIX = "report:schedule:";

export async function getProject(projectId: string): Promise<Project | null> {
  const raw = await kvGet(`${PROJECT_PREFIX}${projectId}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as Project;
}

export async function listProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  let cursor: string | undefined;
  do {
    const { keys, cursor: next } = await kvList(PROJECT_PREFIX, cursor);
    cursor = next;
    for (const key of keys) {
      const raw = await kvGet(key);
      if (!raw) continue;
      projects.push(JSON.parse(raw) as Project);
    }
  } while (cursor);
  return projects;
}

export async function saveProject(project: Project): Promise<void> {
  await kvPut(`${PROJECT_PREFIX}${project.id}`, JSON.stringify(project));
}

export async function saveSchedule(schedule: ReportSchedule): Promise<void> {
  await kvPut(`${SCHEDULE_PREFIX}${schedule.projectId}`, JSON.stringify(schedule));
}

export async function getSchedule(projectId: string): Promise<ReportSchedule | null> {
  const raw = await kvGet(`${SCHEDULE_PREFIX}${projectId}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as ReportSchedule;
}

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
