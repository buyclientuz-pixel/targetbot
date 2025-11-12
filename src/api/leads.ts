import type { RouteHandler } from "../core/types";
import { createLead, getLead, listLeads, updateLead } from "../core/db";
import { fail, ok, readJsonBody } from "../core/utils";
import { requireAdmin } from "../core/auth";

export const listLeadsHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const leads = await listLeads(context.env);
  return ok({ leads });
};

export const createLeadHandler: RouteHandler = async (context) => {
  const payload = await readJsonBody<{
    name?: string;
    contact?: string;
    notes?: string;
    userId?: number;
    source?: string;
  }>(context.request);
  if (!payload?.name || !payload.contact) {
    return fail("Missing lead name or contact", 400);
  }
  const lead = await createLead(context.env, {
    name: payload.name,
    contact: payload.contact,
    notes: payload.notes,
    source: payload.source ?? "manual",
    status: "new",
    userId: payload.userId ?? 0,
  });
  return ok({ lead });
};

export const getLeadHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const lead = await getLead(context.env, context.params.id);
  if (!lead) return fail("Lead not found", 404);
  return ok({ lead });
};

export const updateLeadHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<Partial<{ status: string; notes: string }>>(context.request);
  if (!payload) return fail("Missing body", 400);
  const updated = await updateLead(context.env, context.params.id, payload);
  if (!updated) return fail("Lead not found", 404);
  return ok({ lead: updated });
};
