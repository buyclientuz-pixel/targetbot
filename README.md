# th-reports Cloudflare Worker

Start here if you want to manage the `th-reports` Worker from Git using Wrangler.

## 1. Install Wrangler
```
npm install -g wrangler
```
If you prefer not to install globally, prefix commands with `npx` (for example, `npx wrangler deploy`).

## 2. Log in to Cloudflare
```
wrangler login
```
Follow the browser prompt so Wrangler can deploy to the account that hosts `th-reports`.

## 3. Check the configuration
`wrangler.toml` already points at the Worker service name and contains your Cloudflare `account_id`:
```toml
name = "th-reports"
main = "src/index.ts"
account_id = "02e61f874be22f0f3a6ee8f97ccccb1d"
compatibility_date = "2024-01-01"
```
If you use KV namespaces or other bindings, add them here before deploying. Example:
```toml
[[kv_namespaces]]
binding = "REPORTS_NAMESPACE"
id = "<namespace-id>"
```

## 4. Bring in your Worker code
Paste the production logic from the Cloudflare dashboard into `src/index.ts` (it currently contains a placeholder handler). Feel free to split code into additional files if needed—just update `main` in `wrangler.toml` if the entry point changes.

## 5. Deploy
```
wrangler deploy
```
This publishes the current repository state to `https://th-reports.obe1kanobe25.workers.dev`.

## 6. Iterate on the bot
1. Edit `src/index.ts` (and any new modules you add) to implement the behaviour you need.
2. Preview changes locally with live reload:
   ```
   wrangler dev
   ```
   Open the printed localhost URL in your browser or call it with `curl` to exercise the Worker before publishing.
3. Commit your updates and run `wrangler deploy` again to push the new version to Cloudflare.

## Optional: Cloudflare “Connect to Git”
If you enabled the Cloudflare Git integration, set the build command to `npm install` (or leave it empty) and the deploy command to `npm run deploy`. The included `package.json` defines:
```
{
  "scripts": {
    "deploy": "wrangler deploy"
  }
}
```
Cloudflare will install dependencies and run the deploy script on each push to the configured branch.
