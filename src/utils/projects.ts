import { LeadRecord, ProjectLeadStats, ProjectSummary } from "../types";
import { EnvBindings, listLeads, listProjects } from "./storage";

export interface SummarizeProjectsOptions {
  projectIds?: string[];
}

const summarizeLeads = (leads: LeadRecord[]): ProjectLeadStats => {
  let latestTimestamp = 0;
  let newCount = 0;
  let doneCount = 0;

  for (const lead of leads) {
    const created = Date.parse(lead.createdAt);
    if (!Number.isNaN(created) && created > latestTimestamp) {
      latestTimestamp = created;
    }

    if (lead.status === "done") {
      doneCount += 1;
    } else {
      newCount += 1;
    }
  }

  return {
    total: leads.length,
    new: newCount,
    done: doneCount,
    latestAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : undefined,
  };
};

export const summarizeProjects = async (
  env: EnvBindings,
  options: SummarizeProjectsOptions = {},
): Promise<ProjectSummary[]> => {
  const projects = await listProjects(env);
  const ids = options.projectIds?.length ? new Set(options.projectIds) : null;
  const targetProjects = ids ? projects.filter((project) => ids.has(project.id)) : projects;

  const summaries = await Promise.all(
    targetProjects.map(async (project) => {
      const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
      return {
        ...project,
        leadStats: summarizeLeads(leads),
      } satisfies ProjectSummary;
    }),
  );

  return summaries;
};

export const sortProjectSummaries = (summaries: ProjectSummary[]): ProjectSummary[] => {
  return [...summaries].sort((a, b) => {
    if (b.leadStats.new !== a.leadStats.new) {
      return b.leadStats.new - a.leadStats.new;
    }

    const bLatest = b.leadStats.latestAt ? Date.parse(b.leadStats.latestAt) : 0;
    const aLatest = a.leadStats.latestAt ? Date.parse(a.leadStats.latestAt) : 0;
    if (bLatest !== aLatest) {
      return bLatest - aLatest;
    }

    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
};

export const projectLeadStats = {
  summarizeLeads,
};
