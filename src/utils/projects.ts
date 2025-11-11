import { ProjectCard } from "../types";
import { readJsonFromR2 } from "./r2";

const PROJECT_INDEX_KEYS = ["meta/projects/index.json", "meta/projects.json", "projects/index.json"];

export const loadProjectCards = async (env: unknown): Promise<ProjectCard[]> => {
  for (const key of PROJECT_INDEX_KEYS) {
    const list = await readJsonFromR2<ProjectCard[]>(env as any, key);
    if (Array.isArray(list) && list.length > 0) {
      return list;
    }
  }
  return [];
};

export const findProjectCard = async (env: unknown, projectId: string): Promise<ProjectCard | null> => {
  const projects = await loadProjectCards(env);
  return projects.find((project) => project.id === projectId) || null;
};
