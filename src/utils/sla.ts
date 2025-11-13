import { EnvBindings, listProjects, listLeads, appendReportRecord, saveReportAsset } from "./storage";
import { loadReminderSettings, formatDurationMinutes } from "./reminders";
import { createId } from "./ids";
import { JsonObject, LeadRecord, ProjectRecord, ReportChannel, ReportRecord } from "../types";

const MULTI_PROJECT_ID = "__multi__";
const MINUTE_MS = 60 * 1000;
const MAX_INLINE_ROWS = 20;

export interface SlaReportRow {
  projectId: string;
  projectName: string;
  leadId: string;
  leadName: string;
  phone?: string;
  status: LeadRecord["status"];
  source: string;
  createdAt: string;
  ageMinutes: number;
  ageLabel: string;
  overdue: boolean;
}

export interface SlaReportData {
  thresholdMinutes: number;
  rows: SlaReportRow[];
  projectCount: number;
  totalLeads: number;
  overdueLeads: number;
  projectIds: string[];
  csv: string;
  text: string;
}

export interface BuildSlaReportOptions {
  projectIds?: string[];
  thresholdMinutes?: number;
}

const csvEscape = (value: string): string => {
  if (value.includes("\"")) {
    return `"${value.replace(/\"/g, '""')}"`;
  }
  if (value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const leadStatusLabel = (status: LeadRecord["status"]): string => {
  return status === "done" ? "обработан" : "ожидает";
};

const normalizeProjectIds = (projectIds?: string[]): string[] | undefined => {
  if (!projectIds || !projectIds.length) {
    return undefined;
  }
  const unique = new Set<string>();
  projectIds.forEach((id) => {
    if (typeof id === "string" && id.trim()) {
      unique.add(id.trim());
    }
  });
  return unique.size ? Array.from(unique) : undefined;
};

const collectSlaRows = async (
  env: EnvBindings & Record<string, unknown>,
  projects: ProjectRecord[],
  thresholdMinutes: number,
): Promise<SlaReportRow[]> => {
  const rows: SlaReportRow[] = [];
  const now = Date.now();
  await Promise.all(
    projects.map(async (project) => {
      const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
      leads.forEach((lead) => {
        const created = Date.parse(lead.createdAt);
        const ageMinutes = Number.isNaN(created) ? 0 : Math.max(0, Math.floor((now - created) / MINUTE_MS));
        const overdue = lead.status === "new" && ageMinutes > thresholdMinutes;
        rows.push({
          projectId: project.id,
          projectName: project.name,
          leadId: lead.id,
          leadName: lead.name || "Без имени",
          phone: lead.phone || undefined,
          status: lead.status,
          source: lead.source,
          createdAt: lead.createdAt,
          ageMinutes,
          ageLabel: formatDurationMinutes(ageMinutes),
          overdue,
        });
      });
    }),
  );
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) {
      return a.overdue ? -1 : 1;
    }
    if (b.ageMinutes !== a.ageMinutes) {
      return b.ageMinutes - a.ageMinutes;
    }
    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
      return 0;
    }
    return timeB - timeA;
  });
  return rows;
};

