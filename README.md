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
   *Это буквенно-цифровая строка длиной ~32 символа — без пробелов и фигурных скобок.*
   Вы можете скопировать ID и через CLI:
   ```bash
   wrangler kv namespace list
   ```
3. Откройте `wrangler.toml` в любом редакторе (VS Code, nano и т. д.) и замените плейсхолдеры `REPLACE_WITH_…` на скопированные ID. Вставляйте их **в кавычках**.
   Например:
   ```toml
   [[kv_namespaces]]
   binding = "REPORTS_NAMESPACE"
   id = "0a1b2c3d4e5f67890123456789abcdef"

   [[kv_namespaces]]
   binding = "BILLING_NAMESPACE"
   id = "<paste the BILLING namespace ID here>"

   [[kv_namespaces]]
   binding = "LOGS_NAMESPACE"
   id = "fedcba98765432100123456789abcdef"
   ```
   Если хотите автоматизировать замену из терминала, можно сделать так:
   ```bash
   # пример замены для REPORTS_NAMESPACE
   sed -i 's/REPLACE_WITH_REPORTS_NAMESPACE_ID/0a1b2c3d4e5f67890123456789abcdef/' wrangler.toml
   ```
   При необходимости повторите для остальных привязок. Для `wrangler dev` вы также можете скопировать **Preview ID** в закомментированные строки `preview_id`.
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

## Using Cloudflare's "Connect to repository" workflow

Cloudflare Workers can deploy straight from your Git provider without running Wrangler locally. To hook this repository up to the dashboard screen shown in your screenshot:

1. **Ensure the repo is accessible to Cloudflare.** Push this project to GitHub, GitLab, or Bitbucket and confirm you can see the
   `main` branch with `wrangler.toml`, `src/index.ts`, and `package.json`.
2. **Authorize Cloudflare to read the repository.** In the Workers dashboard, click **Connect to repository** → choose the provider →
   authorize if prompted → pick the repository you just pushed.
3. **Select the branch to deploy.** Choose `main` (or another branch you want Workers to watch) in the **Branch** dropdown.
4. **Fill in the dialog exactly as follows.** The table below maps each field in the "Connect to repository" popup to the value this project expects:

   | Dialog field | What to pick / type |
   | --- | --- |
   | **Branch** | `main` |
   | **Build command** | `npm install` *(or leave blank—do **not** enter `npm run build`, because no such script exists)* |
   | **Deploy command** | `npm run deploy` |
   | **Build output directory** | leave empty (Wrangler uploads the Worker bundle itself) |
   | **Auto deploy new commits** | enable if you want each push to `main` to redeploy automatically |

   Because this project only needs Wrangler, the build step simply runs `npm install` to download Wrangler before the deploy.
5. **Confirm and connect.** Click **Connect** to let Cloudflare save the configuration.
6. **Trigger the first deploy.** After the wizard finishes, press **Deploy** (or push a commit) so Cloudflare runs `npm install` followed by `npm run deploy`.

   The `deploy` script calls `wrangler deploy --env production`, so it will publish the Worker using the same configuration you use locally.

## Verifying the Cloudflare ↔ Git connection

Once the integration is configured, open **Workers & Pages → th-reports → Deployments**. Each run should show two build steps:

1. **npm install** — installs Wrangler from `package.json`.
2. **npm run deploy** — executes `wrangler deploy --env production`.

When both steps show a green checkmark, the Git connection is working and the Worker code from this repository is live. If a step fails, expand the log to see the exact error. The most common issues are missing KV namespace IDs in `wrangler.toml` or a wrong command (for example, accidentally choosing `npm run build`).

After you finish the wizard, Cloudflare will run `npm install` followed by `npm run deploy` each time the branch updates. Keep the KV namespace IDs in `wrangler.toml` up to date so the deployments succeed.
