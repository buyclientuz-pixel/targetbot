import { listLeads, type Lead } from "../domain/leads";
import { getProjectLeadsList, type ProjectLeadsListRecord } from "../domain/spec/project-leads";
import type { R2Client } from "../infra/r2";
import { resolvePeriodRange } from "./project-insights";
import { resolvePortalPeriodRange } from "./period-range";

const PROJECT_LEAD_STATUSES: ProjectLeadsListRecord["leads"][number]["status"][] = [
  "new",
  "processing",
  "done",
  "trash",
];

const normaliseLeadContact = (lead: Lead): string => {
  if (lead.contact && lead.contact.trim().length > 0) {
    const contact = lead.contact.trim();
    return contact.toLowerCase() === "сообщение" ? "сообщение" : contact;
  }
  if (lead.phone) {
    return lead.phone;
  }
  if (lead.message) {
    return "сообщение";
  }
  return "—";
};

const mapLeadStatus = (status: Lead["status"]): ProjectLeadsListRecord["leads"][number]["status"] => {
  switch (status) {
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

export interface LeadViewEntry {
  id: string;
  name: string;
  phone: string;
  contact: string;
  message: string | null;
  createdAt: string;
  source: string;
  campaignName: string;
  campaignId: string | null;
  status: ProjectLeadsListRecord["leads"][number]["status"];
  type: string | null;
}

const mapLeadToViewEntry = (lead: Lead): LeadViewEntry => {
  const contact = normaliseLeadContact(lead);
  const isMessage = !lead.phone && (contact === "—" || contact.toLowerCase() === "сообщение");
  return {
    id: lead.id,
    name: lead.name,
    phone: contact,
    contact,
    message: lead.message ?? null,
    createdAt: lead.createdAt,
    source: lead.source,
    campaignName: lead.campaign ?? "—",
    campaignId: lead.campaignId ?? null,
    status: mapLeadStatus(lead.status),
    type: isMessage ? "message" : "lead",
  };
};

const mapSummaryLeadToViewEntry = (lead: ProjectLeadsListRecord["leads"][number]): LeadViewEntry => ({
  id: lead.id,
  name: lead.name,
  phone: lead.phone,
  contact: lead.phone,
  message: null,
  createdAt: lead.createdAt,
  source: lead.source,
  campaignName: lead.campaignName,
  campaignId: null,
  status: lead.status,
  type: lead.type ?? null,
});

const sortLeadsDesc = (a: LeadViewEntry, b: LeadViewEntry): number => {
  if (a.createdAt === b.createdAt) {
    return 0;
  }
  return a.createdAt > b.createdAt ? -1 : 1;
};

const countTodayLeads = (
  leads: ProjectLeadsListRecord["leads"],
  timeZone: string | null,
): number => {
  if (leads.length === 0) {
    return 0;
  }
  const todayRange = resolvePeriodRange("today", timeZone ?? undefined);
  const fromTime = todayRange.from.getTime();
  const toTime = todayRange.to.getTime();
  return leads.filter((lead) => {
    const created = Date.parse(lead.createdAt);
    return Number.isFinite(created) && created >= fromTime && created <= toTime;
  }).length;
};

export interface ProjectLeadsViewPayload {
  period: ReturnType<typeof resolvePortalPeriodRange>["period"];
  periodKey: string;
  leads: LeadViewEntry[];
  stats: ProjectLeadsListRecord["stats"];
  periodStats: ProjectLeadsListRecord["stats"];
  countsByStatus: Record<ProjectLeadsListRecord["leads"][number]["status"], number>;
  syncedAt: string | null;
}

export interface LoadProjectLeadsViewOptions {
  periodKey: string;
  timeZone: string | null;
  from?: string | null;
  to?: string | null;
  liveLeads?: Lead[] | null;
  liveSyncedAt?: string | null;
}

export const loadProjectLeadsView = async (
  r2: R2Client,
  projectId: string,
  options: LoadProjectLeadsViewOptions,
): Promise<ProjectLeadsViewPayload> => {
  const range = resolvePortalPeriodRange(options.periodKey, options.timeZone, options.from ?? null, options.to ?? null);
  const fromTime = range.from.getTime();
  const toTime = range.to.getTime();
  const summaryRecord = (await getProjectLeadsList(r2, projectId)) ?? null;
  const useLiveLeads = Array.isArray(options.liveLeads) && options.liveLeads.length > 0;
  const storedLeads = useLiveLeads ? [] : await listLeads(r2, projectId);
  const baseLeads = useLiveLeads
    ? options.liveLeads!.map(mapLeadToViewEntry)
    : storedLeads.length > 0
      ? storedLeads.map(mapLeadToViewEntry)
      : (summaryRecord?.leads ?? []).map(mapSummaryLeadToViewEntry);
  const filtered = baseLeads
    .filter((lead) => {
      const created = Date.parse(lead.createdAt);
      return Number.isFinite(created) && created >= fromTime && created <= toTime;
    })
    .sort(sortLeadsDesc);
  const counts = PROJECT_LEAD_STATUSES.reduce(
    (acc, status) => ({ ...acc, [status]: 0 }),
    {} as Record<ProjectLeadsListRecord["leads"][number]["status"], number>,
  );
  for (const lead of filtered) {
    counts[lead.status] = (counts[lead.status] ?? 0) + 1;
  }
  const overallStats = useLiveLeads
    ? { total: baseLeads.length, today: countTodayLeads(baseLeads, options.timeZone ?? null) }
    : summaryRecord?.stats ?? {
        total: baseLeads.length,
        today: countTodayLeads(baseLeads, options.timeZone ?? null),
      };
  return {
    period: range.period,
    periodKey: range.key,
    leads: filtered,
    stats: overallStats,
    periodStats: { total: filtered.length, today: countTodayLeads(filtered, options.timeZone ?? null) },
    countsByStatus: counts,
    syncedAt: useLiveLeads ? options.liveSyncedAt ?? new Date().toISOString() : summaryRecord?.syncedAt ?? null,
  } satisfies ProjectLeadsViewPayload;
};
