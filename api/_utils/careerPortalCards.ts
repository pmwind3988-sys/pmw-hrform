import {
  createListItem,
  deleteListItem,
  ensureListSchema,
  queryListItems,
  updateListItemFields,
  type GraphColumnSpec,
  type GraphListItem,
} from "./graphClient.js";

export interface CareerPortalCardRecord {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  status: "Active" | "Hidden";
  targetType: "none" | "job" | "link";
  targetValue: string;
  colorStart?: string;
  colorEnd?: string;
  colorAccent?: string;
  isSystemDefault?: boolean;
  locked?: boolean;
  source?: "system" | "sharepoint";
  created: string;
}

export interface CareerPortalCardInput {
  title?: string;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  status?: "Active" | "Hidden";
  targetType?: "none" | "job" | "link";
  targetValue?: string;
  colorStart?: string;
  colorEnd?: string;
  colorAccent?: string;
}

export const CAREER_PORTAL_CARD_LIST = "Career Portal Cards";
const SETTINGS_LIST = "AdminPanelSettings";
const SYSTEM_DEFAULT_SETTING_TITLE = "career-portal-system-default-cards";
const SYSTEM_DEFAULT_CARD_IDS = ["system-default-1", "system-default-2", "system-default-3"] as const;
const DEFAULT_COLOR_START = "#0078D4";
const DEFAULT_COLOR_END = "#6264A7";
const DEFAULT_COLOR_ACCENT = "#16A34A";

const SYSTEM_DEFAULT_CARDS: CareerPortalCardRecord[] = [
  {
    id: "system-default-1",
    title: "Grow into your next role",
    description: "Browse internal openings, compare fit, and move forward with confidence.",
    imageUrl: "",
    sortOrder: 1,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#0078D4",
    colorEnd: "#6264A7",
    colorAccent: "#16A34A",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-2",
    title: "Your progress stays visible",
    description: "Keep every submitted application easy to find while HR reviews your next step.",
    imageUrl: "",
    sortOrder: 2,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#6264A7",
    colorEnd: "#0078D4",
    colorAccent: "#E67635",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
  {
    id: "system-default-3",
    title: "Built for PMW talent",
    description: "Internal advancement opportunities are gathered here for quick, focused browsing.",
    imageUrl: "",
    sortOrder: 3,
    status: "Active",
    targetType: "none",
    targetValue: "",
    colorStart: "#16A34A",
    colorEnd: "#0078D4",
    colorAccent: "#6264A7",
    isSystemDefault: true,
    locked: true,
    source: "system",
    created: "",
  },
];

const CAREER_PORTAL_CARD_COLUMNS: GraphColumnSpec[] = [
  { name: "CardDescription", displayName: "Description", type: "note" },
  { name: "ImageUrl", displayName: "Image URL", type: "text" },
  { name: "SortOrder", displayName: "Sort Order", type: "number" },
  { name: "Status", displayName: "Status", type: "text" },
  { name: "TargetType", displayName: "Target Type", type: "text" },
  { name: "TargetValue", displayName: "Target Value", type: "text" },
];

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusField(value: unknown): "Active" | "Hidden" {
  return String(value || "Active").toLowerCase() === "hidden" ? "Hidden" : "Active";
}

function targetTypeField(value: unknown): "none" | "job" | "link" {
  const normalized = String(value || "none").toLowerCase();
  if (normalized === "job" || normalized === "link") return normalized;
  return "none";
}

function colorField(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSystemDefaultCardId(cardId: string): boolean {
  return SYSTEM_DEFAULT_CARD_IDS.includes(cardId as typeof SYSTEM_DEFAULT_CARD_IDS[number]);
}

function mapCareerPortalCard(item: GraphListItem): CareerPortalCardRecord {
  return {
    id: String(item.id || ""),
    title: String(item.fields.Title || ""),
    description: String(item.fields.CardDescription || ""),
    imageUrl: String(item.fields.ImageUrl || ""),
    sortOrder: numberField(item.fields.SortOrder),
    status: statusField(item.fields.Status),
    targetType: targetTypeField(item.fields.TargetType),
    targetValue: String(item.fields.TargetValue || ""),
    source: "sharepoint",
    created: String(item.fields.Created || ""),
  };
}

function dateTime(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortCards(a: CareerPortalCardRecord, b: CareerPortalCardRecord): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return dateTime(b.created) - dateTime(a.created);
}

function isMissingCardListError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(`List "${CAREER_PORTAL_CARD_LIST}" not found`);
}

function isCardSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("field") || message.includes("column") || message.includes("invalidrequest");
}

