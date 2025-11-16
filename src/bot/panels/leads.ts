import { loadProjectBundle } from "../data";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";
import type { ProjectLeadsListRecord } from "../../domain/spec/project-leads";
import { buildLeadsMessage } from "../messages";
import { buildLeadsKeyboard } from "../keyboards";
import { refreshProjectLeads } from "../../services/project-leads-sync";

const fallbackKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] };
const DEFAULT_STATUS: ProjectLeadsListRecord["leads"][number]["status"] = "new";
const LEADS_REFRESH_WINDOW_MS = 10 * 60 * 1000;

const needsLeadRefresh = (record: ProjectLeadsListRecord): boolean => {
  if (!record.syncedAt) {
    return true;
  }
  const syncedAt = Date.parse(record.syncedAt);
  if (!Number.isFinite(syncedAt)) {
    return true;
  }
  if (!Array.isArray(record.leads) || record.leads.length === 0) {
    return true;
  }
  return Date.now() - syncedAt > LEADS_REFRESH_WINDOW_MS;
};

export const render: PanelRenderer = async ({ runtime, params }) => {
  const status = (params[0] as ProjectLeadsListRecord["leads"][number]["status"]) ?? DEFAULT_STATUS;
  const projectId = params[1];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: fallbackKeyboard };
  }
  let bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
  if (bundle.project.adAccountId && needsLeadRefresh(bundle.leads)) {
    try {
      await refreshProjectLeads(runtime.kv, runtime.r2, projectId);
      bundle = await loadProjectBundle(runtime.kv, runtime.r2, projectId);
    } catch (error) {
      console.warn(`[bot:leads] Failed to refresh leads for ${projectId}: ${(error as Error).message}`);
    }
  }
  return {
    text: buildLeadsMessage(bundle.project, bundle.leads, status),
    keyboard: buildLeadsKeyboard(projectId, bundle.leads.leads, status),
  };
};
