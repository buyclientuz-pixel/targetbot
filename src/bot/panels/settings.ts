import { getUserSettingsRecord } from "../../domain/spec/user-settings";
import { buildSettingsMessage } from "../messages";
import { buildSettingsKeyboard } from "../keyboards";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const settings =
    (await getUserSettingsRecord(runtime.kv, userId)) ?? {
      userId,
      language: "ru",
      timezone: runtime.defaultTimezone,
      updatedAt: new Date().toISOString(),
    };
  return {
    text: buildSettingsMessage(settings),
    keyboard: buildSettingsKeyboard(settings),
  };
};
