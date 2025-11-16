import { getProjectLeadsList, putProjectLeadsList, type ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { R2Client } from "../infra/r2";
import type { Lead } from "../domain/leads";

const MAX_SUMMARY_LEADS = 400;

const normalisePhone = (value: string | null): string => {
  if (!value) {
    return "";
  }
  return value;
};

const mapLeadToSummary = (lead: Lead): ProjectLeadsListRecord["leads"][number] => ({
  id: lead.id,
  name: lead.name,
  phone: normalisePhone(lead.phone),
  createdAt: lead.createdAt,
  source: lead.source,
  campaignName: lead.campaign ?? "—",
  status: lead.status.toLowerCase() as ProjectLeadsListRecord["leads"][number]["status"],
  type: lead.phone ? "lead" : "message",
});

const createEmptyList = (): ProjectLeadsListRecord => ({ stats: { total: 0, today: 0 }, leads: [] });

const sortByCreatedAtDesc = (
  a: ProjectLeadsListRecord["leads"][number],
  b: ProjectLeadsListRecord["leads"][number],
): number => {
  if (a.createdAt === b.createdAt) {
    return 0;
  }
  return a.createdAt > b.createdAt ? -1 : 1;
};

export const mergeProjectLeadsList = async (
  r2: R2Client,
  projectId: string,
  leads: Lead[],
): Promise<ProjectLeadsListRecord> => {
  if (leads.length === 0) {
    return (await getProjectLeadsList(r2, projectId)) ?? createEmptyList();
  }
  const current = (await getProjectLeadsList(r2, projectId)) ?? createEmptyList();
  const bucket = new Map(current.leads.map((lead) => [lead.id, lead] as const));
  for (const lead of leads) {
    bucket.set(lead.id, mapLeadToSummary(lead));
  }
  const sorted = Array.from(bucket.values()).sort(sortByCreatedAtDesc);
  const limited = sorted.slice(0, MAX_SUMMARY_LEADS);
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = limited.filter((lead) => lead.createdAt.slice(0, 10) === todayKey).length;
  const nextRecord: ProjectLeadsListRecord = {
    stats: { total: limited.length, today },
    leads: limited,
  };
  await putProjectLeadsList(r2, projectId, nextRecord);
  return nextRecord;
};
