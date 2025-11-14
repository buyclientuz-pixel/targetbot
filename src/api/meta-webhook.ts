import { jsonResponse } from "../utils/http";
import { createId } from "../utils/ids";
import {
  appendMetaWebhookEvent,
  EnvBindings,
  listLeads,
  listMetaAccountLinks,
  listProjects,
  loadMetaToken,
  loadProject,
  saveLeads,
} from "../utils/storage";
import {
  fetchLeadDetails,
  resolveMetaWebhookVerifyToken,
  withMetaSettings,
  callGraph,
} from "../utils/meta";
import { leadReceiveHandler } from "../utils/lead-notifications";
import {
  JsonObject,
  JsonValue,
  LeadRecord,
  MetaAccountLinkRecord,
  MetaLeadDetails,
  MetaTokenRecord,
  ProjectRecord,
} from "../types";
import { buildCampaignShortName } from "../utils/campaigns";

const ensureBindings = (env: unknown): (EnvBindings & Record<string, unknown>) => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const normalizeAccountId = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith("act_")) {
      return trimmed;
    }
    return `act_${trimmed.replace(/^act_/u, "")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `act_${value}`;
  }
  return undefined;
};

const parseTimestamp = (value: unknown): string | undefined => {
  if (!value && value !== 0) {
    return undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = numeric > 1_000_000_000 ? numeric : numeric * 1000;
      return new Date(millis).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  return undefined;
};

const sanitizeJson = (value: unknown, depth = 0): JsonValue | undefined => {
  if (depth > 6) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      const sanitized = sanitizeJson(item, depth + 1);
      if (sanitized !== undefined) {
        result.push(sanitized);
      }
    }
    return result;
  }
  if (typeof value === "object" && value) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeJson(entry, depth + 1);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }
  return undefined;
};

const toJsonObject = (value: JsonValue | undefined): JsonObject => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
};

const leadsCache = new Map<string, LeadRecord[]>();
const campaignMetadataCache = new Map<string, { name: string; shortName: string }>();

interface MetaWebhookChange {
  field?: string;
  value?: Record<string, unknown> & {
    leadgen_id?: string;
    lead_id?: string;
    ad_account_id?: string;
    ad_id?: string;
    form_id?: string;
    created_time?: string | number;
    event_time?: number;
    campaign_id?: string;
    page_id?: string;
    verb?: string;
    event?: string;
  };
  time?: number;
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  changes?: MetaWebhookChange[];
}

interface MetaWebhookBody {
  object?: string;
  entry?: MetaWebhookEntry[];
}

const buildEventId = (
  leadId: string | undefined,
  entry: MetaWebhookEntry,
  change: MetaWebhookChange,
): string => {
  const time = parseTimestamp(change.value?.event_time ?? change.value?.created_time ?? change.time ?? entry.time);
  const suffix = time ? Date.parse(time) : Date.now();
  if (leadId) {
    return `lead:${leadId}:${suffix}`;
  }
  const entryId = entry.id ? entry.id : "entry";
  const field = change.field ? change.field : "change";
  return `${entryId}:${field}:${suffix}:${createId(6)}`;
};

const resolveProjectByAccount = (
  accounts: MetaAccountLinkRecord[],
  accountId: string | undefined,
): MetaAccountLinkRecord | undefined => {
  if (!accountId) {
    return undefined;
  }
  const normalized = normalizeAccountId(accountId);
  if (!normalized) {
    return undefined;
  }
  return accounts.find((record) => normalizeAccountId(record.accountId) === normalized);
};

const findProjectByIdentifiers = async (
  env: EnvBindings,
  cache: Map<string, LeadRecord[]>,
  projects: ProjectRecord[],
  identifiers: { formId?: string; adId?: string; campaignId?: string },
): Promise<ProjectRecord | null> => {
  const { formId, adId, campaignId } = identifiers;
  if (!formId && !adId && !campaignId) {
    return null;
  }
  for (const project of projects) {
    const leads = await ensureLeadStorage(env, cache, project.id);
    if (formId && leads.some((lead) => lead.formId && lead.formId === formId)) {
      return project;
    }
    if (adId && leads.some((lead) => lead.adId && lead.adId === adId)) {
      return project;
    }
    if (campaignId && leads.some((lead) => lead.campaignId && lead.campaignId === campaignId)) {
      return project;
    }
  }
  return null;
};

const ensureLeadStorage = async (
  env: EnvBindings,
  cache: Map<string, LeadRecord[]>,
  projectId: string,
): Promise<LeadRecord[]> => {
  if (!cache.has(projectId)) {
    const leads = await listLeads(env, projectId);
    cache.set(projectId, leads);
  }
  return cache.get(projectId) ?? [];
};

const resolveCampaignMetadata = async (
  env: EnvBindings & Record<string, unknown>,
  token: MetaTokenRecord | null,
  campaignId: string | null | undefined,
): Promise<{ name: string; shortName: string } | null> => {
  if (!campaignId) {
    return null;
  }
  const cached = campaignMetadataCache.get(campaignId);
  if (cached) {
    return cached;
  }
  if (!token?.accessToken) {
    return null;
  }
  const response = await callGraph<{ id?: string; name?: string }>(env, campaignId, {
    access_token: token.accessToken,
    fields: "id,name",
  }).catch((error: Error) => {
    console.warn("meta:webhook:campaign", campaignId, error.message);
    return null;
  });
  if (!response?.id || !response?.name) {
    return null;
  }
  const metadata = { name: response.name, shortName: buildCampaignShortName(response.name) };
  campaignMetadataCache.set(campaignId, metadata);
  return metadata;
};

const upsertLeadRecord = (
  leads: LeadRecord[],
  lead: LeadRecord,
): { next: LeadRecord[]; created: boolean; updated: boolean } => {
  const exists = leads.find((item) => item.id === lead.id);
  if (exists) {
    const index = leads.findIndex((item) => item.id === lead.id);
    const merged: LeadRecord = {
      ...exists,
      ...lead,
      status: exists.status,
      phone: lead.phone ?? exists.phone,
    };
    const next = leads.slice();
    next[index] = merged;
    return { next, created: false, updated: true };
  }
  const next = [lead, ...leads].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return { next, created: true, updated: false };
};

export const handleMetaWebhook = async (
  request: Request,
  env: unknown,
): Promise<Response> => {
  const bindings = ensureBindings(env);
  const method = request.method.toUpperCase();
  const metaEnv = await withMetaSettings({ ...bindings });
  const verifyToken = resolveMetaWebhookVerifyToken(metaEnv);

  if (method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: MetaWebhookBody;
  try {
    body = (await request.json()) as MetaWebhookBody;
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.entry)) {
    return jsonResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const [tokenRecord, accounts] = await Promise.all([
    loadMetaToken(bindings),
    listMetaAccountLinks(bindings),
  ]);

  const projects = await listProjects(bindings).catch(() => [] as ProjectRecord[]);
  const results: Array<{ eventId: string; processed: boolean; projectId?: string; leadId?: string; reason?: string }> = [];

  for (const entry of body.entry) {
    if (!entry?.changes) {
      continue;
    }
    for (const change of entry.changes) {
      if (!change || change.field !== "leadgen") {
        continue;
      }
      const value = change.value ?? {};
      const leadId = (value.leadgen_id || value.lead_id) as string | undefined;
      const adAccountId = normalizeAccountId(value.ad_account_id ?? value.account_id ?? value.ad_id);
      const projectLink = resolveProjectByAccount(accounts, adAccountId);
      const eventId = buildEventId(leadId, entry, change);
      const eventTime =
        parseTimestamp(value.created_time) ||
        parseTimestamp(value.event_time) ||
        parseTimestamp(change.time) ||
        parseTimestamp(entry.time) ||
        new Date().toISOString();
      const payload = toJsonObject(sanitizeJson(change));

      const valueRecord = value as Record<string, unknown>;
      const formIdCandidate =
        typeof valueRecord.form_id === "string" && valueRecord.form_id.trim() ? valueRecord.form_id.trim() : undefined;
      const adIdCandidate =
        typeof valueRecord.ad_id === "string" && valueRecord.ad_id.trim() ? valueRecord.ad_id.trim() : undefined;
      const campaignIdCandidate =
        typeof valueRecord.campaign_id === "string" && valueRecord.campaign_id.trim()
          ? valueRecord.campaign_id.trim()
          : undefined;

      let targetProjectId = projectLink?.linkedProjectId ?? null;
      let project: ProjectRecord | null = null;

      if (targetProjectId) {
        project = await loadProject(bindings, targetProjectId);
      }

      if (!targetProjectId) {
        const fallback = await findProjectByIdentifiers(bindings, leadsCache, projects, {
          formId: formIdCandidate,
          adId: adIdCandidate,
          campaignId: campaignIdCandidate,
        });
        if (fallback) {
          project = fallback;
          targetProjectId = fallback.id;
        }
      }

      if (!targetProjectId) {
        await appendMetaWebhookEvent(bindings, {
          id: eventId,
          object: body.object ?? "",
          field: change.field ?? "",
          type: value.event ?? value.verb ?? undefined,
          leadId,
          adAccountId,
          processed: false,
          createdAt: eventTime,
          updatedAt: new Date().toISOString(),
          payload,
        });
        results.push({ eventId, processed: false, leadId, reason: "account_not_linked" });
        continue;
      }

      if (!leadId) {
        await appendMetaWebhookEvent(bindings, {
          id: eventId,
          object: body.object ?? "",
          field: change.field ?? "",
          type: value.event ?? value.verb ?? undefined,
          leadId,
          adAccountId,
          projectId: targetProjectId,
          projectName: project?.name ?? projectLink?.accountName,
          processed: false,
          createdAt: eventTime,
          updatedAt: new Date().toISOString(),
          payload,
        });
        results.push({ eventId, processed: false, projectId: targetProjectId, reason: "lead_missing" });
        continue;
      }

      if (!project) {
        project = await loadProject(bindings, targetProjectId);
      }

      if (!project) {
        await appendMetaWebhookEvent(bindings, {
          id: eventId,
          object: body.object ?? "",
          field: change.field ?? "",
          type: value.event ?? value.verb ?? undefined,
          leadId,
          adAccountId,
          projectId: targetProjectId,
          processed: false,
          createdAt: eventTime,
          updatedAt: new Date().toISOString(),
          payload,
        });
        results.push({ eventId, processed: false, projectId: targetProjectId, leadId, reason: "project_missing" });
        continue;
      }

      const leads = await ensureLeadStorage(bindings, leadsCache, project.id);
      const details = await fetchLeadDetails(metaEnv, tokenRecord, leadId).catch(() => null);
      const fallbackNameCandidates = [valueRecord.full_name, valueRecord.name, valueRecord.first_name];
      const fallbackName = fallbackNameCandidates
        .map((candidate) => (typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined))
        .find((candidate): candidate is string => Boolean(candidate));
      const defaultName = `Лид ${leadId.slice(-6)}`;
      const name = details?.fullName || fallbackName || defaultName;
      const fallbackPhoneCandidates = [valueRecord.phone_number, valueRecord.phone];
      const fallbackPhone = fallbackPhoneCandidates
        .map((candidate) => (typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined))
        .find((candidate): candidate is string => Boolean(candidate));
      const phone = details?.phone || fallbackPhone;
      const formId = details?.formId || formIdCandidate;
      const adId = details?.adId || adIdCandidate;
      const campaignId = details?.campaignId || campaignIdCandidate;
      const createdAt = details?.createdAt || eventTime;
      const source = "facebook";
      const leadRecord: LeadRecord = {
        id: leadId,
        projectId: project.id,
        name: typeof name === "string" && name.trim() ? name.trim() : defaultName,
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : undefined,
        source,
        campaignId: campaignId ?? null,
        formId: formId ?? null,
        adId: adId ?? null,
        status: "new",
        createdAt,
      };

      const campaignMetadata = await resolveCampaignMetadata(metaEnv, tokenRecord, campaignId);
      if (campaignMetadata) {
        leadRecord.campaignName = campaignMetadata.name;
        leadRecord.campaignShortName = campaignMetadata.shortName;
      }

      const { next, created, updated } = upsertLeadRecord(leads, leadRecord);
      if (created || updated) {
        leadsCache.set(project.id, next);
        await saveLeads(bindings, project.id, next);
      }

      await appendMetaWebhookEvent(bindings, {
        id: eventId,
        object: body.object ?? "",
        field: change.field ?? "",
        type: value.event ?? value.verb ?? undefined,
        leadId,
        adAccountId,
        projectId: project.id,
        projectName: project.name,
        processed: true,
        createdAt: eventTime,
        updatedAt: new Date().toISOString(),
        payload,
      });

      if (created) {
        await leadReceiveHandler(bindings, project, leadRecord, { details, payload });
      }

      results.push({ eventId, processed: true, projectId: project.id, leadId, reason: created ? undefined : "duplicate" });
    }
  }

  return jsonResponse({ ok: true, data: { processed: results } });
};