function cardListSetupMessage(): string {
  return [
    `The SharePoint list "${CAREER_PORTAL_CARD_LIST}" is not ready.`,
    "Create it once in SharePoint with columns: Description, Image URL, Sort Order, Status, Target Type, and Target Value.",
  ].join(" ");
}

function settingsListSetupMessage(): string {
  return [
    `The shared settings list "${SETTINGS_LIST}" is not ready.`,
    "System default cards can still display from code, but saving edits needs the existing admin settings list.",
  ].join(" ");
}

function systemCardOverridesJson(items: GraphListItem[]): string {
  const settingItem = items.find((item) => String(item.fields.Title || "") === SYSTEM_DEFAULT_SETTING_TITLE);
  return String(settingItem?.fields.CustomImageUrl || "");
}

function normalizeSystemCardOverride(
  raw: unknown,
  fallback: CareerPortalCardRecord,
): CareerPortalCardRecord {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const targetType = value.targetType === undefined ? fallback.targetType : targetTypeField(value.targetType);
  return {
    ...fallback,
    title: trimString(value.title) || fallback.title,
    description: value.description === undefined ? fallback.description : trimString(value.description),
    sortOrder: value.sortOrder === undefined ? fallback.sortOrder : numberField(value.sortOrder),
    status: value.status === undefined ? fallback.status : statusField(value.status),
    targetType,
    targetValue: targetType === "none" ? "" : trimString(value.targetValue),
    imageUrl: "",
    colorStart: colorField(value.colorStart, fallback.colorStart || DEFAULT_COLOR_START),
    colorEnd: colorField(value.colorEnd, fallback.colorEnd || DEFAULT_COLOR_END),
    colorAccent: colorField(value.colorAccent, fallback.colorAccent || DEFAULT_COLOR_ACCENT),
    isSystemDefault: true,
    locked: true,
    source: "system",
  };
}

function parseSystemOverrides(json: string): Record<string, unknown> {
  if (!json.trim()) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function readSystemDefaultCards(token: string): Promise<CareerPortalCardRecord[]> {
  try {
    const settingsItems = await queryListItems(token, SETTINGS_LIST, { top: 100 });
    const overrides = parseSystemOverrides(systemCardOverridesJson(settingsItems));
    return SYSTEM_DEFAULT_CARDS.map((fallback) => normalizeSystemCardOverride(overrides[fallback.id], fallback));
  } catch {
    return SYSTEM_DEFAULT_CARDS.map((card) => ({ ...card }));
  }
}

function systemCardPayload(card: CareerPortalCardRecord): Record<string, unknown> {
  return {
    title: card.title,
    description: card.description,
    sortOrder: card.sortOrder,
    status: card.status,
    targetType: card.targetType,
    targetValue: card.targetValue,
    colorStart: card.colorStart,
    colorEnd: card.colorEnd,
    colorAccent: card.colorAccent,
  };
}

async function updateSystemDefaultCard(
  token: string,
  cardId: string,
  input: CareerPortalCardInput,
): Promise<void> {
  const fallback = SYSTEM_DEFAULT_CARDS.find((card) => card.id === cardId);
  if (!fallback) throw new Error("System default card not found.");

  let settingsItems: GraphListItem[];
  try {
    settingsItems = await queryListItems(token, SETTINGS_LIST, { top: 100 });
  } catch (error) {
    throw new Error(settingsListSetupMessage(), { cause: error });
  }

  const settingItem = settingsItems.find((item) => String(item.fields.Title || "") === SYSTEM_DEFAULT_SETTING_TITLE);
  const existingOverrides = parseSystemOverrides(systemCardOverridesJson(settingsItems));
  const current = normalizeSystemCardOverride(existingOverrides[cardId], fallback);
  const next = normalizeSystemCardOverride({ ...systemCardPayload(current), ...input, imageUrl: "" }, fallback);
  const nextOverrides = {
    ...existingOverrides,
    [cardId]: systemCardPayload(next),
  };
  const fields = {
    Title: SYSTEM_DEFAULT_SETTING_TITLE,
    BackgroundId: SYSTEM_DEFAULT_SETTING_TITLE,
    CustomImageUrl: JSON.stringify(nextOverrides),
    UpdatedAt: new Date().toISOString(),
  };

  try {
    if (settingItem) {
      await updateListItemFields(token, SETTINGS_LIST, settingItem.id, fields);
    } else {
      await createListItem(token, SETTINGS_LIST, fields);
    }
  } catch (error) {
    throw new Error(settingsListSetupMessage(), { cause: error });
  }
}

async function withCardListSetupMessage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingCardListError(error) || isCardSchemaError(error)) {
      throw new Error(cardListSetupMessage(), { cause: error });
    }
    throw error;
  }
}

