import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const envArg = parseEnv(args);

const secretKeys = [
  "BOT_TOKEN",
  "TG_API_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "ADMIN_IDS",
  "DEFAULT_TZ",
  "WORKER_URL",
  "FB_APP_ID",
  "FB_APP_SECRET",
  "FB_LONG_TOKEN",
  "META_LONG_TOKEN",
  "META_MANAGE_TOKEN",
  "FB_MANAGE_TOKEN",
  "PORTAL_TOKEN",
  "PORTAL_SIGNING_SECRET",
  "GS_WEBHOOK",
  "PROJECT_MANAGER_IDS",
  "PROJECT_MANAGERS",
  "PROJECT_ACCOUNT_ACCESS",
  "PROJECT_ACCOUNT_ALLOWLIST",
  "PROJECT_CHAT_PRESETS",
  "PROJECT_CHAT_TEMPLATES",
  "CHAT_PRESETS",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_ACCOUNT_ID",
];

let synced = 0;
let skipped = 0;

for (const key of secretKeys) {
  const value = process.env[key];

  if (!value) {
    skipped += 1;
    console.warn(`Skipping ${key}: environment variable is not set`);
    continue;
  }

  console.log(`Syncing secret ${key}${envArg ? ` (env=${envArg})` : ""}`);
  const command = ["secret", "put", key];

  if (envArg) {
    command.push("--env", envArg);
  }

  const result = spawnSync("wrangler", command, {
    stdio: ["pipe", "inherit", "inherit"],
    input: value,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to sync secret ${key}`);
  }

  synced += 1;
}

console.log(`Done. Synced ${synced} secret(s), skipped ${skipped}.`);

function parseEnv(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--env") {
      return argv[index + 1];
    }

    if (arg.startsWith("--env=")) {
      return arg.split("=")[1];
    }
  }

  return undefined;
}
