import { createPortalSession, savePortalSession } from "../domain/portal-sessions";
import {
  ensureProjectSettings,
  parseProjectSettings,
  upsertProjectSettings,
} from "../domain/project-settings";
import { getProject, touchProjectUpdatedAt } from "../domain/projects";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";

const badRequest = (message: string): Response => jsonResponse({ error: message }, { status: 400 });
const notFoundResponse = (message: string): Response => jsonResponse({ error: message }, { status: 404 });
const unprocessableResponse = (message: string): Response => jsonResponse({ error: message }, { status: 422 });
const createdResponse = (body: unknown): Response => jsonResponse(body, { status: 201 });

interface SessionRequestBody {
  userId?: string;
  ttlSeconds?: number;
  ipAddress?: string;
  userAgent?: string;
}

export const registerProjectRoutes = (router: Router): void => {
  router.on("GET", "/api/projects/:projectId", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    try {
      const project = await getProject(context.kv, projectId);
      const settings = await ensureProjectSettings(context.kv, projectId);
      return jsonResponse({ project, settings });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFoundResponse(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessableResponse(error.message);
      }
      throw error;
    }
  });

  router.on("PUT", "/api/projects/:projectId/settings", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    try {
      await getProject(context.kv, projectId);
      const payload = await context.json<Record<string, unknown>>();
      const existing = await ensureProjectSettings(context.kv, projectId);
      const merged = {
        ...existing,
        ...payload,
        billing: {
          ...existing.billing,
          ...(payload.billing as Record<string, unknown> | undefined),
        },
        kpi: {
          ...existing.kpi,
          ...(payload.kpi as Record<string, unknown> | undefined),
        },
        reports: {
          ...existing.reports,
          ...(payload.reports as Record<string, unknown> | undefined),
        },
        alerts: {
          ...existing.alerts,
          ...(payload.alerts as Record<string, unknown> | undefined),
        },
        meta: {
          ...existing.meta,
          ...(payload.meta as Record<string, unknown> | undefined),
        },
        updatedAt: new Date().toISOString(),
        projectId,
      };
      const validated = parseProjectSettings(merged, projectId);
      await upsertProjectSettings(context.kv, validated);
      await touchProjectUpdatedAt(context.kv, projectId);
      return jsonResponse({ settings: validated });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFoundResponse(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessableResponse(error.message);
      }
      if (error instanceof SyntaxError) {
        return badRequest("Invalid JSON body");
      }
      throw error;
    }
  });

  router.on("POST", "/api/projects/:projectId/sessions", async (context) => {
    const projectId = context.state.params.projectId;
    if (!projectId) {
      return badRequest("Project ID is required");
    }

    let body: SessionRequestBody;
    try {
      body = await context.json<SessionRequestBody>();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body.userId) {
      return badRequest("userId is required");
    }

    try {
      await getProject(context.kv, projectId);
      const ttlSeconds = body.ttlSeconds && body.ttlSeconds > 0 ? body.ttlSeconds : undefined;
      const session = createPortalSession(
        {
          id: crypto.randomUUID(),
          projectId,
          userId: body.userId,
          ipAddress: body.ipAddress ?? null,
          userAgent: body.userAgent ?? null,
        },
        ttlSeconds,
      );
      await savePortalSession(context.kv, session, { ttlSeconds });
      return createdResponse({ session });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        return notFoundResponse(error.message);
      }
      if (error instanceof DataValidationError) {
        return unprocessableResponse(error.message);
      }
      throw error;
    }
  });
};
