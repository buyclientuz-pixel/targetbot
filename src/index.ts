interface Env {
  REPORTS_NAMESPACE: KVNamespace;
  BILLING_NAMESPACE: KVNamespace;
  LOGS_NAMESPACE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return handleDashboard(env);
    }

    if (url.pathname === "/reports") {
      return handleGetReports(env);
    }

    if (url.pathname === "/billing") {
      return handleGetBilling(env);
    }

    if (url.pathname === "/billing/update") {
      return handleUpdateBilling(env);
    }

    if (url.pathname === "/billing/set_limit") {
      return handleSetBillingLimit(env);
    }

    if (url.pathname.startsWith("/webhook")) {
      return handleWebhook(request, env);
    }

    if (url.pathname === "/billing/balance") {
      return handleBalance(env);
    }

    if (url.pathname === "/logs") {
      return handleGetLogs(env);
    }

    return new Response("not found", { status: 404 });
  },
};

async function handleDashboard(env: Env): Promise<Response> {
  const [projects, billing] = await Promise.all([
    loadReports(env),
    loadBillingData(env),
  ]);

  const html = renderDashboard(projects, billing);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleGetReports(env: Env): Promise<Response> {
  const reports = await loadReports(env);
  return jsonResponse(reports);
}

type StoredChat = {
  title?: string;
  tgTopicLink?: string;
};

type StoredProject = {
  projectName?: unknown;
  accountName?: unknown;
  description?: unknown;
  chats?: unknown;
};

type ProjectCard = {
  id: string;
  projectName?: string;
  accountName?: string;
  description?: string;
  chats: StoredChat[];
};

async function loadReports(env: Env): Promise<ProjectCard[]> {
  const namespace = env.REPORTS_NAMESPACE;
  const list = await namespace.list();

  const records = await Promise.all(
    list.keys.map(async (key) => {
      const value = await namespace.get(key.name);
      if (!value) {
        return null;
      }

      try {
        const parsed = JSON.parse(value) as StoredProject;
        return normalizeProject(key.name, parsed);
      } catch (_error) {
        return {
          id: key.name,
          projectName: value,
          chats: [],
        } satisfies ProjectCard;
      }
    })
  );

  return records.filter((record): record is ProjectCard => record !== null);
}

function normalizeProject(id: string, raw: StoredProject): ProjectCard {
  return {
    id,
    projectName: typeof raw.projectName === "string" ? raw.projectName : undefined,
    accountName: typeof raw.accountName === "string" ? raw.accountName : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    chats: normalizeChats(raw.chats),
  } satisfies ProjectCard;
}

function normalizeChats(value: unknown): StoredChat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): StoredChat | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const maybeTitle = Reflect.get(item, "title");
      const maybeLink = Reflect.get(item, "tgTopicLink");

      const title = typeof maybeTitle === "string" ? maybeTitle : undefined;
      const tgTopicLink = typeof maybeLink === "string" ? maybeLink : undefined;

      if (!title && !tgTopicLink) {
        return null;
      }

      return { title, tgTopicLink } satisfies StoredChat;
    })
    .filter((chat): chat is StoredChat => chat !== null);
}

type MetaBillingStatus = {
  accountStatus?: string;
  disableReason?: string;
  balance?: number | null;
  spendCap?: number | null;
};

type BillingSnapshot = {
  limit: number;
  spent: number;
  meta: MetaBillingStatus;
  normalizedStatus: string;
};

async function handleGetBilling(env: Env): Promise<Response> {
  const billing = await loadBillingData(env);
  return jsonResponse(billing);
}

