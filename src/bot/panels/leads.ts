import { ensureProjectSettings } from "../../domain/project-settings";
import type { ProjectLeadsListRecord } from "../../domain/spec/project-leads";
import { loadProjectBundle } from "../data";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";
import { buildLeadsMessage } from "../messages";
import { buildLeadsKeyboard } from "../keyboards";
import { refreshProjectLeads } from "../../services/project-leads-sync";
import { loadProjectLeadsView } from "../../services/project-leads-view";
import { parseLeadsPanelState, toLeadsPanelContext } from "../leads-panel-state";

const fallbackKeyboard: InlineKeyboardMarkup = { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] };
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
  const state = parseLeadsPanelState(params, 0);
  const projectId = state.projectId;
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
  const settings = await ensureProjectSettings(runtime.kv, projectId);
  const timeZone = bundle.project.settings?.timezone ?? runtime.defaultTimezone ?? null;
  const view = await loadProjectLeadsView(runtime.r2, projectId, {
    periodKey: state.periodKey,
    timeZone,
    from: state.from,
    to: state.to,
  });
  let panelContext = toLeadsPanelContext(state);
  if (panelContext.mode === "form") {
    const targetFormId = panelContext.formId ?? null;
    const leadsForForm = view.leads.filter((lead) => (lead.formId ?? null) === targetFormId);
    const maxPage = Math.max(Math.ceil(leadsForForm.length / 5) - 1, 0);
    if (panelContext.page > maxPage) {
      panelContext = { ...panelContext, page: maxPage };
    }
  }
  return {
    text: buildLeadsMessage(bundle.project, view, panelContext, settings.leads),
    keyboard: buildLeadsKeyboard(projectId, view, panelContext, settings.leads),
  };
};
