import { jsonResponse, notFound } from "../utils/http";
import { loadProjectCards, findProjectCard } from "../utils/projects";
import { readJsonFromR2 } from "../utils/r2";
import { ProjectReport, ProjectCard } from "../types";
import { refreshProjectReport } from "../fb/reporting";

const MAX_REPORT_AGE_MS = 30 * 60 * 1000;

const isFresh = (isoDate: string | null | undefined): boolean => {
  if (!isoDate) {
    return false;
  }
  const updated = new Date(isoDate).getTime();
  if (!Number.isFinite(updated)) {
    return false;
  }
  return Date.now() - updated <= MAX_REPORT_AGE_MS;
};

const getReportKey = (projectId: string): string => `reports/${projectId}.json`;

const loadReportFromCache = async (
  env: unknown,
  projectId: string
): Promise<ProjectReport | null> => {
  return readJsonFromR2<ProjectReport>(env as any, getReportKey(projectId));
};

export const getReport = async (
  env: unknown,
  projectId: string,
  options: { forceRefresh?: boolean; period?: string } = {}
): Promise<ProjectReport | null> => {
  const cached = await loadReportFromCache(env, projectId);
  const requestedLabel = options.period || null;
  const labelMismatch =
    requestedLabel !== null && (!cached || cached.period_label !== requestedLabel);
  const forceRefresh = Boolean(options.forceRefresh) || labelMismatch;
  if (!forceRefresh && cached && isFresh(cached.updated_at)) {
    return cached;
  }

  const refreshed = await refreshProjectReport(env, projectId, { period: options.period });
  if (refreshed) {
    return refreshed;
  }
  return cached;
};

export const handleProjectsList = async (env: unknown): Promise<Response> => {
  const projects = await loadProjectCards(env);
  return jsonResponse({ projects });
};

export const handleProjectDetail = async (env: unknown, projectId: string): Promise<Response> => {
  const report = await getReport(env, projectId);
  if (!report) {
    return notFound("Project report not found");
  }
  return jsonResponse(report);
};

export const handleProjectRefresh = async (
  env: unknown,
  projectId: string,
  period?: string
): Promise<Response> => {
  const refreshed = await refreshProjectReport(env, projectId, { period });
  if (!refreshed) {
    return notFound("Unable to refresh project");
  }
  return jsonResponse(refreshed);
};

export const refreshAllProjects = async (env: unknown): Promise<{ refreshed: string[] }> => {
  const projects = await loadProjectCards(env);
  const refreshed: string[] = [];
  for (const project of projects) {
    const report = await refreshProjectReport(env, project.id);
    if (report) {
      refreshed.push(project.id);
    }
  }
  return { refreshed };
};

export const ensureProjectReport = async (
  env: unknown,
  projectId: string,
  options: { force?: boolean; period?: string } = {}
): Promise<ProjectReport | null> => {
  if (options.force) {
    return refreshProjectReport(env, projectId, { period: options.period });
  }

  return getReport(env, projectId, { period: options.period });
};

export const getProjectCard = async (
  env: unknown,
  projectId: string
): Promise<ProjectCard | null> => {
  return findProjectCard(env, projectId);
};