async function loadBillingData(env: Env): Promise<BillingSnapshot> {
  const namespace = env.BILLING_NAMESPACE;
  const [limit, spent, accountStatus, disableReason, balance, spendCap] =
    await Promise.all([
      namespace.get("limit"),
      namespace.get("spent"),
      namespace.get("account_status"),
      namespace.get("disable_reason"),
      namespace.get("balance"),
      namespace.get("spend_cap"),
    ]);

  const snapshot: BillingSnapshot = {
    limit: Number(limit ?? 0),
    spent: Number(spent ?? 0),
    meta: {
      accountStatus: accountStatus ?? undefined,
      disableReason: disableReason ?? undefined,
      balance: balance === null ? null : parseNullableNumber(balance),
      spendCap: spendCap === null ? null : parseNullableNumber(spendCap),
    },
    normalizedStatus: "",
  };

  snapshot.normalizedStatus = normalizeBillingStatus(snapshot);
  return snapshot;
}

function parseNullableNumber(value: string): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function handleUpdateBilling(env: Env): Promise<Response> {
  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("spent", "0");
  return new Response("ok");
}

async function handleSetBillingLimit(env: Env): Promise<Response> {
  const namespace = env.BILLING_NAMESPACE;
  await namespace.put("limit", "100");
  return new Response("ok");
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<any>();
  const namespace = env.LOGS_NAMESPACE;
  const id = typeof payload?.id === "string" ? payload.id : crypto.randomUUID();

  await namespace.put(id, JSON.stringify(payload));
  return new Response("ok");
}

async function handleBalance(env: Env): Promise<Response> {
  const { limit, spent } = await loadBillingData(env);
  const balance = limit - spent;
  return jsonResponse({ balance });
}

