import { htmlResponse, notFound } from "../utils/http";
import { ensureProjectReport } from "./projects";
import { renderPortalPage } from "../views/portal";
import { renderCampaignsPage } from "../views/campaigns";

const DEFAULT_TZ = "Asia/Tashkent";

const getTimeZone = (env: Record<string, unknown>): string => {
  const tz = env.DEFAULT_TZ;
  return typeof tz === "string" && tz ? tz : DEFAULT_TZ;
};

export const handlePortalSummary = async (
  request: Request,
  env: Record<string, unknown>,
  projectId: string,
): Promise<Response> => {
  const report = await ensureProjectReport(env, projectId, { force: false });
  if (!report) {
    return notFound("Report not found");
  }

  const timeZone = getTimeZone(env);
  const html = renderPortalPage(report, timeZone);
  return htmlResponse(html);
};

export const handlePortalCampaigns = async (
  request: Request,
  env: Record<string, unknown>,
  projectId: string,
): Promise<Response> => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "month";
  const onlyActive = url.searchParams.get("onlyActive") === "1";

  const report = await ensureProjectReport(env, projectId, {
    force: false,
    period,
  });
  if (!report) {
    return notFound("Report not found");
  }

  const html = renderCampaignsPage(report, { period, onlyActive });
  return htmlResponse(html);
};
