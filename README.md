# Targetbot Cloudflare Worker Scaffold

This repository has been reset to a clean starting point for rebuilding the Meta Ads reporting bot. The current contents provide a minimal runnable Worker plus deployment scaffolding.

## What is included
- **Cloudflare Worker entrypoint** at `src/index.js` that responds to `/health` and returns a placeholder JSON payload for all other routes.
- **Wrangler configuration** (`wrangler.toml`) targeting the `th-reports` Worker, enabling Node.js compatibility, wiring cron triggers, and reserving KV bindings for existing namespaces.
- **GitHub Actions workflow** (`.github/workflows/deploy.yml`) for automated deploys with Wrangler 4 once repository secrets are configured.
- **npm scripts** (`package.json`) for local `wrangler dev` and `wrangler deploy` commands.

## Next steps
1. Populate the real KV namespace IDs in `wrangler.toml` (`REPORTS_NAMESPACE`, `BILLING_NAMESPACE`, `LOGS_NAMESPACE`, `DB`). The IDs shown in the Cloudflare dashboard screenshot should be used. Preview IDs are optional.
2. Install dependencies locally and run the Worker in development mode:
   ```bash
   npm install
   npm run dev
   ```
3. Replace the placeholder logic inside `src/index.js` with the production Telegram bot implementation. Do this incrementally so each feature can be tested in isolation.
4. Configure the GitHub Actions secrets (`CF_API_TOKEN`, `CF_ACCOUNT_ID`, etc.) before enabling automatic deploys.

Until the Worker logic is rebuilt, deployments will succeed but only serve the scaffold responses. Update the README as new functionality is added.
