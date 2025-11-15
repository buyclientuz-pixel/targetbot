import { EnvBindings, listLeads, listProjects } from "./storage";
import { LeadRecord } from "../types";

export interface LeadCounters {
  today: number;
  week: number;
  month: number;
  total: number;
}

export interface ProjectLeadAnalytics extends LeadCounters {
  projectId: string;
  projectName: string;
  lastLeadAt?: string;
}

export interface LeadAnalyticsSummary {
  totals: LeadCounters;
  projects: ProjectLeadAnalytics[];
  lastLeadAt?: string;
}

const startOfDay = (value: Date): Date => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfWeek = (value: Date): Date => {
  const copy = startOfDay(value);
  copy.setDate(copy.getDate() - 6);
  return copy;
};

const startOfMonth = (value: Date): Date => {
  const copy = startOfDay(value);
  copy.setDate(1);
  return copy;
};

const countLead = (
  lead: LeadRecord,
  dayBoundary: number,
  weekBoundary: number,
  monthBoundary: number,
): LeadCounters & { latest?: string } => {
  const created = Date.parse(lead.createdAt);
  const counters: LeadCounters & { latest?: string } = {
    today: 0,
    week: 0,
    month: 0,
    total: 1,
  };
  if (!Number.isNaN(created)) {
    if (created >= dayBoundary) {
      counters.today = 1;
    }
    if (created >= weekBoundary) {
      counters.week = 1;
    }
    if (created >= monthBoundary) {
      counters.month = 1;
    }
    counters.latest = new Date(created).toISOString();
  }
  return counters;
};

const addCounters = (target: LeadCounters, addition: LeadCounters): void => {
  target.today += addition.today;
  target.week += addition.week;
  target.month += addition.month;
  target.total += addition.total;
};

export const calculateLeadAnalytics = async (
  env: EnvBindings,
  now: Date = new Date(),
): Promise<LeadAnalyticsSummary> => {
  const projects = await listProjects(env);
  const dayBoundary = startOfDay(now).getTime();
  const weekBoundary = startOfWeek(now).getTime();
  const monthBoundary = startOfMonth(now).getTime();

  const totals: LeadCounters = { today: 0, week: 0, month: 0, total: 0 };
  let lastLeadAt: string | undefined;
  const projectSummaries: ProjectLeadAnalytics[] = [];

  await Promise.all(
    projects.map(async (project) => {
      const leads = await listLeads(env, project.id).catch(() => [] as LeadRecord[]);
      const counters: LeadCounters = { today: 0, week: 0, month: 0, total: 0 };
      let projectLatest: string | undefined;

      for (const lead of leads) {
        const delta = countLead(lead, dayBoundary, weekBoundary, monthBoundary);
        const { latest, ...rest } = delta;
        addCounters(counters, rest);
        addCounters(totals, rest);
        if (latest && (!projectLatest || Date.parse(latest) > Date.parse(projectLatest))) {
          projectLatest = latest;
        }
        if (latest && (!lastLeadAt || Date.parse(latest) > Date.parse(lastLeadAt))) {
          lastLeadAt = latest;
        }
      }

      projectSummaries.push({
        projectId: project.id,
        projectName: project.name,
        ...counters,
        lastLeadAt: projectLatest,
      });
    }),
  );

  projectSummaries.sort((a, b) => {
    if (b.today !== a.today) {
      return b.today - a.today;
    }
    if (b.week !== a.week) {
      return b.week - a.week;
    }
    return (b.lastLeadAt ? Date.parse(b.lastLeadAt) : 0) - (a.lastLeadAt ? Date.parse(a.lastLeadAt) : 0);
  });

  return {
    totals,
    projects: projectSummaries,
    lastLeadAt,
  };
};
