import type { DiscoveredList, ListMetaEntry, LoadedConfig, SharePointClient } from "../types";

const ADMIN_GROUP = "_HR_ Forms Owners";

const EXCLUDE_ALWAYS = [
  "Style Library",
  "Site Assets",
  "Approvers",
  "Master Form",
  "Submission Log",
  "Approval Log",
  "Site Pages",
  "Form Templates",
  "Preservation Hold Library",
  "Pages",
  "Images",
  "Form Documents",
  "Form Config",
] as const;

export const SP_STATIC = {
  adminGroup: ADMIN_GROUP,
  statusColumn: null,
  excludeAlways: [...EXCLUDE_ALWAYS],
} as const;

const META_PALETTES = [
  { color: "#1a73e8", pale: "#e8f0fe" },
  { color: "#34a853", pale: "#e6f4ea" },
  { color: "#fbbc04", pale: "#fef7e0" },
  { color: "#ea4335", pale: "#fce8e6" },
  { color: "#9c27b0", pale: "#f3e5f5" },
  { color: "#ff6d00", pale: "#fff3e0" },
  { color: "#00897b", pale: "#e0f2f1" },
  { color: "#5c6bc0", pale: "#e8eaf6" },
] as const;

const ICON_POOL = [
  "Description",
  "Assignment",
  "FactCheck",
  "HowToReg",
  "Verified",
  "Approval",
  "TaskAlt",
  "CheckCircle",
  "Gavel",
  "Policy",
  "Security",
  "AdminPanelSettings",
  "WorkOutline",
  "BusinessCenter",
  "Engineering",
  "Build",
  "Construction",
  "Handyman",
  "HomeRepairService",
  "Plumbing",
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateMeta(listTitle: string): ListMetaEntry {
  const hash = hashString(listTitle);
  const paletteIndex = hash % META_PALETTES.length;
  const iconIndex = (hash >> 8) % ICON_POOL.length;

  const palette = META_PALETTES[paletteIndex];
  const icon = ICON_POOL[iconIndex];

  return {
    icon,
    color: palette.color,
    pale: palette.pale,
    category: "General",
  };
}

export async function loadConfig(
  spClient: SharePointClient
): Promise<LoadedConfig> {
  const layerConfig: Record<string, number> = {};
  const formIdMap: Record<string, string> = {};
  const listMetaMap: Record<string, ListMetaEntry> = {};
  const allowedTitles = new Set<string>();

  try {
    const configItems = await spClient.queryList("Master Form", {
      select: "Title,FormId,FormVersion,TotalLayers",
    });

    for (const item of configItems) {
      const title = String(item.Title || "");
      const formId = String(item.FormId || "");
      const totalLayers = Number(item.TotalLayers) || 1;

      if (!title) continue;

      allowedTitles.add(title);
      layerConfig[title] = totalLayers;
      formIdMap[title] = formId;
      listMetaMap[title] = generateMeta(title);
    }
  } catch {
    // Master Form list may not exist yet
  }

  return {
    layerConfig,
    formIdMap,
    listMetaMap,
    allowedTitles,
  };
}

// SharePoint BaseTemplate values for system lists to always exclude (both user & admin)
// Source: https://learn.microsoft.com/sharepoint/dev/sp-add-ins/working-with-lists-and-list-items-with-rest
const SYSTEM_BASE_TEMPLATES = new Set([
  109,  // PictureLibrary
  111,  // WebTemplateCatalog (Web Part Gallery / List Template Catalog)
  112,  // UserInfo (User Information List)
  113,  // WebPartCatalog
  114,  // ListTemplateCatalog
  116,  // MasterPageCatalog
  119,  // WebPageLibrary (Site Pages / Wiki Page Library)
  130,  // DataConnectionLibrary
  140,  // WorkflowHistory
  212,  // WorkflowProcess
  300,  // SharePointServerPublishing (Publishing Infrastructure)
  850,  // Pages (Publishing)
]);

export function filterVisibleLists(
  discoveredLists: DiscoveredList[],
  isAdmin: boolean,
  allowedTitles: Set<string>
): DiscoveredList[] {
  return discoveredLists.filter((list) => {
    const title = list.title;

    // Always exclude lists marked Hidden in SharePoint (both user & admin)
    if (list.hidden) {
      return false;
    }

    // Always exclude system BaseTemplate types (both user & admin)
    if (SYSTEM_BASE_TEMPLATES.has(list.baseTemplate)) {
      return false;
    }

    // Always exclude by SharePoint's own system flags (both user & admin)
    if (list.isCatalog || list.isSiteAssetsLibrary || list.isApplicationList || list.isSystemList || list.noCrawl) {
      return false;
    }

    // Always exclude by name as a fallback (both user & admin)
    if ((EXCLUDE_ALWAYS as readonly string[]).includes(title)) {
      return false;
    }

    // If admin, show all non-excluded lists
    if (isAdmin) {
      return true;
    }

    // Non-admin: only show allowed titles from Master Form
    return allowedTitles.has(title);
  });
}

export function getMissingConfigs(
  visibleLists: { title: string }[],
  layerConfig: Record<string, number>
): string[] {
  return visibleLists
    .map((list) => list.title)
    .filter((title) => !(title in layerConfig));
}
