import { KV_KEYS } from "../config/kv";
import { createDefaultProjectSettings, ensureProjectSettings, parseProjectSettings, upsertProjectSettings } from "../domain/project-settings";
import { createProject, getProject, listProjects, parseProject, putProject } from "../domain/projects";
import { getMetaToken, parseMetaToken, upsertMetaToken, deleteMetaToken } from "../domain/meta-tokens";
import { DataValidationError, EntityConflictError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";

const badRequest = (message: string): Response => jsonResponse({ error: message }, { status: 400 });
const notFound = (message: string): Response => jsonResponse({ error: message }, { status: 404 });
const conflict = (message: string): Response => jsonResponse({ error: message }, { status: 409 });
const unprocessable = (message: string): Response => jsonResponse({ error: message }, { status: 422 });
const created = (body: unknown): Response => jsonResponse(body, { status: 201 });

interface CreateProjectBody {
  id?: string;
  name?: string;
  adsAccountId?: string | null;
  ownerTelegramId?: number;
}

interface UpdateProjectBody {
  name?: string;
  adsAccountId?: string | null;
  ownerTelegramId?: number;
}

interface UpdateSettingsBody extends Record<string, unknown> {}

interface UpsertMetaTokenBody {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

export const registerAdminRoutes = (router: Router): void => {
  router.on("GET", "/api/admin/projects", async (context) => {
    const projects = await listProjects(context.kv);
    return jsonResponse({ projects });
  });

  router.on("POST", "/api/admin/projects", async (context) => {
    let body: CreateProjectBody;
    try {
      body = await context.json<CreateProjectBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.id || !body.name || typeof body.ownerTelegramId !== "number") {
      return badRequest("Fields id, name and ownerTelegramId are required");
    }

    try {
      const existing = await context.kv.getJson<Record<string, unknown>>(KV_KEYS.project(body.id));
      if (existing) {
        throw new EntityConflictError("project", body.id);
      }
    } catch (error) {
      if (error instanceof EntityConflictError) {
        return conflict(error.message);
      }
    }

    try {
      const project = createProject({
        id: body.id,
        name: body.name,
        adsAccountId: body.adsAccountId ?? null,
        ownerTelegramId: body.ownerTelegramId,
      });

      await putProject(context.kv, project);

      const settings = createDefaultProjectSettings(project.id);
      await upsertProjectSettings(context.kv, settings);

      return created({ project, settings });
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("PUT", "/api/admin/projects/:projectId", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    let body: UpdateProjectBody;
    try {
      body = await context.json<UpdateProjectBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    try {
      const project = await getProject(context.kv, projectId);
      const updated = parseProject({
        ...project,
        name: body.name ?? project.name,
        adsAccountId: body.adsAccountId ?? project.adsAccountId,
        ownerTelegramId: typeof body.ownerTelegramId === "number" ? body.ownerTelegramId : project.ownerTelegramId,
        updatedAt: new Date().toISOString(),
      });
      await putProject(context.kv, updated);
      return jsonResponse({ project: updated });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/admin/projects/:projectId/settings", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    try {
      await getProject(context.kv, projectId);
      const settings = await ensureProjectSettings(context.kv, projectId);
      return jsonResponse({ settings });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("PUT", "/api/admin/projects/:projectId/settings", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    let body: UpdateSettingsBody;
    try {
      body = await context.json<UpdateSettingsBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    try {
      await getProject(context.kv, projectId);
      const existing = await ensureProjectSettings(context.kv, projectId);
      const merged = {
        ...existing,
        ...body,
        billing: {
          ...existing.billing,
          ...(body.billing as Record<string, unknown> | undefined),
        },
        kpi: {
          ...existing.kpi,
          ...(body.kpi as Record<string, unknown> | undefined),
        },
        reports: {
          ...existing.reports,
          ...(body.reports as Record<string, unknown> | undefined),
        },
        alerts: {
          ...existing.alerts,
          ...(body.alerts as Record<string, unknown> | undefined),
        },
        meta: {
          ...existing.meta,
          ...(body.meta as Record<string, unknown> | undefined),
        },
        updatedAt: new Date().toISOString(),
        projectId,
      } satisfies Record<string, unknown>;
      const validated = parseProjectSettings(merged, projectId);
      await upsertProjectSettings(context.kv, validated);
      return jsonResponse({ settings: validated });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("GET", "/api/admin/meta-tokens/:facebookUserId", async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    try {
      const token = await getMetaToken(context.kv, facebookUserId);
      return jsonResponse({ token });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFound(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("PUT", "/api/admin/meta-tokens/:facebookUserId", async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    let body: UpsertMetaTokenBody;
    try {
      body = await context.json<UpsertMetaTokenBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.accessToken) {
      return badRequest("accessToken is required");
    }

    try {
      let createdAt = new Date().toISOString();
      try {
        const existing = await getMetaToken(context.kv, facebookUserId);
        createdAt = existing.createdAt;
      } catch (error) {
        if (!(error instanceof EntityNotFoundError)) {
          throw error;
        }
      }

      const token = parseMetaToken({
        facebookUserId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken ?? null,
        expiresAt: body.expiresAt ?? null,
        createdAt,
        updatedAt: new Date().toISOString(),
      });
      await upsertMetaToken(context.kv, token);
      return jsonResponse({ token });
    } catch (error) {
      if (error instanceof DataValidationError) {
        return unprocessable(error.message);
      }
      throw error;
    }
  });

  router.on("DELETE", "/api/admin/meta-tokens/:facebookUserId", async (context) => {
    const facebookUserId = context.state.params.facebookUserId;
    if (!facebookUserId) {
      return badRequest("facebookUserId is required");
    }

    await deleteMetaToken(context.kv, facebookUserId);
    return jsonResponse({ ok: true });
  });
};
