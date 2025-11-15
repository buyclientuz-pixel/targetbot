import type { Router } from "../worker/router";
import { normaliseBaseUrl } from "../utils/url";

const GRAPH_EXPLORER_URL = "https://developers.facebook.com/tools/explorer/";
const DEFAULT_WORKER_DOMAIN = "th-reports.buyclientuz.workers.dev";

const buildFacebookAuthHtml = (options: { fbAppId?: string; workerBaseUrl: string }): string => {
  const instructions: string[] = [
    `<li>Откройте <a href="${GRAPH_EXPLORER_URL}" target="_blank" rel="noopener noreferrer">Graph API Explorer</a>.</li>`,
  ];
  if (options.fbAppId) {
    instructions.push(
      `<li>Выберите приложение <code>${options.fbAppId}</code> (пункт <strong>Application</strong>) и подтвердите доступ.</li>`,
    );
  } else {
    instructions.push(`<li>Выберите рабочее приложение в блоке <strong>Application</strong> и подтвердите доступ.</li>`);
  }
  instructions.push(
    `<li>В разделе <strong>Permissions</strong> включите <code>ads_management</code>, <code>ads_read</code>, <code>leads_retrieval</code> и подтвердите права.</li>`,
  );
  instructions.push(
    `<li>Нажмите <strong>Generate Access Token</strong> → <em>Continue as ...</em>, дождитесь подтверждения и скопируйте сгенерированный токен.</li>`,
  );
  instructions.push(
    `<li>Отправьте токен в чат с TargetBot (кнопка «Авторизация Facebook»), чтобы подключить рекламные аккаунты.</li>`,
  );

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Авторизация Facebook — TargetBot</title>
    <style>
      body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #0f172a; color: #f1f5f9; margin: 0; padding: 0; }
      main { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
      h1 { font-size: 2rem; margin-bottom: 0.5rem; }
      p { line-height: 1.5; }
      ol { line-height: 1.5; padding-left: 1.2rem; }
      code { background: #1e293b; padding: 0.1rem 0.25rem; border-radius: 4px; }
      a { color: #38bdf8; }
      section { margin-top: 2rem; padding: 1rem; border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 8px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Авторизация Facebook</h1>
      <p>Эти шаги помогут получить рабочий access token, который нужно отправить TargetBot.</p>
      <ol>
        ${instructions.join("\n        ")}
      </ol>
      <section>
        <h2>Подсказки</h2>
        <p>Если токен истёк или Facebook запрашивает повторное подтверждение, повторите шаги выше и снова отправьте токен боту.</p>
        <p>Cloudflare Worker: <code>${options.workerBaseUrl}</code></p>
      </section>
    </main>
  </body>
</html>`;
};

export const registerAuthRoutes = (router: Router): void => {
  router.on("GET", "/fb-auth", async (context) => {
    const fbAppId = context.env.FB_APP_ID ?? "";
    const workerBaseUrl = normaliseBaseUrl(context.env.WORKER_URL, DEFAULT_WORKER_DOMAIN) || `https://${DEFAULT_WORKER_DOMAIN}`;
    const html = buildFacebookAuthHtml({ fbAppId, workerBaseUrl });
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
};
