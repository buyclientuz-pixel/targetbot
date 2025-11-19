export type LeadsPanelMode = "forms" | "form";

export interface LeadsPanelContext {
  periodKey: string;
  from: string | null;
  to: string | null;
  mode: LeadsPanelMode;
  formId: string | null;
  page: number;
}

export interface LeadsPanelState extends LeadsPanelContext {
  projectId: string;
}

const normaliseLeadsPanelState = (
  projectId: string,
  options: Partial<LeadsPanelContext> = {},
): LeadsPanelState => {
  const periodKey = options.periodKey && options.periodKey.trim().length > 0 ? options.periodKey : "today";
  const isCustom = periodKey === "custom";
  const mode: LeadsPanelMode = options.mode === "form" ? "form" : "forms";
  const formId = mode === "form" ? options.formId ?? null : null;
  const page = mode === "form" ? Math.max(0, Math.floor(options.page ?? 0)) : 0;
  const from = isCustom ? options.from ?? null : null;
  const to = isCustom ? options.to ?? null : null;
  return { projectId, periodKey, mode, formId, page, from, to } satisfies LeadsPanelState;
};

const encodeStateSegment = (state: LeadsPanelState): string =>
  [state.projectId, state.periodKey, state.mode, state.formId ?? "", state.page.toString(), state.from ?? "", state.to ?? ""].join(":");

export const buildLeadsPanelId = (
  projectId: string,
  options?: Partial<LeadsPanelContext>,
): string => `project:leads:${encodeStateSegment(normaliseLeadsPanelState(projectId, options))}`;

export const buildLeadsPayloadSegment = (
  projectId: string,
  options?: Partial<LeadsPanelContext>,
): string => encodeStateSegment(normaliseLeadsPanelState(projectId, options));

export const parseLeadsPanelState = (parts: string[], startIndex = 0): LeadsPanelState => {
  const projectId = parts[startIndex] ?? "";
  const periodKey = parts[startIndex + 1] ?? "today";
  const mode: LeadsPanelMode = parts[startIndex + 2] === "form" ? "form" : "forms";
  const formIdRaw = parts[startIndex + 3] ?? "";
  const pageRaw = parts[startIndex + 4] ?? "0";
  const fromRaw = parts[startIndex + 5] ?? "";
  const toRaw = parts[startIndex + 6] ?? "";
  const isCustom = periodKey === "custom";
  const formId = mode === "form" && formIdRaw ? formIdRaw : null;
  const parsedPage = Number.parseInt(pageRaw, 10);
  const page = mode === "form" && Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 0;
  const from = isCustom && fromRaw ? fromRaw : null;
  const to = isCustom && toRaw ? toRaw : null;
  return { projectId, periodKey, mode, formId, page, from, to } satisfies LeadsPanelState;
};

export const serialiseLeadsPanelParams = (state: LeadsPanelState): string[] => [
  state.projectId,
  state.periodKey,
  state.mode,
  state.formId ?? "",
  state.page.toString(),
  state.from ?? "",
  state.to ?? "",
];

export const toLeadsPanelContext = (state: LeadsPanelState): LeadsPanelContext => ({
  periodKey: state.periodKey,
  from: state.from,
  to: state.to,
  mode: state.mode,
  formId: state.formId,
  page: state.page,
});
