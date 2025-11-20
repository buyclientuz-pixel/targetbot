export interface MetaSummaryMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  messages: number;
  purchases: number;
  addToCart: number;
  calls: number;
  registrations: number;
  engagement: number;
  leadsToday: number;
  messagesToday: number;
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
