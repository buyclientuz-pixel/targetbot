import { htmlResponse, jsonResponse } from "../utils/http";
import { escapeAttribute, escapeHtml } from "../utils/html";
import {
  decodeMetaOAuthState,
  exchangeToken,
  fetchAdAccounts,
  fetchCampaigns,
  refreshToken,
  resolveMetaAppId,
  resolveMetaStatus,
  withMetaSettings,
} from "../utils/meta";
import { EnvBindings, loadMetaToken, saveMetaToken } from "../utils/storage";
import {
  ApiError,
  ApiSuccess,
  MetaAdAccount,
  MetaCampaign,
  MetaOAuthStatePayload,
  MetaStatusResponse,
} from "../types";
import { editTelegramMessage, sendTelegramMessage, TelegramEnv } from "../utils/telegram";

const ensureEnv = (env: unknown): (EnvBindings & TelegramEnv & Record<string, unknown>) => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & TelegramEnv & Record<string, unknown>;
};

const buildRedirectUri = (request: Request): string => {
  const url = new URL(request.url);
  url.pathname = "/auth/facebook/callback";
  url.search = "";
  return url.toString();
};

const prefersJson = (request: Request, url: URL): boolean => {
  const accept = request.headers.get("accept");
  if (accept && accept.toLowerCase().includes("application/json")) {
    return true;
  }
  const format = url.searchParams.get("format") || url.searchParams.get("response");
  if (format && format.toLowerCase() === "json") {
    return true;
  }
  return false;
};

export const handleMetaStatus = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const status = await resolveMetaStatus(metaEnv, token);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleMetaAdAccounts = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const url = new URL(request.url);
    const includeSpend = url.searchParams.get("includeSpend") === "true";
    const includeCampaigns = url.searchParams.get("includeCampaigns") === "true";
    const campaignLimitParam = url.searchParams.get("campaignLimit");
    const campaignLimit = campaignLimitParam ? Number(campaignLimitParam) : undefined;
    const datePreset = url.searchParams.get("datePreset") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;
    const accounts = await fetchAdAccounts(metaEnv, token, {
      includeSpend,
      includeCampaigns,
      campaignsLimit: Number.isFinite(campaignLimit ?? NaN) ? campaignLimit : undefined,
      datePreset,
      since,
      until,
    });
    const payload: ApiSuccess<MetaAdAccount[]> = { ok: true, data: accounts };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = {
      ok: false,
      error: (error as Error).message,
    };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleMetaCampaigns = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const token = await loadMetaToken(bindings);
    const metaEnv = await withMetaSettings(bindings);
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    if (!accountId) {
      throw new Error("accountId is required");
    }
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const datePreset = url.searchParams.get("datePreset") || undefined;
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;
    const campaigns = await fetchCampaigns(metaEnv, token, accountId, {
      limit: Number.isFinite(limit ?? NaN) ? limit : undefined,
      datePreset,
      since,
      until,
    });
    const payload: ApiSuccess<MetaCampaign[]> = { ok: true, data: campaigns };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

