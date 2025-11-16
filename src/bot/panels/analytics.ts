import { loadAnalyticsOverview } from "../data";
import { buildAnalyticsOverviewMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const overview = await loadAnalyticsOverview(runtime.kv, runtime.r2, userId);
  return {
    text: buildAnalyticsOverviewMessage(overview),
    keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:main" }]] },
  };
};
