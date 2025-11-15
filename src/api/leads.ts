import { jsonResponse, parseJsonRequest } from "../utils/http";
import { EnvBindings, loadProject, saveLeads } from "../utils/storage";
import { ApiError, ApiSuccess, LeadRecord } from "../types";
import { createId } from "../utils/ids";
import { getProjectLeads, syncProjectLeads } from "../utils/leads";
import { leadReceiveHandler } from "../utils/lead-notifications";

const ensureEnv = (env: unknown): EnvBindings & Record<string, unknown> => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const nowIso = () => new Date().toISOString();

interface LeadInput {
  projectId: string;
  name: string;
  phone?: string;
  source?: string;
}

export const handleLeadCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<LeadInput>(request);
    if (!body.projectId) {
      throw new Error("projectId is required");
    }
    if (!body.name) {
      throw new Error("Lead name is required");
    }
    const project = await loadProject(bindings, body.projectId);
    if (!project) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    await syncProjectLeads(bindings, body.projectId).catch((error) => {
      console.warn("Failed to sync leads before manual create", body.projectId, (error as Error).message);
    });
    const leads = await getProjectLeads(bindings, body.projectId);
    const record: LeadRecord = {
      id: createId(),
      projectId: body.projectId,
      name: body.name,
      phone: body.phone,
      source: body.source || "FB Ads Form",
      status: "new",
      createdAt: nowIso(),
    };
    leads.unshift(record);
    await saveLeads(bindings, body.projectId, leads);

    await leadReceiveHandler(bindings, project, record);

    return jsonResponse({ ok: true, data: record }, { status: 201 });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 400 });
  }
};

export const handleLeadUpdateStatus = async (
  request: Request,
  env: unknown,
  leadId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<{ status: "new" | "done"; projectId: string }>(request);
    if (!body.projectId) {
      throw new Error("projectId is required");
    }
    await syncProjectLeads(bindings, body.projectId).catch((error) => {
      console.warn("Failed to sync leads before status update", body.projectId, (error as Error).message);
    });
    const leads = await getProjectLeads(bindings, body.projectId);
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index === -1) {
      return jsonResponse({ ok: false, error: "Lead not found" }, { status: 404 });
    }
    leads[index] = { ...leads[index], status: body.status };
    await saveLeads(bindings, body.projectId, leads);
    return jsonResponse({ ok: true, data: leads[index] });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 400 });
  }
};

export const handleLeadsList = async (
  _request: Request,
  env: unknown,
  projectId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    await syncProjectLeads(bindings, projectId).catch((error) => {
      console.warn("Failed to sync leads before API fetch", projectId, (error as Error).message);
    });
    const leads = await getProjectLeads(bindings, projectId);
    const payload: ApiSuccess<LeadRecord[]> = { ok: true, data: leads };
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
