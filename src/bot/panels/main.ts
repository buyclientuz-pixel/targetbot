import { getFbAuthRecord } from "../../domain/spec/fb-auth";
import { buildMainMenuKeyboard } from "../keyboards";
import { buildMenuMessage } from "../messages";
import type { PanelRenderer } from "./types";

export const render: PanelRenderer = async ({ runtime, userId }) => {
  const fbAuth = await getFbAuthRecord(runtime.kv, userId);
  return {
    text: buildMenuMessage({ fbAuth }),
    keyboard: buildMainMenuKeyboard({ facebookAuthUrl: runtime.getFacebookOAuthUrl(userId) }),
  };
};
