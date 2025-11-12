const headers = () => {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("key");
  const baseHeaders = { "content-type": "application/json" };
  if (key) {
    baseHeaders.Authorization = `Bearer ${key}`;
    baseHeaders["X-Auth-Key"] = key;
  }
  return baseHeaders;
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed: ${response.status} ${text}`);
  }
  return response.json();
}

export const api = {
  async getLeads() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/api/leads?key=${key}`);
  },
  async getUsers() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/api/users?key=${key}`);
  },
  async getSettings() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/api/settings?key=${key}`);
  },
  async createApiKey({ label, role, owner } = {}) {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/api/settings?key=${key}`, {
      method: "PUT",
      body: JSON.stringify({ action: "create_key", label, role, owner }),
    });
  },
  async deleteApiKey(keyValue) {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/api/settings?key=${key}`, {
      method: "PUT",
      body: JSON.stringify({ action: "delete_key", key: keyValue }),
    });
  },
  async syncMeta() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/meta/sync?key=${key}`, {
      method: "POST",
      body: JSON.stringify({ ad_account_id: "act_000000000000000" }),
    });
  },
  async checkWebhook() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/manage/telegram/webhook?key=${key}`);
  },
  async refreshWebhook() {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    return request(`/manage/telegram/webhook?key=${key}&action=refresh`, {
      method: "POST",
    });
  },
};

window.TargetBotAdminAPI = api;
