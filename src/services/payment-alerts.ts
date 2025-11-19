import { getMetaToken } from "../domain/meta-tokens";
import type { Project } from "../domain/projects";
import type { ProjectSettings } from "../domain/project-settings";
import { putAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import type { KvClient } from "../infra/kv";
import { dispatchProjectMessage, type DispatchProjectMessageOptions } from "./project-messaging";
import { fetchMetaAdAccount } from "./meta-api";

interface PaymentAlertOptions {
  kv: KvClient;
  project: Project;
  settings: ProjectSettings;
  autoreports: AutoreportsRecord | null;
  token?: string;
  now?: Date;
  dispatcher?: (options: DispatchProjectMessageOptions) => Promise<unknown>;
}

const PAYMENT_ALERT_STATUSES = new Set([2, 3, 7, 11, 13]);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normaliseStatusCode = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const buildBillingLink = (accountId: string): string =>
  `https://business.facebook.com/ads/manager/billing/home/accounts/${encodeURIComponent(accountId)}`;

const formatAccountLabel = (account: { id?: string; name?: string | null }): string => {
  if (!account?.id) {
    return "неизвестен";
  }
  if (account?.name) {
    return `${account.name} (${account.id})`;
  }
  return account.id;
};

const shouldSendPaymentAlert = (status: number | null): boolean => {
  if (status == null) {
    return false;
  }
  return PAYMENT_ALERT_STATUSES.has(status);
};

export const maybeDispatchPaymentAlert = async (options: PaymentAlertOptions): Promise<void> => {
  const { kv, project, settings, token, autoreports } = options;
  if (!autoreports || !autoreports.paymentAlerts.enabled) {
    return;
  }
  if (!autoreports.paymentAlerts.sendToChat && !autoreports.paymentAlerts.sendToAdmin) {
    return;
  }
  if (!project.adsAccountId) {
    return;
  }
  if (!token) {
    return;
  }
  const facebookUserId = settings.meta.facebookUserId;
  if (!facebookUserId) {
    return;
  }

  let metaToken;
  try {
    metaToken = await getMetaToken(kv, facebookUserId);
  } catch (error) {
    console.warn("[alerts] unable to load meta token", { projectId: project.id, error });
    return;
  }

  let account: Awaited<ReturnType<typeof fetchMetaAdAccount>>;
  try {
    account = await fetchMetaAdAccount({ accountId: project.adsAccountId, accessToken: metaToken.accessToken });
  } catch (error) {
    console.warn("[alerts] failed to load ad account", { projectId: project.id, error });
    return;
  }

  const status = normaliseStatusCode(account.account_status);
  const blocked = shouldSendPaymentAlert(status);

  if (!blocked) {
    if (autoreports.paymentAlerts.lastAccountStatus != null) {
      const nextRecord: AutoreportsRecord = {
        ...autoreports,
        paymentAlerts: { ...autoreports.paymentAlerts, lastAccountStatus: null },
      };
      await putAutoreportsRecord(kv, project.id, nextRecord);
    }
    return;
  }

  if (autoreports.paymentAlerts.lastAccountStatus === status) {
    return;
  }

  const dispatcher = options.dispatcher ?? dispatchProjectMessage;
  const nowIso = (options.now ?? new Date()).toISOString();
  const accountLabel = formatAccountLabel(account);
  const messageLines = [
    "🚨 Meta остановила показ рекламы",
    `Проект: <b>${escapeHtml(project.name)}</b>`,
    `Рекламный аккаунт <b>${escapeHtml(accountLabel)}</b> отключён — Facebook не смог списать деньги с привязанной карты.`,
    "Пополните карту или оплатите задолженность в Billing, иначе кампании останутся остановлены.",
    `Billing: ${buildBillingLink(account.id ?? project.adsAccountId)}`,
  ];
  const text = messageLines.join("\n");

  if (autoreports.paymentAlerts.sendToChat) {
    await dispatcher({ kv, project, settings, token, text, route: "CHAT" }).catch(() => undefined);
  }
  if (autoreports.paymentAlerts.sendToAdmin) {
    await dispatcher({ kv, project, settings, token, text, route: "ADMIN" }).catch(() => undefined);
  }

  const nextRecord: AutoreportsRecord = {
    ...autoreports,
    paymentAlerts: {
      ...autoreports.paymentAlerts,
      lastAccountStatus: status,
      lastAlertAt: nowIso,
    },
  };
  await putAutoreportsRecord(kv, project.id, nextRecord);
};
