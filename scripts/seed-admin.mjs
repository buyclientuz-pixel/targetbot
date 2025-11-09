import process from "node:process";
function loadEnv() {
  const required = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_KV_NAMESPACE_ID",
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required`);
    }
  }
  const adminIds = (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((value) => {
      const num = Number(value);
      if (!Number.isInteger(num)) {
        throw new Error(`Invalid admin id: ${value}`);
      }
      return num;
    });
  return {
    adminIds,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    namespaceId: process.env.CF_KV_NAMESPACE_ID,
  };
}

async function kvPut(env, key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/storage/kv/namespaces/${env.namespaceId}/values/${encodeURIComponent(
    key
  )}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.apiToken}`,
      "Content-Type": "text/plain",
    },
    body: value,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to seed admins (${res.status}): ${text}`);
  }
}

async function main() {
  const env = loadEnv();
  const roles = Object.fromEntries(env.adminIds.map((id) => [String(id), "SUPER_ADMIN"]));
  await kvPut(env, "admins", JSON.stringify({ roles }));
  console.log(`Seeded ${env.adminIds.length} admin(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
