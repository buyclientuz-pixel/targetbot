export const R2_KEYS = {
  projectLeadsList: (projectId: string) => `project-leads/${projectId}/list.json`,
  projectLead: (projectId: string, leadId: string) => `project-leads/${projectId}/lead_${leadId}.json`,
  legacyProjectLead: (projectId: string, leadId: string) => `project-leads/${projectId}/${leadId}.json`,
  metaCampaigns: (projectId: string) => `meta/campaigns/${projectId}.json`,
  paymentsHistory: (projectId: string) => `payments/${projectId}/history.json`,
  lead: (projectId: string, leadId: string) => `leads/${projectId}/${leadId}.json`,
  campaignStats: (projectId: string, date: string) => `campaign-stats/${projectId}/${date}.json`,
  payment: (projectId: string, paymentId: string) => `payments/${projectId}/${paymentId}.json`,
  log: (date: string, suffix: string) => `logs/${date}/${suffix}`,
} as const;
