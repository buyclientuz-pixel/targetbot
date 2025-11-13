import { MetaAdAccount, ProjectSummary, ReportRecord, ReportType } from "../types";
import { EnvBindings, appendReportRecord, loadMetaToken, saveReportAsset } from "./storage";
import { summarizeProjects, sortProjectSummaries } from "./projects";
import { createId } from "./ids";
import { fetchAdAccounts } from "./meta";
import { escapeHtml } from "./html";

const GLOBAL_PROJECT_ID = "__multi__";

export interface GenerateReportOptions {
  type?: ReportType;
  title?: string;
  projectIds?: string[];
  format?: ReportRecord["format"];
  datePreset?: string;
  since?: string;
  until?: string;
  includeMeta?: boolean;
  channel?: ReportRecord["channel"];
  triggeredBy?: string;
  command?: string;
}

export interface GenerateReportResult {
  record: ReportRecord;
  text: string;
  html: string;
}

const resolveFilters = (options: GenerateReportOptions) => {
  const filters = {
    datePreset: options.datePreset,
    since: options.since,
    until: options.until,
  };
  if (!filters.datePreset && !filters.since && !filters.until) {
    filters.datePreset = "today";
  }
  return filters;
};

const describePeriod = (filters: { datePreset?: string; since?: string; until?: string }): string => {
  if (filters.datePreset && filters.datePreset.trim()) {
    return filters.datePreset.trim();
  }
  const since = filters.since?.trim();
  const until = filters.until?.trim();
  if (since && until && since !== until) {
    return `${since} → ${until}`;
  }
  if (since || until) {
    return since || until || "custom";
  }
  return "today";
};

const accountSpendMap = async (
  env: EnvBindings & Record<string, unknown>,
  includeMeta: boolean,
  filters: { datePreset?: string; since?: string; until?: string },
): Promise<Map<string, MetaAdAccount>> => {
  if (!includeMeta) {
    return new Map();
  }
  try {
    const token = await loadMetaToken(env);
    if (!token || token.status !== "valid") {
      return new Map();
    }
    const accounts = await fetchAdAccounts(env, token, {
      includeSpend: true,
      includeCampaigns: false,
      datePreset: filters.datePreset,
      since: filters.since,
      until: filters.until,
    });
    const map = new Map<string, MetaAdAccount>();
    for (const account of accounts) {
      map.set(account.id, account);
    }
    return map;
  } catch (error) {
    console.warn("Failed to collect Meta spend for report", error);
    return new Map();
  }
};

const formatSpend = (account: MetaAdAccount | undefined): string | undefined => {
  if (!account) {
    return undefined;
  }
  if (account.spendFormatted) {
    return account.spendPeriod ? `${account.spendFormatted} · ${account.spendPeriod}` : account.spendFormatted;
  }
  if (account.spend !== undefined) {
    const amount = account.spend.toFixed(2);
    return account.spendCurrency ? `${amount} ${account.spendCurrency}` : amount;
  }
  return undefined;
};

const billingLabel = (summary: ProjectSummary): string => {
  const billing = summary.billing;
  if (!billing || billing.status === "missing") {
    return "не настроена";
  }
  const statusMap: Record<string, string> = {
    active: "активен",
    pending: "ожидает",
    overdue: "просрочен",
    cancelled: "отменён",
  };
  const base = statusMap[billing.status] ?? billing.status;
  const amount = billing.amountFormatted
    ? billing.amountFormatted
    : billing.amount !== undefined
      ? `${billing.amount.toFixed(2)} ${billing.currency || "USD"}`
      : undefined;
  const period = billing.periodLabel;
  const pieces = [base];
  if (amount) {
    pieces.push(amount);
  }
  if (period) {
    pieces.push(period);
  }
  if (billing.overdue) {
    pieces.push("⚠️ требуются действия");
  }
  return pieces.join(" · ");
};

