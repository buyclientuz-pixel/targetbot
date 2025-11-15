export const KV_KEYS = {
  config: (name: string) => `config:${name}`,
  user: (telegramId: string | number) => `user:${telegramId}`,
  project: (projectId: string) => `project:${projectId}`,
  projectSettings: (projectId: string) => `project-settings:${projectId}`,
  metaToken: (facebookUserId: string) => `meta-token:${facebookUserId}`,
  metaCache: (projectId: string, scope: string) => `meta-cache:${projectId}:${scope}`,
  portalSession: (sessionId: string) => `portal-session:${sessionId}`,
  telemetry: (key: string) => `telemetry:${key}`,
  botSession: (telegramId: number | string) => `bot-session:${telegramId}`,
  reportState: (projectId: string) => `report-state:${projectId}`,
  alertState: (projectId: string, type: string) => `alert-state:${projectId}:${type}`,
} as const;

export const KV_PREFIXES = {
  projects: "project:",
  projectSettings: "project-settings:",
  metaTokens: "meta-token:",
  metaCache: "meta-cache:",
  portalSessions: "portal-session:",
  botSessions: "bot-session:",
  reportStates: "report-state:",
  alertStates: "alert-state:",
} as const;
