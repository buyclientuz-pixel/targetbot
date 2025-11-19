import type { InlineKeyboardMarkup } from "../types";
import type { KvClient } from "../../infra/kv";
import type { R2Client } from "../../infra/r2";

export interface PanelRuntime {
  kv: KvClient;
  r2: R2Client;
  workerUrl: string;
  defaultTimezone: string;
  getFacebookOAuthUrl: (userId: number) => string | null;
  telegramToken: string;
  telegramSecret: string;
  adminIds: number[];
  facebookLongToken?: string | null;
  facebookToken?: string | null;
}

export interface PanelRendererOptions {
  runtime: PanelRuntime;
  userId: number;
  chatId: number;
  panelId: string;
  params: string[];
}

export interface PanelRenderResult {
  text: string;
  keyboard: InlineKeyboardMarkup;
}

export type PanelRenderer = (options: PanelRendererOptions) => Promise<PanelRenderResult>;
