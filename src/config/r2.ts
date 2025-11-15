export const R2_KEYS = {
  lead: (projectId: string, leadId: string) => `leads/${projectId}/${leadId}.json`,
  campaignStats: (projectId: string, date: string) => `campaign-stats/${projectId}/${date}.json`,
  payment: (projectId: string, paymentId: string) => `payments/${projectId}/${paymentId}.json`,
  log: (date: string, suffix: string) => `logs/${date}/${suffix}`,
} as const;
