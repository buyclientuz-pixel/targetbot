# Cloudflare Worker Deployment Guide

This repository contains the source for the `th-reports` Cloudflare Worker. The steps below explain how to deploy updates using
Wrangler and how to mirror the Worker that already lives in your Cloudflare account.

## Quick status 

- ✅  `wrangler.toml` targets the `th-reports` Worker in account `02e61f874be22f0f3a6ee8f97ccccb1d`.
- ✅  `src/index.ts` now matches the Worker logic that is running in your Cloudflare dashboard.
- ⏭️  Next action: fill in the KV namespace IDs in `wrangler.toml`, then run `wrangler deploy` to publish from Git.

## Prerequisites  

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) globally:
   ```bash
   npm install -g wrangler
   ```
2. Make sure you have a Cloudflare API token with permission to edit Workers, or be ready to authenticate with `wrangler login`.

## One-time setup

1. Authenticate Wrangler with your Cloudflare account:
   ```bash
   wrangler login
   ```
   Alternatively, export the required environment variables if you prefer tokens:
   ```bash
   export CLOUDFLARE_API_TOKEN=your_token
   export CLOUDFLARE_ACCOUNT_ID=02e61f874be22f0f3a6ee8f97ccccb1d
   ```
2. Confirm the `wrangler.toml` file contains the correct `account_id` (already set to `02e61f874be22f0f3a6ee8f97ccccb1d`). Update
other fields such as `main` if you change the entry point file.

## Fill in the KV namespace bindings

Your Worker code reads and writes to three KV namespaces: `REPORTS_NAMESPACE`, `BILLING_NAMESPACE`, and `LOGS_NAMESPACE`. To let
Wrangler provide those bindings when you deploy from Git:

1. In the Cloudflare dashboard, open **Workers & Pages → th-reports → Settings → Variables and bindings → KV Namespace bindings**.
   *The binding names must match exactly (e.g., `REPORTS_NAMESPACE`).*
2. Click each binding to reveal its namespace ID, or go to **Workers KV → Namespaces** and copy the `Namespace ID` from the table.
   You can also list them from the terminal:
   ```bash
   wrangler kv namespace list
   ```
3. Open `wrangler.toml` and replace the placeholders:
   ```toml
   [[kv_namespaces]]
   binding = "REPORTS_NAMESPACE"
   id = "<paste the REPORTS namespace ID here>"

   [[kv_namespaces]]
   binding = "BILLING_NAMESPACE"
   id = "<paste the BILLING namespace ID here>"

   [[kv_namespaces]]
   binding = "LOGS_NAMESPACE"
   id = "<paste the LOGS namespace ID here>"
   ```
   If you want to use `wrangler dev`, you can also copy the **Preview ID** into the commented `preview_id` lines.
4. Save the file. Wrangler will now inject the bindings so `env.REPORTS_NAMESPACE`, `env.BILLING_NAMESPACE`, and
   `env.LOGS_NAMESPACE` are available during local development and deployment.

## Deploying the Worker

From the repository root, run:
```bash
wrangler deploy
```
Wrangler will bundle the code in `src/index.ts` and publish it to your Worker at:
```
https://th-reports.obe1kanobe25.workers.dev
```

## Testing locally

Use Wrangler's development server to test changes before deploying:
```bash
wrangler dev
```
This starts a local preview where requests are proxied through Cloudflare, letting you iterate quickly. Any KV bindings or environment variables declared in `wrangler.toml` will be available during the preview session.

## Updating the Worker code

The repository now mirrors the code that is live in Cloudflare. Modify `src/index.ts` to implement new features or bug fixes, then repeat the deploy step to push the new version live.

## Automated deployments (optional)

If you keep this project in a Git repository, you can configure CI/CD (e.g., GitHub Actions) to run `wrangler deploy` on every push to `main`. Store the Cloudflare API token and account ID in the CI secrets to keep them secure.

## Telegram bot admin panel

1. Установите переменные окружения (`BOT_TOKEN`, `ADMIN_IDS`, `DEFAULT_TZ`, `FB_APP_ID`, `FB_APP_SECRET`, `FB_LONG_TOKEN`, `WORKER_URL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CF_KV_NAMESPACE_ID`).
2. Выполните `node scripts/seed-admin.mjs`, чтобы синхронизировать список администраторов в KV.
3. Запустите бота локально: `npm run dev`.
4. В Telegram выполните `/admin`, чтобы открыть меню управления.