export async function ensureCareerPortalCardList(token: string): Promise<void> {
  await ensureListSchema(token, CAREER_PORTAL_CARD_LIST, CAREER_PORTAL_CARD_COLUMNS);
}

export async function listCareerPortalCards(
  token: string,
  options: { activeOnly?: boolean } = {},
): Promise<CareerPortalCardRecord[]> {
  const systemCards = await readSystemDefaultCards(token);
  let items: GraphListItem[];
  try {
    items = await queryListItems(token, CAREER_PORTAL_CARD_LIST, { top: 500 });
  } catch (error) {
    if (isMissingCardListError(error)) {
      return systemCards
        .filter((card) => !options.activeOnly || card.status === "Active")
        .sort(sortCards);
    }
    throw error;
  }
  return [
    ...systemCards,
    ...items.map(mapCareerPortalCard),
  ]
    .filter((card) => !options.activeOnly || card.status === "Active")
    .sort(sortCards);
}

export function parseCareerPortalCardInput(
  raw: Record<string, unknown>,
  options: { partial?: boolean } = {},
): CareerPortalCardInput {
  const title = trimString(raw.title);
  if (!options.partial && !title) {
    throw new Error("Missing required field: title");
  }

  const sortOrderRaw = raw.sortOrder;
  const parsedSortOrder = sortOrderRaw === undefined || sortOrderRaw === ""
    ? undefined
    : Number(sortOrderRaw);
  if (parsedSortOrder !== undefined && !Number.isFinite(parsedSortOrder)) {
    throw new Error("Sort order must be a number");
  }

  const status = raw.status === undefined
    ? undefined
    : statusField(raw.status);
  const targetType = raw.targetType === undefined
    ? undefined
    : targetTypeField(raw.targetType);

  return {
    ...(title || !options.partial ? { title } : {}),
    ...(raw.description !== undefined ? { description: trimString(raw.description) } : {}),
    ...(raw.imageUrl !== undefined ? { imageUrl: trimString(raw.imageUrl) } : {}),
    ...(parsedSortOrder !== undefined ? { sortOrder: parsedSortOrder } : {}),
    ...(status ? { status } : {}),
    ...(targetType ? { targetType } : {}),
    ...(raw.targetValue !== undefined ? { targetValue: trimString(raw.targetValue) } : {}),
    ...(raw.colorStart !== undefined ? { colorStart: colorField(raw.colorStart, DEFAULT_COLOR_START) } : {}),
    ...(raw.colorEnd !== undefined ? { colorEnd: colorField(raw.colorEnd, DEFAULT_COLOR_END) } : {}),
    ...(raw.colorAccent !== undefined ? { colorAccent: colorField(raw.colorAccent, DEFAULT_COLOR_ACCENT) } : {}),
  };
}

function cardFields(input: CareerPortalCardInput): Record<string, unknown> {
  return {
    ...(input.title !== undefined ? { Title: input.title } : {}),
    ...(input.description !== undefined ? { CardDescription: input.description } : {}),
    ...(input.imageUrl !== undefined ? { ImageUrl: input.imageUrl } : {}),
    ...(input.sortOrder !== undefined ? { SortOrder: input.sortOrder } : {}),
    ...(input.status !== undefined ? { Status: input.status } : {}),
    ...(input.targetType !== undefined ? { TargetType: input.targetType } : {}),
    ...(input.targetValue !== undefined ? { TargetValue: input.targetValue } : {}),
  };
}

export async function createCareerPortalCard(
  token: string,
  input: CareerPortalCardInput,
): Promise<{ id: string }> {
  return withCardListSetupMessage(() =>
    createListItem(token, CAREER_PORTAL_CARD_LIST, {
      Title: input.title || "",
      CardDescription: input.description || "",
      ImageUrl: input.imageUrl || "",
      SortOrder: input.sortOrder ?? 0,
      Status: input.status || "Active",
      TargetType: input.targetType || "none",
      TargetValue: input.targetValue || "",
    }),
  );
}

export async function updateCareerPortalCard(
  token: string,
  cardId: string,
  input: CareerPortalCardInput,
): Promise<void> {
  if (isSystemDefaultCardId(cardId)) {
    await updateSystemDefaultCard(token, cardId, input);
    return;
  }

  await withCardListSetupMessage(() =>
    updateListItemFields(token, CAREER_PORTAL_CARD_LIST, cardId, cardFields(input)),
  );
}

export async function deleteCareerPortalCard(token: string, cardId: string): Promise<void> {
  if (isSystemDefaultCardId(cardId)) {
    throw new Error("System default cards cannot be deleted.");
  }

  await withCardListSetupMessage(() => deleteListItem(token, CAREER_PORTAL_CARD_LIST, cardId));
}
