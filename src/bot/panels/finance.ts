import { loadFinanceOverview } from "../data";
import { buildFinanceOverviewMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const overview = await loadFinanceOverview(runtime.kv, runtime.r2, userId);
  return {
    text: buildFinanceOverviewMessage(overview),
    keyboard: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "panel:main" }]] },
  };
};
