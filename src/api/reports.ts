import type { RouteHandler } from "../core/types";
import { listReports, saveReport } from "../core/db";
import { fail, ok, readJsonBody } from "../core/utils";
import { requireAdmin } from "../core/auth";

export const listReportsHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const reports = await listReports(context.env);
  return ok({ reports });
};

export const createReportHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<{
    id?: string;
    csv?: string;
    period?: { from?: string; to?: string };
  }>(context.request);
  if (!payload?.id || !payload.csv) {
    return fail("Missing report id or csv content", 400);
  }
  await saveReport(context.env, payload.id, payload.csv, {
    from: payload.period?.from ?? "",
    to: payload.period?.to ?? "",
  });
  return ok({ id: payload.id });
};
