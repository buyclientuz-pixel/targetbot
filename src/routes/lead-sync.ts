import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";
import {
  listLeads,
  ensureProjectFormIds,
  MetaApiError,
  syncProjectLeads,
} from "../services/meta-leads-worker";

const badRequest = (message: string): Response => jsonResponse({ success: false, error: message }, { status: 400 });

const metaErrorResponse = (error: MetaApiError): Response =>
  jsonResponse(
    {
      success: false,
      error: error.payload ?? { message: error.message },
    },
    { status: error.status },
  );

export const registerLeadWorkerRoutes = (router: Router): void => {
  router.on("GET", "/api/projects/:project_id/sync-leads", async (context) => {
    const projectId = context.state.params.project_id;
    if (!projectId) {
      return badRequest("project_id is required");
    }

    const formIds = await ensureProjectFormIds(context.env, projectId);
    if (formIds.length === 0) {
      return jsonResponse({ success: true, imported: 0 });
    }

    try {
      const { imported } = await syncProjectLeads(context.env, projectId, formIds);
      return jsonResponse({ success: true, imported });
    } catch (error) {
      if (error instanceof MetaApiError) {
        return metaErrorResponse(error);
      }
      console.error("[leads] Unexpected sync error", { projectId }, error);
      return jsonResponse({ success: false, error: "Failed to sync leads" }, { status: 500 });
    }
  });

  router.on("GET", "/api/projects/:project_id/leads", async (context) => {
    const projectId = context.state.params.project_id;
    if (!projectId) {
      return badRequest("project_id is required");
    }

    const leads = await listLeads(context.env, projectId);
    return jsonResponse({ project_id: projectId, total: leads.length, leads });
  });
};
