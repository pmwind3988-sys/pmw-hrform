// Page state machine states
export const PAGE_STATES = {
  checking: "checking",
  choice: "choice",
  guest: "guest",
  loading: "loading",
  ready: "ready",
  wrongTenant: "wrong_tenant",
  error: "error",
} as const;

export type PageState = (typeof PAGE_STATES)[keyof typeof PAGE_STATES];

export type AuthDecision = "msal" | "guest";

// Submission data from SharePoint
export interface Submission {
  id: string;
  submissionId: string;
  listTitle: string;
  formId: string;
  formVersion: string;
  title: string;
  submittedByEmail: string;
  submittedAt: string | null;
  formStatus: string | null;
  totalLayers: number;
  layers: (ApprovalLayer | null)[];
  meta: ListMetaEntry;
  submissionData: Record<string, unknown>;
}

export interface ApprovalLayer {
  status: string;
  outcome: string | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
}

export interface ListMetaEntry {
  icon: string;
  color: string;
  pale: string;
  category: string;
}

export interface DiscoveredList {
  title: string;
  id: string;
  itemCount: number;
  created: string;
  hidden: boolean;
  baseTemplate: number;
  baseType?: number;
  isCatalog?: boolean;
  isSiteAssetsLibrary?: boolean;
  isApplicationList?: boolean;
  isSystemList?: boolean;
  noCrawl?: boolean;
}

export interface LoadedConfig {
  layerConfig: Record<string, number>;
  formIdMap: Record<string, string>;
  listMetaMap: Record<string, ListMetaEntry>;
  allowedTitles: Set<string>;
}

// Status config for badges
export interface StatusConfigEntry {
  label: string;
  colorClass: string;
  dotClass: string;
}

// SharePoint client interface
export interface SharePointClient {
  discoverLists(): Promise<DiscoveredList[]>;
  queryList(listName: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  queryListByGuid(listGuid: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  queryListByEmail(listName: string, userEmail: string, options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  isGroupMember(groupName: string): Promise<boolean>;
  getCurrentUserEmail(): string;
  acquireToken(): Promise<string>;
  listExists(title: string): Promise<boolean>;
  createList(title: string, description?: string): Promise<string | null>;
  addColumn(listTitle: string, internalName: string, fieldTypeKind: number, isMultiLine?: boolean): Promise<void>;
  upsertListItem(listTitle: string, filterExpr: string, body: Record<string, unknown>): Promise<{ updated: boolean; id: string }>;
  deleteListItemsWhere(listTitle: string, filterExpr: string): Promise<number>;
  getSiteUsers(): Promise<{ email: string; name: string }[]>;
}

// ── Form Builder Types ────────────────────────────────────────────────────────

export interface FormBuilderField {
  _id: string;
  type: string;
  name: string;
  title: string;
  isRequired: boolean;
  startWithNewLine: boolean;
  visible: boolean;
  readOnly: boolean;
  description: string;
  // Type-specific props
  inputType?: string;
  placeholder?: string;
  rows?: number;
  choices?: (string | { value: string; text: string })[];
  colCount?: number;
  hasOther?: boolean;
  hasNone?: boolean;
  rateMin?: number;
  rateMax?: number;
  minRateDescription?: string;
  maxRateDescription?: string;
  labelTrue?: string;
  labelFalse?: string;
  signatureWidth?: number;
  signatureHeight?: number;
  penColor?: string;
  allowMultiple?: boolean;
  acceptedTypes?: string;
  maxSize?: number;
  columns?: string[];
  rowsArray?: string[];
  items?: { name: string; title: string }[];
  expression?: string;
  displayStyle?: string;
  currency?: string;
  html?: string;
  mask?: string;
  defaultValue?: unknown;
  requiredErrorText?: string;
  visibleIf?: string;
  enableIf?: string;
  titleLocation?: string;
  _visIfField?: string;
  _visIfOp?: string;
  _visIfVal?: string;
  _enabIfField?: string;
  _enabIfOp?: string;
  _enabIfVal?: string;
  _textCustomised?: boolean;
  spChoicesSource?: {
    list?: string;
    column?: string;
    labelColumn?: string;
    multiSelect?: boolean;
    filter?: string;
    choicesLoaded?: boolean;
  };
  validators?: FormValidator[];
  // Dynamic matrix
  minRows?: number;
  maxRows?: number;
  addRowText?: string;
  // Panel
  state?: string;
  elements?: FormBuilderField[];
  // Hidden
  adminOnly?: boolean;
  // Variant key (disambiguate palette)
  variantKey?: string;
}

export interface FormValidator {
  type: string;
  text?: string;
  regex?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

export interface SurveyJson {
  title?: string;
  description?: string;
  titleLocation?: string;
  textTransform?: string;
  showQuestionNumbers?: string;
  checkErrorsMode?: string;
  textUpdateMode?: string;
  showProgressBar?: boolean;
  showPageTitles?: boolean;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  pages: { name: string; elements: Record<string, unknown>[] }[];
}

export interface FormBuilderMeta {
  isoStandards?: string;
  companies?: string;
  showBanner?: boolean;
}

export interface FormConfig {
  Id?: string;
  Title: string;
  FormID: string;
  NumberOfApprovalLayer: number;
  Slug: string;
  CurrentVersion: string;
  IsPublished: boolean;
  IsPublic: boolean;
  ConditionField?: string;
  ApprovalRules?: string;
}

export interface FormVersionData {
  surveyJson: SurveyJson;
  meta?: FormBuilderMeta;
  version: string;
  savedAt: string;
  changedBy: string;
}

export interface FormVersionHistory {
  FormVersion: string;
  PublishedAt: string;
  PublishedBy: string;
  Title: string;
}

export interface FormLogEntry {
  EventType: string;
  ChangedBy: string;
  EventSummary: string;
  BeforeJSON?: string;
  AfterJSON?: string;
  EventAt: string;
  Title: string;
}

export interface SpChoicesSource {
  list?: string;
  column?: string;
  labelColumn?: string;
  multiSelect?: boolean;
  filter?: string;
  choicesLoaded?: boolean;
}

export interface QuestionTypeDefinition {
  type: string;
  label: string;
  icon: string;
  group: string;
  description: string;
  spColumnKind: number | null;
  defaultProps: Record<string, unknown>;
  variantKey?: string;
}
