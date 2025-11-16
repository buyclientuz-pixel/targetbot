export interface MetaSummaryMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messages: number;
  leadsToday: number;
  leadsTotal: number;
  cpa: number | null;
  spendToday: number;
  cpaToday: number | null;
}

export interface MetaSummaryPayload {
  periodKey: string;
  metrics: MetaSummaryMetrics;
  source: unknown;
}