export const buildSlaReport = async (
  env: EnvBindings & Record<string, unknown>,
  options: BuildSlaReportOptions = {},
): Promise<SlaReportData> => {
  const projectFilter = normalizeProjectIds(options.projectIds);
  const [projects, reminderConfig] = await Promise.all([
    listProjects(env),
    loadReminderSettings(env),
  ]);
  const threshold = Math.max(1, options.thresholdMinutes ?? reminderConfig.values.leadThresholdMinutes);
  const targetProjects = projectFilter
    ? projects.filter((project) => projectFilter.includes(project.id))
    : projects;
  const rows = await collectSlaRows(env, targetProjects, threshold);
  const projectCount = targetProjects.length;
  const overdueLeads = rows.filter((row) => row.overdue).length;
  const csvLines = [
    [
      "project_id",
      "project_name",
      "lead_id",
      "lead_name",
      "phone",
      "status",
      "source",
      "created_at",
      "age_minutes",
      "age_label",
      "overdue",
    ].join(","),
  ];
  rows.forEach((row) => {
    csvLines.push(
      [
        csvEscape(row.projectId),
        csvEscape(row.projectName),
        csvEscape(row.leadId),
        csvEscape(row.leadName),
        csvEscape(row.phone ?? ""),
        csvEscape(row.status),
        csvEscape(row.source),
        csvEscape(row.createdAt),
        String(row.ageMinutes),
        csvEscape(row.ageLabel),
        row.overdue ? "true" : "false",
      ].join(","),
    );
  });
  const csv = csvLines.join("\n");
  const summaryLines: string[] = [];
  summaryLines.push("⏱ SLA-экспорт");
  summaryLines.push(`Порог реакции: ${threshold} мин`);
  summaryLines.push(`Проектов: ${projectCount} · Лидов: ${rows.length} · Просрочено: ${overdueLeads}`);
  summaryLines.push("");
  rows.slice(0, MAX_INLINE_ROWS).forEach((row, index) => {
    const indicator = row.overdue ? "⚠️" : "✅";
    summaryLines.push(
      `${index + 1}. ${indicator} ${row.projectName} — ${row.leadName} · ${leadStatusLabel(row.status)} · ${row.ageLabel}` +
        (row.overdue ? " · просрочка" : ""),
    );
  });
  if (rows.length > MAX_INLINE_ROWS) {
    summaryLines.push("");
    summaryLines.push(`Показано ${MAX_INLINE_ROWS} из ${rows.length} лидов. Полный список в CSV.`);
  }
  const text = summaryLines.join("\n");
  return {
    thresholdMinutes: threshold,
    rows,
    projectCount,
    totalLeads: rows.length,
    overdueLeads,
    projectIds: targetProjects.map((project) => project.id),
    csv,
    text,
  };
};

export interface CreateSlaReportOptions extends BuildSlaReportOptions {
  title?: string;
  triggeredBy?: string;
  channel?: ReportChannel;
  scheduleId?: string;
}

export interface CreateSlaReportResult {
  record: ReportRecord;
  text: string;
  csv: string;
  data: SlaReportData;
}

export const createSlaReport = async (
  env: EnvBindings & Record<string, unknown>,
  options: CreateSlaReportOptions = {},
): Promise<CreateSlaReportResult> => {
  const data = await buildSlaReport(env, options);
  const now = new Date();
  const id = createId();
  const projectIds = normalizeProjectIds(options.projectIds) ?? Array.from(new Set(data.projectIds));
  const projectId =
    data.projectCount === 1 && data.rows.length
      ? data.rows[0].projectId
      : projectIds && projectIds.length === 1
        ? projectIds[0]
        : MULTI_PROJECT_ID;
  const title = options.title ?? `SLA-экспорт (${now.toISOString().slice(0, 10)})`;
  const metadata: JsonObject = {
    type: "sla",
    thresholdMinutes: data.thresholdMinutes,
    overdueLeads: data.overdueLeads,
    totalLeads: data.totalLeads,
  };
  if (options.scheduleId) {
    metadata.scheduleId = options.scheduleId;
  }

  const record: ReportRecord = {
    id,
    projectId,
    type: "custom",
    title,
    format: "csv",
    url: `/api/reports/${id}/content`,
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    projectIds: projectIds,
    filters: { datePreset: "custom" },
    summary: data.text,
    totals: {
      projects: data.projectCount,
      leadsTotal: data.totalLeads,
      leadsNew: data.overdueLeads,
      leadsDone: data.totalLeads - data.overdueLeads,
    },
    channel: options.channel ?? "telegram",
    generatedBy: options.triggeredBy,
    metadata,
  };
  await appendReportRecord(env, record);
  await saveReportAsset(env, record.id, data.csv, "text/csv; charset=utf-8");
  return { record, text: data.text, csv: data.csv, data };
};