const renderMetaRedirectPage = (target: string): Response => {
  const escapedLink = escapeAttribute(target);
  const scriptTarget = JSON.stringify(target);
  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Переадресация на Facebook</title>
        <meta http-equiv="refresh" content="0;url=${escapedLink}" />
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; text-align: center; color: #102a43; }
          a { color: #1f75fe; text-decoration: none; font-weight: 600; }
          .card { max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 16px; box-shadow: 0 8px 30px #0f1f3d12; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Перенаправляем в Facebook</h1>
          <p>Если страница не открылась автоматически, нажмите <a href="${escapedLink}">перейти</a>.</p>
        </section>
        <script>window.location.replace(${scriptTarget});</script>
      </body>
    </html>`;
  return htmlResponse(html, {
    status: 302,
    headers: { Location: target },
  });
};

const renderMetaErrorPage = (message: string): Response => {
  const safeMessage = escapeHtml(message || "Неизвестная ошибка");
  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Ошибка авторизации Facebook</title>
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; background: #fff5f5; color: #610316; }
          .card { max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 16px; background: #fff; box-shadow: 0 8px 30px #61031610; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Не удалось открыть Facebook OAuth</h1>
          <p>${safeMessage}</p>
          <p>Проверьте настройки приложения Meta и попробуйте ещё раз.</p>
          <p><a href="/admin">Вернуться в панель</a></p>
        </section>
      </body>
    </html>`;
  return htmlResponse(html, { status: 400 });
};

const TELEGRAM_SUCCESS_MARKUP = {
  inline_keyboard: [
    [{ text: "📊 Проекты", callback_data: "cmd:projects" }],
    [{ text: "⚙ Настройки", callback_data: "cmd:settings" }],
    [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
  ],
};

const formatDateTime = (value?: string): string | null => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const buildTelegramSuccessMessage = (
  status: MetaStatusResponse,
  accounts: MetaAdAccount[],
): string => {
  const lines: string[] = [
    "<b>✅ Facebook аккаунт успешно авторизован.</b>",
  ];
  if (status.accountName) {
    lines.push(`Аккаунт: <b>${escapeHtml(status.accountName)}</b>`);
  }
  const expires = formatDateTime(status.expiresAt);
  if (expires) {
    lines.push(`Токен активен до: <b>${escapeHtml(expires)}</b>`);
  }
  if (status.issues?.length) {
    lines.push("", "⚠️ Обнаружены предупреждения:");
    status.issues.slice(0, 5).forEach((issue) => lines.push(`• ${escapeHtml(issue)}`));
  }
  if (accounts.length) {
    const list = accounts
      .slice(0, 5)
      .map((account) => {
        const spendText = account.spendFormatted
          ? ` — расход ${escapeHtml(account.spendFormatted)}${account.spendPeriod ? ` (${escapeHtml(account.spendPeriod)})` : ""}`
          : "";
        return `• ${escapeHtml(account.name)}${account.currency ? ` (${escapeHtml(account.currency)})` : ""}${spendText}`;
      })
      .join("\n");
    lines.push("", "Подключённые рекламные аккаунты:", list);
    if (accounts.length > 5) {
      lines.push(`и ещё ${accounts.length - 5} аккаунтов…`);
    }
  }
  lines.push(
    "",
    "Данные синхронизированы с веб-панелью. Используйте меню ниже, чтобы перейти к проектам или настройкам.",
  );
  return lines.join("\n");
};

const notifyTelegramOAuthSuccess = async (
  env: EnvBindings & TelegramEnv,
  state: MetaOAuthStatePayload,
  status: MetaStatusResponse,
  accounts: MetaAdAccount[],
): Promise<void> => {
  if (!state.chatId) {
    return;
  }
  const message = buildTelegramSuccessMessage(status, accounts);
  try {
    if (typeof state.messageId === "number") {
      await editTelegramMessage(env, {
        chatId: state.chatId,
        messageId: state.messageId,
        text: message,
        replyMarkup: TELEGRAM_SUCCESS_MARKUP,
      });
    } else {
      await sendTelegramMessage(env, {
        chatId: state.chatId,
        text: message,
        replyMarkup: TELEGRAM_SUCCESS_MARKUP,
      });
    }
  } catch (error) {
    console.error("Failed to notify Telegram about Meta OAuth success", error);
  }
};

const notifyTelegramOAuthFailure = async (
  env: EnvBindings & TelegramEnv,
  state: MetaOAuthStatePayload,
  message: string,
): Promise<void> => {
  if (!state.chatId) {
    return;
  }
  const lines = [
    "<b>❌ Авторизация Facebook не завершена.</b>",
    escapeHtml(message || "Неизвестная ошибка."),
    "Попробуйте пройти OAuth ещё раз позже или проверьте настройки приложения Meta.",
  ];
  const text = lines.join("\n");
  try {
    if (typeof state.messageId === "number") {
      await editTelegramMessage(env, {
        chatId: state.chatId,
        messageId: state.messageId,
        text,
        replyMarkup: TELEGRAM_SUCCESS_MARKUP,
      });
    } else {
      await sendTelegramMessage(env, {
        chatId: state.chatId,
        text,
        replyMarkup: TELEGRAM_SUCCESS_MARKUP,
      });
    }
  } catch (error) {
    console.error("Failed to notify Telegram about Meta OAuth failure", error);
  }
};

const resolveBotLinks = (
  state: MetaOAuthStatePayload,
  requestUrl: URL,
): { httpLink?: string; tgLink?: string; adminLink: string } => {
  const username = state.botUsername?.startsWith("@")
    ? state.botUsername.slice(1)
    : state.botUsername;
  const adminLink = new URL("/admin", requestUrl).toString();
  let httpLink: string | undefined;
  let tgLink: string | undefined;

  if (state.botDeeplink) {
    if (state.botDeeplink.startsWith("tg://")) {
      tgLink = state.botDeeplink;
    }
    if (/^https?:/i.test(state.botDeeplink)) {
      httpLink = state.botDeeplink;
    }
  }

  if (!httpLink && username) {
    httpLink = `https://t.me/${username}`;
  }
  if (!tgLink && username) {
    tgLink = `tg://resolve?domain=${encodeURIComponent(username)}&start=meta_oauth_success`;
  }

  return { httpLink, tgLink, adminLink };
};

const renderTelegramErrorPage = (message: string, requestUrl: URL): Response => {
  const adminLink = new URL("/admin", requestUrl).toString();
  const safeMessage = escapeHtml(message || "Неизвестная ошибка.");
  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Ошибка авторизации Facebook</title>
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; background: #fff5f5; color: #5c1625; }
          .card { max-width: 520px; margin: 0 auto; padding: 32px; border-radius: 16px; background: #ffffff; box-shadow: 0 12px 32px #61131d1f; }
          .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
          a.button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; border-radius: 12px; text-decoration: none; font-weight: 600; }
          a.primary { background: #c62828; color: #fff; }
          a.secondary { background: #fde8ea; color: #5c1625; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Авторизация не завершена</h1>
          <p>${safeMessage}</p>
          <p>Проверьте настройки приложения Meta или попробуйте снова через несколько минут.</p>
          <div class="actions">
            <a class="button primary" href="${escapeAttribute(adminLink)}">Открыть админку</a>
            <a class="button secondary" href="/auth/facebook">Попробовать ещё раз</a>
          </div>
        </section>
      </body>
    </html>`;
  return htmlResponse(html, { status: 400 });
};

const renderTelegramSuccessPage = (
  state: MetaOAuthStatePayload,
  status: MetaStatusResponse,
  accounts: MetaAdAccount[],
  requestUrl: URL,
): Response => {
  const { httpLink, tgLink, adminLink } = resolveBotLinks(state, requestUrl);
  const expires = formatDateTime(status.expiresAt);
  const accountSummary = accounts
    .slice(0, 3)
    .map((account) => {
      const spend = account.spendFormatted
        ? ` — ${escapeHtml(account.spendFormatted)}${account.spendPeriod ? ` (${escapeHtml(account.spendPeriod)})` : ""}`
        : "";
      return `<li>${escapeHtml(account.name)}${spend}</li>`;
    })
    .join("");
  const accountsBlock = accountSummary
    ? `<div class="card-section"><strong>Аккаунты:</strong><ul class="accounts">${accountSummary}</ul></div>`
    : "";

  const autoScriptParts: string[] = [];
  if (tgLink) {
    autoScriptParts.push(`setTimeout(() => { window.location.href = ${JSON.stringify(tgLink)}; }, 200);`);
  }
  if (httpLink) {
    autoScriptParts.push(`setTimeout(() => { window.location.href = ${JSON.stringify(httpLink)}; }, 1500);`);
  }
  const autoScript = autoScriptParts.length ? `<script>${autoScriptParts.join(" ")}</script>` : "";

  const html = `<!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <title>Авторизация завершена</title>
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px; background: #f7fbff; color: #1b2940; }
          .card { max-width: 560px; margin: 0 auto; padding: 32px; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 40px #0f1f3d1a; }
          .card h1 { margin-top: 0; font-size: 28px; }
          .card p { line-height: 1.5; }
          .card-section { margin-top: 16px; }
          .accounts { margin: 12px 0 0; padding-left: 20px; }
          .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
          a.button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; border-radius: 12px; text-decoration: none; font-weight: 600; }
          a.primary { background: #1f75fe; color: #fff; }
          a.secondary { background: #e7f0ff; color: #1f3b5b; }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>Готово! Токен обновлён</h1>
          <p>Facebook подтвердил авторизацию. Запись сохранена в TargetBot и доступна в админ-панели.</p>
          ${expires ? `<div class="card-section"><strong>Токен активен до:</strong> ${escapeHtml(expires)}</div>` : ""}
          ${accountsBlock}
          <div class="card-section">Вы можете закрыть это окно — бот уже отправил уведомление в Telegram.</div>
          <div class="actions">
            ${tgLink ? `<a class="button primary" href="${escapeAttribute(tgLink)}">Открыть Telegram</a>` : ""}
            ${httpLink ? `<a class="button secondary" href="${escapeAttribute(httpLink)}" target="_blank" rel="noopener">Открыть бота</a>` : ""}
            <a class="button secondary" href="${escapeAttribute(adminLink)}">Перейти в админку</a>
          </div>
        </section>
        ${autoScript}
      </body>
    </html>`;
  return htmlResponse(html);
};

export const handleMetaOAuthStart = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  const wantsJson = prefersJson(request, url);
  try {
    const bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const appId = resolveMetaAppId(metaEnv);
    if (!appId) {
      throw new Error(
        "Meta app ID is not configured (expected one of FB_APP_ID, META_APP_ID, FACEBOOK_APP_ID, FB_CLIENT_ID, META_CLIENT_ID)",
      );
    }
    const redirectUri = buildRedirectUri(request);
    const version = (metaEnv.META_GRAPH_VERSION || metaEnv.FB_GRAPH_VERSION || "v19.0") as string;
    const oauthUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    oauthUrl.searchParams.set("client_id", appId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("scope", "ads_read,leads_retrieval");
    const stateParam = url.searchParams.get("state");
    if (stateParam) {
      oauthUrl.searchParams.set("state", stateParam);
    }

    if (wantsJson) {
      return jsonResponse({ ok: true, data: { url: oauthUrl.toString() } });
    }
    return renderMetaRedirectPage(oauthUrl.toString());
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) {
      const payload: ApiError = { ok: false, error: message };
      return jsonResponse(payload, { status: 400 });
    }
    return renderMetaErrorPage(message);
  }
};

export const handleMetaOAuthCallback = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const url = new URL(request.url);
  const wantsJson = prefersJson(request, url);
  const stateParam = url.searchParams.get("state");
  const oauthState = decodeMetaOAuthState(stateParam);
  let bindings: (EnvBindings & TelegramEnv & Record<string, unknown>) | null = null;
  const code = url.searchParams.get("code");
  if (!code) {
    if (wantsJson) {
      return jsonResponse({ ok: false, error: "Missing code" }, { status: 400 });
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "error");
    redirect.searchParams.set("metaMessage", "Meta не вернула код авторизации");
    return Response.redirect(redirect.toString(), 302);
  }

  try {
    bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const redirectUri = buildRedirectUri(request);
    const token = await exchangeToken(metaEnv, code, redirectUri);
    await saveMetaToken(bindings, token);
    const [status, accounts] = await Promise.all([
      resolveMetaStatus(metaEnv, token),
      fetchAdAccounts(metaEnv, token).catch(() => [] as MetaAdAccount[]),
    ]);
    if (wantsJson) {
      const payload: ApiSuccess<MetaStatusResponse> = {
        ok: true,
        data: { ...status, accounts },
      };
      return jsonResponse(payload);
    }
    if (oauthState?.origin === "telegram") {
      if (bindings) {
        await notifyTelegramOAuthSuccess(bindings, oauthState, status, accounts);
      }
      return renderTelegramSuccessPage(oauthState, status, accounts, url);
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "success");
    if (status.expiresAt) {
      redirect.searchParams.set("metaExpires", status.expiresAt);
    }
    const accountNames = accounts.map((account) => account.name).filter(Boolean);
    redirect.searchParams.set("metaAccountTotal", String(accountNames.length));
    accountNames.slice(0, 5).forEach((name) => redirect.searchParams.append("metaAccount", name));
    return Response.redirect(redirect.toString(), 302);
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) {
      const payload: ApiError = { ok: false, error: message };
      return jsonResponse(payload, { status: 500 });
    }
    if (oauthState?.origin === "telegram") {
      if (bindings) {
        await notifyTelegramOAuthFailure(bindings, oauthState, message);
      }
      return renderTelegramErrorPage(message, url);
    }
    const redirect = new URL("/admin", url);
    redirect.searchParams.set("meta", "error");
    if (message) {
      redirect.searchParams.set("metaMessage", message.slice(0, 200));
    }
    return Response.redirect(redirect.toString(), 302);
  }
};

export const handleMetaRefresh = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const metaEnv = await withMetaSettings(bindings);
    const current = await loadMetaToken(bindings);
    if (!current) {
      throw new Error("Meta token is missing");
    }
    const refreshed = await refreshToken(metaEnv, current);
    await saveMetaToken(bindings, refreshed);
    const status = await resolveMetaStatus(metaEnv, refreshed);
    const payload: ApiSuccess<MetaStatusResponse> = { ok: true, data: status };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};
