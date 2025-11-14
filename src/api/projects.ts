import { jsonResponse, parseJsonRequest } from "../utils/http";
import {
  EnvBindings,
  clearPaymentReminder,
  cleanupProjectArtifacts,
  deleteProjectCascade,
  listProjects,
  loadProject,
  saveProjects,
  unlinkProjectChat,
} from "../utils/storage";
import { ApiSuccess, ProjectRecord, ProjectSummary } from "../types";
import { createId } from "../utils/ids";
import { summarizeProjects, sortProjectSummaries } from "../utils/projects";

const ensureEnv = (env: unknown): EnvBindings & Record<string, unknown> => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const nowIso = () => new Date().toISOString();

export const handleProjectsList = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const url = new URL(request.url);
    const includes = url
      .searchParams
      .getAll("include")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);

    const wantsSummary = includes.some((entry) => ["leadStats", "summary", "billing"].includes(entry));
    if (wantsSummary) {
      const summaries = await summarizeProjects(bindings);
      const payload: ApiSuccess<ProjectSummary[]> = {
        ok: true,
        data: sortProjectSummaries(summaries),
      };
      return jsonResponse(payload);
    }

    const projects = await listProjects(bindings);
    const payload: ApiSuccess<ProjectRecord[]> = { ok: true, data: projects };
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};

export const handleProjectsCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<Partial<ProjectRecord>>(request);
    if (!body.name) {
      throw new Error("Project name is required");
    }
    if (!body.userId) {
      throw new Error("userId is required");
    }
    const metaAccountId = body.metaAccountId ?? body.adAccountId;
    if (!metaAccountId) {
      throw new Error("metaAccountId is required");
    }
    const chatIdentifier = body.chatId ?? body.telegramChatId;
    if (!chatIdentifier) {
      throw new Error("chatId is required");
    }
    const projects = await listProjects(bindings);
    const id = `p_${createId(10)}`;
    const now = nowIso();
    const tariffSource = (body as Record<string, unknown>).tariff ?? body.tariff;
    const tariff =
      typeof tariffSource === "number" && Number.isFinite(tariffSource)
        ? tariffSource
        : typeof tariffSource === "string" && tariffSource.trim() && !Number.isNaN(Number(tariffSource))
          ? Number(tariffSource)
          : 0;
    const record: ProjectRecord = {
      id,
      name: String(body.name),
      metaAccountId: String(metaAccountId),
      metaAccountName: body.metaAccountName ? String(body.metaAccountName) : String(body.name),
      chatId: String(chatIdentifier),
      billingStatus:
        body.billingStatus === "active" || body.billingStatus === "overdue" || body.billingStatus === "blocked"
          ? body.billingStatus
          : "pending",
      nextPaymentDate: body.nextPaymentDate ?? null,
      tariff,
      createdAt: now,
      updatedAt: now,
      settings:
        body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? (body.settings as ProjectRecord["settings"])
          : {},
      userId: String(body.userId),
      telegramChatId: body.telegramChatId ? String(body.telegramChatId) : String(chatIdentifier),
      telegramThreadId: body.telegramThreadId,
      telegramLink: body.telegramLink,
      adAccountId: body.adAccountId ? String(body.adAccountId) : String(metaAccountId),
    };
    projects.push(record);
    await saveProjects(bindings, projects);
    const payload: ApiSuccess<ProjectRecord> = { ok: true, data: record };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 400 });
  }
};

export const handleProjectGet = async (_request: Request, env: unknown, projectId: string): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const project = await loadProject(bindings, projectId);
    if (!project) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    return jsonResponse({ ok: true, data: project });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};

export const handleProjectUpdate = async (
  request: Request,
  env: unknown,
  projectId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<Partial<ProjectRecord>>(request);
    const projects = await listProjects(bindings);
    const index = projects.findIndex((project) => project.id === projectId);
    if (index === -1) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    const updated: ProjectRecord = {
      ...projects[index],
      ...body,
      updatedAt: nowIso(),
    };
    projects[index] = updated;
    await saveProjects(bindings, projects);
    if (body.nextPaymentDate !== undefined || body.billingStatus !== undefined) {
      await clearPaymentReminder(bindings, projectId).catch((error) => {
        console.warn("Failed to clear payment reminder", projectId, error);
      });
    }
    return jsonResponse({ ok: true, data: updated });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 400 });
  }
};

export const handleProjectDelete = async (
  _request: Request,
  env: unknown,
  projectId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const result = await deleteProjectCascade(bindings, projectId);
    if (!result) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    const details = error as Error;
    console.error(
      `[PROJECT_DELETE_ERROR]\nproject_id: ${projectId}\nerror: ${details.message}\nstack: ${details.stack ?? "n/a"}`,
    );
    return jsonResponse({ ok: false, error: details.message }, { status: 500 });
  }
};

export const handleProjectCleanup = async (
  _request: Request,
  env: unknown,
  projectId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const result = await cleanupProjectArtifacts(bindings, projectId);
    if (!result) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    return jsonResponse({ ok: true, data: result });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};

export const handleProjectUnlinkChat = async (
  _request: Request,
  env: unknown,
  projectId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const updated = await unlinkProjectChat(bindings, projectId);
    if (!updated) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    return jsonResponse({ ok: true, data: updated });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
