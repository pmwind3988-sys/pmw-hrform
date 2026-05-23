import {
  ensureDocLibrary,
  ensureListColumns,
  ensureListSchema,
  type GraphColumnSpec,
} from "./graphClient.js";

export interface GraphListSchema {
  displayName: string;
  columns?: GraphColumnSpec[];
  template?: "genericList" | "documentLibrary";
}

export const PDPA_COLUMNS: GraphColumnSpec[] = [
  { name: "PDPAConsent", displayName: "PDPA Consent", type: "text" },
  { name: "PDPANoticeVersion", displayName: "PDPA Notice Version", type: "text" },
  { name: "PDPAConsentAt", displayName: "PDPA Consent At", type: "dateTime" },
  { name: "RetentionUntil", displayName: "Retention Until", type: "dateTime" },
];

export const ADMIN_PANEL_SETTINGS_COLUMNS: GraphColumnSpec[] = [
  { name: "BackgroundId", displayName: "BackgroundId", type: "text" },
  { name: "CustomImageUrl", displayName: "CustomImageUrl", type: "note" },
  { name: "UpdatedBy", displayName: "UpdatedBy", type: "text" },
  { name: "UpdatedAt", displayName: "UpdatedAt", type: "dateTime" },
];

export function makeGraphListSchema(
  displayName: string,
  columns: GraphColumnSpec[] = [],
  template: "genericList" | "documentLibrary" = "genericList",
): GraphListSchema {
  return { displayName, columns, template };
}

export async function ensureGraphListSchema(token: string, schema: GraphListSchema): Promise<void> {
  await ensureListSchema(token, schema.displayName, schema.columns ?? [], schema.template ?? "genericList");
}

export async function ensurePdpaColumns(token: string, listDisplayName: string): Promise<void> {
  await ensureListColumns(token, listDisplayName, PDPA_COLUMNS);
}

export async function ensureAdminPanelSettingsList(token: string, listDisplayName: string): Promise<void> {
  await ensureGraphListSchema(token, makeGraphListSchema(listDisplayName, ADMIN_PANEL_SETTINGS_COLUMNS));
}

export async function ensureUploadLibrary(token: string, libraryName: string): Promise<void> {
  await ensureDocLibrary(token, libraryName);
}
