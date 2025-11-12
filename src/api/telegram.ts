import { AlertPayload } from "../types";
import { badRequest, jsonResponse } from "../utils/http";
import { appendLogEntry } from "../utils/r2";
import { sendTelegramMessage } from "../utils/telegram";

const parsePayload = async (request: Request): Promise<AlertPayload | null> => {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return null;
    }
    const payload = body as AlertPayload;
    if (!payload.project_id || !payload.metric || payload.value === undefined || payload.threshold === undefined) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
};

const formatAlertMessage = (payload: AlertPayload): string => {
  const arrow = payload.direction === "below" ? "↓" : "↑";
  let line = "⚠️ Алерт по проекту " + payload.project_id + "\n";
  line += payload.metric.toUpperCase() + ": " + payload.value + " (" + arrow + " порога " + payload.threshold + ")";
  if (payload.campaign_id) {
    line += "\nКампания: " + payload.campaign_id;
  }
  if (payload.description) {
    line += "\n" + payload.description;
  }
  return line;
};

export const handleTelegramAlert = async (request: Request, env: Record<string, unknown>): Promise<Response> => {
  const payload = await parsePayload(request);
  if (!payload) {
    return badRequest("Invalid alert payload");
  }

  const chatId = String(env.ALERT_CHAT_ID || env.ADMIN_CHAT_ID || "");
  if (!chatId) {
    return badRequest("Alert chat not configured");
  }

  const message = formatAlertMessage(payload);
  await sendTelegramMessage(env, chatId, message);
  await appendLogEntry(env as any, {
    level: "warn",
    message: "Alert dispatched: " + payload.metric + " for " + payload.project_id,
    timestamp: new Date().toISOString(),
  });

  return jsonResponse({ ok: true });
};
