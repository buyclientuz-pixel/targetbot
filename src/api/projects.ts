import { jsonResponse, parseJsonRequest } from "../utils/http";
import { EnvBindings, deleteLeads, listProjects, loadProject, saveProjects } from "../utils/storage";
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
    const projects = await listProjects(bindings);
    const id = createId();
    const record: ProjectRecord = {
      id,
      name: String(body.name),
      userId: String(body.userId),
      telegramChatId: body.telegramChatId,
      telegramThreadId: body.telegramThreadId,
      telegramLink: body.telegramLink,
      adAccountId: body.adAccountId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
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
    const projects = await listProjects(bindings);
    const filtered = projects.filter((project) => project.id !== projectId);
    if (filtered.length === projects.length) {
      return jsonResponse({ ok: false, error: "Project not found" }, { status: 404 });
    }
    await saveProjects(bindings, filtered);
    await deleteLeads(bindings, projectId).catch((error) => {
      console.warn("Failed to delete project leads", projectId, error);
    });
    return jsonResponse({ ok: true, data: { id: projectId } });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
