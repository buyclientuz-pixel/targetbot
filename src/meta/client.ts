export interface MetaStats {
  leads: number;
  spend: number;
  cpl: number;
  ctr: number;
}

export async function fetchMetaStats(): Promise<MetaStats> {
  // Placeholder: in production call Facebook Graph API
  return {
    leads: 10,
    spend: 150,
    cpl: 15,
    ctr: 2.5
  };
}
