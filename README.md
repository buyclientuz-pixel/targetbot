# th-reports Worker

This repository contains the full Cloudflare Worker that powers the Telegram automation bot for `th-reports`. The Worker exposes the `/tg` webhook for Telegram, OAuth endpoints for Meta, a read-only client portal, and the cron logic that sends scheduled reports, billing alerts, and anomaly notifications.

## Requirements

| Component | Purpose |
| --- | --- |
| Cloudflare Worker | The service deployed at `https://th-reports.obe1kanobe25.workers.dev`. |
| KV namespace (binding **DB**) | Stores projects, chats, archived reports, cached Meta data, and portal signatures. |
| Secrets | `BOT_TOKEN` (Telegram bot token), `FB_APP_ID`, `FB_APP_SECRET`, `FB_LONG_TOKEN` (optional), `GS_WEBHOOK` (optional). |
| Environment variables | `ADMIN_IDS` (comma-separated list of Telegram admin IDs), `DEFAULT_TZ` (default `Asia/Tashkent`), `WORKER_URL` (public HTTPS origin for OAuth callbacks). |

> The worker now checks for these secrets at runtime. Telegram webhook requests are rejected if `BOT_TOKEN` is missing, and the Meta OAuth endpoints return HTTP 500 when `FB_APP_ID`/`FB_APP_SECRET` are not configured.

`wrangler.toml` already includes the production KV namespace ID, so deployments from this repo talk to the same data store:

```toml
[[kv_namespaces]]
binding = "DB"
id = "02e61f874be22f0f3a6ee8f97ccccb1d"
# preview_id = "<REPLACE_WITH_DB_PREVIEW_NAMESPACE_ID>"
```

You can configure secrets with Wrangler:

```bash
wrangler secret put BOT_TOKEN
wrangler secret put FB_APP_ID
wrangler secret put FB_APP_SECRET
# Optional:
wrangler secret put FB_LONG_TOKEN
wrangler secret put GS_WEBHOOK
```

## Local development & deployment

1. Install Wrangler (Node 18+ recommended):
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Verify `wrangler.toml` contains the correct `account_id` and KV namespace binding.
3. Run a live preview:
   ```bash
   wrangler dev
   ```
   The Worker exposes:
   * `POST /tg` — Telegram webhook.
   * `GET /health` — health check returning `ok`.
   * `GET /fb_auth`, `/fb_cb`, `/fb_debug` — Meta OAuth helpers.
   * `GET /p/:code` — read-only portal once a KV signature is configured.
4. Deploy:
   ```bash
   wrangler deploy
   ```

If you use Cloudflare "Connect to Git", set the build command to `npm install` (or leave blank) and the deploy command to `npm run deploy` (defined in `package.json`).

## Telegram commands

Once the webhook is pointing to `/tg`, the bot understands the following chat commands:

| Command | Description |
| --- | --- |
| `/register` | Run inside the target topic to register a chat/thread in KV. |
| `/whoami` | Shows chat ID, topic ID, and a sample API call. |
| `/report <code> [period]` | Sends a manual report for the project code (period defaults to project setting). |
| `/digest <code>` | Sends a short daily digest to the client topic. |
| `/portal <code>` | Returns or generates a portal link for the client. |
| `/admin` | Lightweight summary for admins (requires the sender to be listed in `ADMIN_IDS`). |

Automatic routines include:

* Scheduled reports with CSV attachments (configurable per project).
* Monday weekly combo reports.
* Billing reminders and zero-spend alerts.
* Meta health checks (disapprovals, anomalies, creative fatigue).
* KPI streak tracking with optional one-click autopause for selected campaigns.

The Worker stores projects, chats, and archived reports in KV. `src/index.ts` contains all helper functions so further enhancements can be implemented incrementally.

## Migrating existing data

If the bot is already live in Cloudflare:

1. Export the current Worker script (Dashboard → Workers & Pages → *th-reports* → Quick Edit → Download). The code in this repository already mirrors the production script, so you can commit future changes here instead.
2. Copy your KV namespace ID into `wrangler.toml` and configure secrets with `wrangler secret put ...`.
3. (Optional) If you previously stored data in a different namespace, point the binding to that namespace to keep historic data.
4. Deploy from Git (`wrangler deploy`) or trigger the Git integration to publish.

## Useful KV keys

* `project:<code>` — Project configuration (Meta account, schedule, KPI settings, etc.).
* `chat-<chat_id>:<thread_id>` — Registered Telegram chat/thread metadata (legacy keys `chat:<chat_id>:<thread_id>` are read automatically).
* `report:<code>:<timestamp>` — Archived HTML/CSV reports.
* `portal:<code>:sig` — Shared secret for the read-only portal.
* `acct:<act_id>` — Cached Meta account metadata.

Understanding these keys makes it easier to script migrations or bulk updates using `wrangler kv key`/`wrangler kv value` commands.

## Contributing

The worker is a single TypeScript module (`src/index.ts`). Use `// @ts-nocheck` pragmas only when required (the current file uses one to allow the large JS-style codebase). Keep helper functions pure where possible to make it easier to test pieces in isolation.

When adding features:

1. Update the README with any new commands or environment requirements.
2. Add comments around complex business logic for future contributors.
3. Run `wrangler dev` to exercise the webhook/portal endpoints before deploying.

