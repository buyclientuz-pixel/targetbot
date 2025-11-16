import { requireProjectRecord } from "../../domain/spec/project";
import { ensureProjectSettings } from "../../domain/project-settings";
import { getPortalSyncState } from "../../domain/portal-sync";
import type { InlineKeyboardMarkup } from "../types";
import type { PanelRenderer } from "./types";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const PERIOD_LABELS: Record<string, string> = {
  today: "сегодня",
  yesterday: "вчера",
  week: "неделя",
  month: "месяц",
  max: "максимум",
};

const formatPeriodList = (periods: string[]): string => {
  if (periods.length === 0) {
    return "—";
  }
  return periods.map((period) => PERIOD_LABELS[period] ?? period).join(", ");
};

const formatDateTime = (value: string | null, timezone: string): string => {
  if (!value) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildPortalKeyboard = (
  projectId: string,
  portalUrl: string,
  portalEnabled: boolean,
): InlineKeyboardMarkup => {
  const rows: InlineKeyboardMarkup["inline_keyboard"] = [];
  if (!portalUrl) {
    rows.push([{ text: "🚀 Создать портал", callback_data: `project:portal-create:${projectId}` }]);
  } else {
    rows.push([{ text: "🌐 Открыть портал", url: portalUrl }]);
    rows.push([
      {
        text: portalEnabled ? "⏸️ Остановить обновления" : "▶️ Включить обновления",
        callback_data: `project:portal-toggle:${projectId}`,
      },
    ]);
    rows.push([{ text: "🔄 Обновить данные", callback_data: `project:portal-sync:${projectId}` }]);
    rows.push([{ text: "🗑 Удалить портал", callback_data: `project:portal-delete:${projectId}` }]);
  }
  rows.push([{ text: "⬅️ Назад", callback_data: `project:card:${projectId}` }]);
  return { inline_keyboard: rows };
};

export const render: PanelRenderer = async ({ runtime, params }) => {
  const projectId = params[0];
  if (!projectId) {
    return { text: "Проект не найден.", keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:projects" }]] } };
  }
  const [project, settings, syncState] = await Promise.all([
    requireProjectRecord(runtime.kv, projectId),
    ensureProjectSettings(runtime.kv, projectId),
    getPortalSyncState(runtime.kv, projectId),
  ]);
  const timezone = runtime.defaultTimezone ?? "UTC";
  const lines: string[] = [];
  lines.push(`🧩 Портал проекта <b>${escapeHtml(project.name)}</b>`);
  lines.push(
    project.portalUrl
      ? `Ссылка: <a href="${project.portalUrl}">${project.portalUrl}</a>`
      : "Ссылка не создана. Нажмите кнопку ниже, чтобы активировать портал.",
  );
  lines.push(`Автообновление: ${settings.portalEnabled ? "включено" : "выключено"}`);
  lines.push(`Периоды синхронизации: ${formatPeriodList(syncState.periodKeys)}`);
  lines.push(`Последнее обновление: ${formatDateTime(syncState.lastSuccessAt, timezone)}`);
  if (syncState.lastErrorAt) {
    const message = syncState.lastErrorMessage ? escapeHtml(syncState.lastErrorMessage) : "Неизвестная ошибка";
    lines.push(`Последняя ошибка: ${formatDateTime(syncState.lastErrorAt, timezone)} — ${message}`);
  }
  lines.push("");
  lines.push("Используйте кнопки, чтобы управлять порталом: создавать, останавливать или вручную обновлять данные.");

  return {
    text: lines.join("\n"),
    keyboard: buildPortalKeyboard(projectId, project.portalUrl, settings.portalEnabled),
  };
};
