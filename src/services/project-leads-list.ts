import { getProjectLeadsList, putProjectLeadsList, type ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { R2Client } from "../infra/r2";
import type { Lead } from "../domain/leads";

const MAX_SUMMARY_LEADS = 400;

const mapLeadStatus = (leadStatus: Lead["status"]): ProjectLeadsListRecord["leads"][number]["status"] => {
  switch (leadStatus) {
    case "NEW":
      return "new";
    case "IN_PROGRESS":
      return "processing";
    case "DONE":
      return "done";
    case "TRASH":
      return "trash";
    default:
      return "new";
  }
};

const mapLeadToSummary = (lead: Lead): ProjectLeadsListRecord["leads"][number] => {
  const contactLabel = lead.phone ?? lead.contact ?? (lead.message ? "сообщение" : "");
  const trimmedContact = contactLabel.trim();
  const displayContact = trimmedContact || (lead.message ? "сообщение" : "—");
  const isMessage =
    !lead.phone && (displayContact === "—" || displayContact.toLowerCase() === "сообщение");
  return {
    id: lead.id,
    name: lead.name,
    phone: displayContact,
    createdAt: lead.createdAt,
    source: lead.source,
    campaignName: lead.campaign ?? "—",
    status: mapLeadStatus(lead.status),
    type: isMessage ? "message" : "lead",
  };
};

const createEmptyList = (): ProjectLeadsListRecord => ({ stats: { total: 0, today: 0 }, leads: [], syncedAt: null });

const sortByCreatedAtDesc = (
  a: ProjectLeadsListRecord["leads"][number],
  b: ProjectLeadsListRecord["leads"][number],
): number => {
  if (a.createdAt === b.createdAt) {
    return 0;
  }
  return a.createdAt > b.createdAt ? -1 : 1;
};

const bucketToRecord = (bucket: Map<string, ProjectLeadsListRecord["leads"][number]>): ProjectLeadsListRecord => {
  const sorted = Array.from(bucket.values()).sort(sortByCreatedAtDesc);
  const limited = sorted.slice(0, MAX_SUMMARY_LEADS);
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = limited.filter((lead) => lead.createdAt.slice(0, 10) === todayKey).length;
  return {
    stats: { total: limited.length, today },
    leads: limited,
    syncedAt: new Date().toISOString(),
  };
};

const writeBucket = async (
  r2: R2Client,
  projectId: string,
  bucket: Map<string, ProjectLeadsListRecord["leads"][number]>,
): Promise<ProjectLeadsListRecord> => {
  const record = bucketToRecord(bucket);
  await putProjectLeadsList(r2, projectId, record);
  return record;
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
  return writeBucket(r2, projectId, bucket);
};

export const markProjectLeadsSynced = async (r2: R2Client, projectId: string): Promise<ProjectLeadsListRecord> => {
  const current = (await getProjectLeadsList(r2, projectId)) ?? createEmptyList();
  const nextRecord: ProjectLeadsListRecord = {
    ...current,
    syncedAt: new Date().toISOString(),
  };
  await putProjectLeadsList(r2, projectId, nextRecord);
  return nextRecord;
};

export const rewriteProjectLeadsList = async (
  r2: R2Client,
  projectId: string,
  leads: Lead[],
): Promise<ProjectLeadsListRecord> => {
  const bucket = new Map<string, ProjectLeadsListRecord["leads"][number]>();
  for (const lead of leads) {
    bucket.set(lead.id, mapLeadToSummary(lead));
  }
  return writeBucket(r2, projectId, bucket);
};
