import { KV_KEYS } from "../config/kv";
import { R2_KEYS } from "../config/r2";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { deleteProjectRecord, requireProjectRecord, type ProjectRecord } from "../domain/spec/project";
import { getProjectsByUser, putProjectsByUser } from "../domain/spec/projects-by-user";
import {
  deleteFreeChatRecord,
  deleteOccupiedChatRecord,
  getOccupiedChatRecord,
  putFreeChatRecord,
} from "../domain/project-chats";

const deleteR2Prefix = async (r2: R2Client, prefix: string): Promise<void> => {
  let cursor: string | undefined;
  do {
    const { objects, cursor: next } = await r2.list(prefix, { cursor, limit: 100 });
    for (const object of objects) {
      await r2.delete(object.key);
    }
    cursor = next;
  } while (cursor);
};

export const cleanupProjectStorage = async (kv: KvClient, r2: R2Client, projectId: string): Promise<void> => {
  await Promise.all([
    kv.delete(KV_KEYS.billing(projectId)),
    kv.delete(KV_KEYS.autoreports(projectId)),
    kv.delete(KV_KEYS.alerts(projectId)),
    kv.delete(KV_KEYS.projectSettings(projectId)),
  ]);

  await Promise.all([
    r2.delete(R2_KEYS.projectLeadsList(projectId)).catch(() => {}),
    r2.delete(R2_KEYS.metaCampaigns(projectId)).catch(() => {}),
    r2.delete(R2_KEYS.paymentsHistory(projectId)).catch(() => {}),
  ]);

  await deleteR2Prefix(r2, `project-leads/${projectId}/`);
  await deleteR2Prefix(r2, `payments/${projectId}/`);
};

export const releaseProjectChat = async (
  kv: KvClient,
  chatId: number,
  ownerId: number | null | undefined,
): Promise<void> => {
  const occupied = await getOccupiedChatRecord(kv, chatId).catch(() => null);
  await deleteOccupiedChatRecord(kv, chatId).catch(() => null);
  await deleteFreeChatRecord(kv, chatId).catch(() => null);
  const resolvedOwner = occupied?.ownerId ?? ownerId;
  if (!resolvedOwner) {
    return;
  }
  await putFreeChatRecord(kv, {
    chatId,
    chatTitle: occupied?.chatTitle ?? null,
    topicId: occupied?.topicId ?? null,
    ownerId: resolvedOwner,
    registeredAt: new Date().toISOString(),
  });
};

export interface DeleteProjectCascadeOptions {
  project?: ProjectRecord;
}

export const deleteProjectCascade = async (
  kv: KvClient,
  r2: R2Client,
  projectId: string,
  options?: DeleteProjectCascadeOptions,
): Promise<ProjectRecord> => {
  const project = options?.project ?? (await requireProjectRecord(kv, projectId));
  if (project.chatId) {
    await releaseProjectChat(kv, project.chatId, project.ownerId);
  }
  await cleanupProjectStorage(kv, r2, projectId);
  await deleteProjectRecord(kv, projectId);
  if (project.ownerId) {
    const membership = await getProjectsByUser(kv, project.ownerId).catch(() => null);
    if (membership) {
      await putProjectsByUser(kv, project.ownerId, {
        projects: membership.projects.filter((id) => id !== projectId),
      });
    }
  }
  return project;
};