async function handleGetLogs(env: Env): Promise<Response> {
  const namespace = env.LOGS_NAMESPACE;
  const list = await namespace.list({ limit: 10, reverse: true });
  const logs = await Promise.all(list.keys.map((key) => namespace.get(key.name)));
  return jsonResponse(logs);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function renderDashboard(projects: ProjectCard[], billing: BillingSnapshot): string {
  const projectCards = projects.length
    ? projects.map(renderProjectCard).join("")
    : `<p class="empty-state">Пока нет проектов для отображения.</p>`;

  return `<!DOCTYPE html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>TargetBot отчёты</title>
      <style>
        :root {
          color-scheme: light dark;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #0f172a;
          color: #f8fafc;
        }

        body {
          margin: 0;
          padding: 24px;
          background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.35), transparent 45%),
            radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.25), transparent 40%),
            #0f172a;
        }

        .layout {
          max-width: 1040px;
          margin: 0 auto;
          display: grid;
          gap: 32px;
        }

        header h1 {
          margin: 0;
          font-size: 32px;
          font-weight: 700;
        }

        header p {
          margin: 8px 0 0;
          max-width: 640px;
          color: rgba(248, 250, 252, 0.72);
        }

        .cards {
          display: grid;
          gap: 24px;
        }

        .card {
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          padding: 24px;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(18px);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
        }

        .card h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
        }

        .card .account-name {
          margin-top: 6px;
          color: rgba(148, 163, 184, 0.9);
          font-size: 15px;
        }

        .chat-list {
          margin: 20px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 12px;
        }

        .chat-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 14px;
          background: rgba(30, 41, 59, 0.72);
        }

        .chat-item .chat-title {
          font-weight: 500;
          font-size: 16px;
        }

        .chat-item .cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          color: #0f172a;
          background: linear-gradient(135deg, #38bdf8, #6366f1);
          padding: 10px 16px;
          border-radius: 999px;
          box-shadow: 0 12px 24px rgba(59, 130, 246, 0.45);
          border: none;
          cursor: pointer;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }

        .chat-item .cta:hover,
        .chat-item .cta:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 16px 32px rgba(59, 130, 246, 0.55);
        }

        .chat-item .cta[disabled] {
          cursor: not-allowed;
          pointer-events: none;
          background: rgba(148, 163, 184, 0.4);
          color: rgba(15, 23, 42, 0.8);
          box-shadow: none;
        }

        .empty-state {
          margin: 0;
          padding: 32px;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px dashed rgba(148, 163, 184, 0.4);
          text-align: center;
          color: rgba(148, 163, 184, 0.85);
        }

        .empty-chats {
          margin: 16px 0 0;
          padding: 16px;
          border-radius: 14px;
          background: rgba(30, 41, 59, 0.5);
          color: rgba(148, 163, 184, 0.85);
        }

        .billing-status {
          border-radius: 20px;
          border: 1px solid rgba(74, 222, 128, 0.35);
          padding: 24px;
          background: rgba(22, 163, 74, 0.12);
          backdrop-filter: blur(16px);
        }

        .billing-status h2 {
          margin: 0 0 12px;
          font-size: 20px;
        }

        .billing-meta {
          margin: 0;
          color: rgba(240, 253, 244, 0.85);
          line-height: 1.6;
        }

        @media (min-width: 900px) {
          .cards {
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          }
        }
      </style>
    </head>
    <body>
      <div class="layout">
        <header>
          <h1>Проекты TargetBot</h1>
          <p>Следите за актуальными чатами и статусом биллинга Meta в одном месте.</p>
        </header>

        <section class="cards" aria-label="Список проектов">
          ${projectCards}
        </section>

        <section class="billing-status" aria-live="polite">
          <h2>Статус биллинга</h2>
          <p class="billing-meta">${escapeHtml(billing.normalizedStatus)}</p>
        </section>
      </div>
    </body>
  </html>`;
}

function renderProjectCard(project: ProjectCard): string {
  const name = project.projectName ?? `Проект ${project.id}`;
  const account = project.accountName ? `Аккаунт: ${project.accountName}` : undefined;
  const chatList = project.chats?.length
    ? `<ul class="chat-list">${project.chats.map(renderChatItem).join("")}</ul>`
    : `<p class="empty-chats">Нет подключённых чатов.</p>`;

  return `<article class="card">
    <h2>${escapeHtml(name)}</h2>
    ${account ? `<p class="account-name">${escapeHtml(account)}</p>` : ""}
    ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ""}
    ${chatList}
  </article>`;
}

function renderChatItem(chat: StoredChat): string {
  const title = chat.title ?? "Без названия";
  const href = chat.tgTopicLink ?? "";
  const button = href
    ? `<a class="cta" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">Перейти в чат</a>`
    : `<button class="cta" type="button" disabled>Перейти в чат</button>`;

  return `<li class="chat-item">
    <span class="chat-title">${escapeHtml(title)}</span>
    ${button}
  </li>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function normalizeBillingStatus(snapshot: BillingSnapshot): string {
  const { meta } = snapshot;
  const normalizedStatus = meta.accountStatus?.toLowerCase() ?? "";
  const parts: string[] = [];

  switch (normalizedStatus) {
    case "active":
      parts.push("Рекламный аккаунт активен.");
      break;
    case "pending":
      parts.push("Рекламный аккаунт на проверке Meta.");
      break;
    case "disabled":
      parts.push("Рекламный аккаунт отключён Meta.");
      break;
    case "in_grace_period":
      parts.push("Аккаунт в льготном периоде оплаты.");
      break;
    default:
      if (meta.accountStatus) {
        parts.push(`Статус аккаунта: ${meta.accountStatus}.`);
      } else {
        parts.push("Статус аккаунта Meta не указан.");
      }
  }

  if (normalizedStatus === "disabled" && meta.disableReason) {
    parts.push(`Причина: ${meta.disableReason}.`);
  } else if (meta.disableReason && normalizedStatus !== "disabled") {
    parts.push(`Дополнительная информация: ${meta.disableReason}.`);
  }

  const balanceParts: string[] = [];
  if (typeof meta.balance === "number") {
    balanceParts.push(`баланс ${formatMoney(meta.balance)}`);
  }
  if (typeof meta.spendCap === "number") {
    balanceParts.push(`лимит ${formatMoney(meta.spendCap)}`);
  }

  if (balanceParts.length) {
    parts.push(`Финансовые показатели: ${balanceParts.join(", ")}.`);
  }

  if (Number.isFinite(snapshot.spent) && Number.isFinite(snapshot.limit)) {
    parts.push(
      `Использовано ${formatMoney(snapshot.spent)} из внутреннего лимита ${formatMoney(snapshot.limit)}.`
    );
  }

  return parts.join(" ").trim();
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