const buildPlainText = (
  title: string,
  period: string,
  rows: {
    name: string;
    leads: { total: number; new: number; done: number };
    billing: string;
    spend?: string;
  }[],
  totals: { projects: number; leadsTotal: number; leadsNew: number; leadsDone: number },
): string => {
  const lines: string[] = [];
  lines.push(`${title}`);
  lines.push(`Период: ${period}`);
  lines.push("");
  if (!rows.length) {
    lines.push("Нет проектов для отчёта.");
  } else {
    for (const row of rows) {
      lines.push(`• ${row.name}`);
      lines.push(`  Лиды: ${row.leads.total} (новые ${row.leads.new}, завершено ${row.leads.done})`);
      lines.push(`  Биллинг: ${row.billing}`);
      lines.push(`  Расход: ${row.spend ?? "—"}`);
      lines.push("");
    }
  }
  lines.push(
    `Итого проектов: ${totals.projects} · Лидов всего: ${totals.leadsTotal} · Новых: ${totals.leadsNew} · Закрыто: ${totals.leadsDone}`,
  );
  lines.push(`Сформировано: ${new Date().toLocaleString("ru-RU")}`);
  return lines.join("\n");
};

const buildHtml = (
  title: string,
  period: string,
  rows: {
    name: string;
    leads: { total: number; new: number; done: number };
    billing: string;
    spend?: string;
  }[],
  totals: { projects: number; leadsTotal: number; leadsNew: number; leadsDone: number },
): string => {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(title)}</b>`);
  lines.push(`Период: <b>${escapeHtml(period)}</b>`);
  lines.push("");
  if (!rows.length) {
    lines.push("Нет проектов для отчёта.");
  } else {
    for (const row of rows) {
      lines.push(`• <b>${escapeHtml(row.name)}</b>`);
      lines.push(
        `  Лиды: <b>${row.leads.total}</b> (новые ${row.leads.new}, завершено ${row.leads.done})`,
      );
      lines.push(`  Биллинг: ${escapeHtml(row.billing || "—")}`);
      lines.push(`  Расход: ${row.spend ? escapeHtml(row.spend) : "—"}`);
      lines.push("");
    }
  }
  lines.push(
    `Итого проектов: <b>${totals.projects}</b> · Лидов всего: <b>${totals.leadsTotal}</b> · Новых: ${totals.leadsNew} · Закрыто: ${totals.leadsDone}`,
  );
  lines.push(`Сформировано: ${escapeHtml(new Date().toLocaleString("ru-RU"))}`);
  return lines.join("\n");
};

export const generateReport = async (
  env: EnvBindings & Record<string, unknown>,
  options: GenerateReportOptions = {},
): Promise<GenerateReportResult> => {
  const filters = resolveFilters(options);
  const summaries = sortProjectSummaries(await summarizeProjects(env, { projectIds: options.projectIds }));
  const accounts = await accountSpendMap(env, options.includeMeta !== false, filters);

  const rows = summaries.map((summary) => {
    const account = summary.adAccountId ? accounts.get(summary.adAccountId) : undefined;
    return {
      id: summary.id,
      name: summary.name,
      leads: summary.leadStats,
      billing: billingLabel(summary),
      spend: formatSpend(account),
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.projects += 1;
      acc.leadsTotal += row.leads.total;
      acc.leadsNew += row.leads.new;
      acc.leadsDone += row.leads.done;
      return acc;
    },
    { projects: 0, leadsTotal: 0, leadsNew: 0, leadsDone: 0 },
  );

  const periodLabel = describePeriod(filters);
  const defaultTitle = options.type === "detailed" ? "Автоотчёт по проектам" : "Сводка по проектам";
  const title = options.title || `${defaultTitle} (${periodLabel})`;
  const format = options.format || "html";
  const plain = buildPlainText(
    title,
    periodLabel,
    rows.map((row) => ({ name: row.name, leads: row.leads, billing: row.billing, spend: row.spend })),
    totals,
  );
  const html = buildHtml(
    title,
    periodLabel,
    rows.map((row) => ({ name: row.name, leads: row.leads, billing: row.billing, spend: row.spend })),
    totals,
  );

  const now = new Date().toISOString();
  const projectIds = summaries.map((summary) => summary.id);
  const id = createId();
  const record: ReportRecord = {
    id,
    projectId: projectIds.length === 1 ? projectIds[0] : GLOBAL_PROJECT_ID,
    type: options.type || "summary",
    title,
    format,
    url: `/api/reports/${id}/content`,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
    projectIds,
    filters,
    summary: plain,
    totals,
    channel: options.channel,
    generatedBy: options.triggeredBy,
    metadata: {
      periodLabel,
      command: options.command,
      includeMeta: options.includeMeta !== false,
    },
  };

  await appendReportRecord(env, record);

  const assetContent = format === "html" ? html : plain;
  const contentType = format === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  await saveReportAsset(env, record.id, assetContent, contentType);

  return { record, text: plain, html };
};

