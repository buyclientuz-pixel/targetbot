import type { KvClient } from "../infra/kv";
import { ensureProjectSettings, upsertProjectSettings } from "../domain/project-settings";
import { getProjectsByUser } from "../domain/spec/projects-by-user";

const applyMetaAccount = async (
  kv: KvClient,
  projectId: string,
  facebookUserId: string,
): Promise<boolean> => {
  if (!facebookUserId) {
    return false;
  }
  const settings = await ensureProjectSettings(kv, projectId);
  if (settings.meta.facebookUserId === facebookUserId) {
    return false;
  }
  const updated = {
    ...settings,
    meta: { ...settings.meta, facebookUserId },
    updatedAt: new Date().toISOString(),
  };
  await upsertProjectSettings(kv, updated);
  return true;
};

export const syncProjectMetaAccount = async (
  kv: KvClient,
  projectId: string,
  facebookUserId: string | null,
): Promise<boolean> => {
  if (!facebookUserId) {
    return false;
  }
  return applyMetaAccount(kv, projectId, facebookUserId);
};

export const syncUserProjectsMetaAccount = async (
  kv: KvClient,
  userId: number,
  facebookUserId: string | null,
): Promise<number> => {
  if (!facebookUserId) {
    return 0;
  }
  const membership = await getProjectsByUser(kv, userId);
  if (!membership || membership.projects.length === 0) {
    return 0;
  }
  let changed = 0;
  for (const projectId of membership.projects) {
    if (await applyMetaAccount(kv, projectId, facebookUserId)) {
      changed += 1;
    }
  }
  return changed;
};
