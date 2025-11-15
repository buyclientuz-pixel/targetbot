import { getMetaCache } from "../domain/meta-cache";
import type { MetaSummaryMetrics, MetaSummaryPayload } from "../domain/meta-summary";
import type { KvClient } from "../infra/kv";

export const loadProjectTodayMetrics = async (
  kv: KvClient,
  projectId: string,
): Promise<MetaSummaryMetrics | null> => {
  const cached = await getMetaCache<MetaSummaryPayload>(kv, projectId, "summary:today");
  if (!cached) {
    return null;
  }
  return cached.payload.metrics;
};
