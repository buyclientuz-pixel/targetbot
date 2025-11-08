# th-reports Cloudflare Worker

This repository bootstraps the production Telegram reporting bot for Meta Ads. The worker runs on Cloudflare Workers, persists state in KV, and deploys automatically from GitHub Actions.

## Prerequisites

- Cloudflare account with Workers enabled and a KV namespace bound as `DB`.
- Telegram bot token with webhook pointing to `https://<worker-url>/tg`.
- Meta (Facebook) App with `ads_read`, `ads_management`, `business_management` scopes.
- Optional Google Apps Script webhook for CSV ingestion.

## Environment variables

Configure the following secrets in Cloudflare (or `wrangler secret put` locally):

- `BOT_TOKEN` – Telegram bot token (required).
- `ADMIN_IDS` – comma separated Telegram user IDs allowed to open `/admin`.
- `FB_APP_ID` / `FB_APP_SECRET` – Meta OAuth credentials.
- `FB_LONG_TOKEN` – optional long lived token used as fallback.
- `DEFAULT_TZ` – default timezone for reports (e.g. `Asia/Tashkent`).
- `WORKER_URL` – public URL of the worker, used for OAuth callbacks.
- `GS_WEBHOOK` – optional Google Sheets webhook URL.

## Local development

1. Install Wrangler globally (`npm install -g wrangler`) or use the project-local binary (`npm install`).
2. Authenticate: `wrangler login`.
3. Bind the production KV namespace locally:
   ```toml
   [[kv_namespaces]]
   binding = "DB"
   id = "<namespace-id>"
   ```
4. Run the worker locally: `npm run dev`.
5. Deploy when ready: `npm run deploy`.

## GitHub Actions deploy

A workflow at `.github/workflows/deploy.yml` deploys the worker on every push to `main`. Configure these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit, Workers KV Storage:Edit, Account Settings:Read)

## Auto-commit endpoint

The worker exposes `/git/commit` (already provisioned) for Codex automation. Use it with `WORKER_COMMIT_URL` and `COMMIT_KEY` environment variables; payload format is documented in the system prompt.

## Project structure

```
├── src/
│   ├── index.ts       # Full worker implementation
│   └── index.js       # JS entry point that re-exports the TS worker
├── wrangler.toml      # Worker configuration
├── package.json       # Project scripts
└── .github/workflows/ # CI deploy pipeline
```

## Operational checklist

After each deployment confirm:

- `/health` returns `OK`.
- `/fb_debug?uid=<admin>` shows connected accounts.
- `/admin` renders inline keyboards without timeouts.
- Scheduled reports land in their topics and CSVs attach correctly.
- Alerts fire for billing, zero-spend, anomalies, and creative fatigue.
- Client portal `/p/<code>?sig=...` renders read-only dashboards.

