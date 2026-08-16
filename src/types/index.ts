// Page state machine states
export const PAGE_STATES = {
  checking: "checking",
  choice: "choice",
  guest: "guest",
  loading: "loading",
  ready: "ready",
  restricted: "restricted",
  wrongTenant: "wrong_tenant",
  error: "error",
  /**
   * Signed in on an HR-issued portal account rather than Microsoft 365. Reaches
   * the learning hub and the public routes, and nothing else — see the separate
   * route table App.tsx renders for this state.
   */
  portal: "portal",
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
  /** Published profile (PublishKey) the submission was sent under. */
  publishKey?: string;
  /** `[PREFIX-]DDMMYY-NNNN` reference, when the form has them turned on. */
  referenceNo?: string;
  /** Raw L{n}_Status of the layer currently awaiting action, for lifecycle derivation. */
  currentLayerStatus?: string;
  title: string;
  submittedByEmail: string;
  submitterName?: string;
  createdByName?: string;
  createdByEmail?: string;
  submittedAt: string | null;
  modifiedAt?: string | null;
  formStatus: string | null;
  totalLayers: number;
  layers: (ApprovalLayer | null)[];
  meta: ListMetaEntry;
  submissionData: Record<string, unknown>;
  /** Enhanced layer system: active layer number (0 = none/draft) */
  currentLayer?: number;
  /** Manual branch workflow: selected branch key/label when a branch has been chosen */
  selectedBranch?: string;
  /** Enhanced layer system: per-layer results with typed ApprovalLayerResult / EvaluationLayerResult */
  enhancedLayers?: (ApprovalLayerResult | EvaluationLayerResult | null)[];
  /** Enhanced layer system: raw layer config for this form (loaded from Master Form) */
  layerConfig?: LayerConfig | null;
  /** Published form schema for ordering submitted answers in dashboard/PDF views */
  surveyJson?: SurveyJson | null;
}

export interface HardDeleteSubmissionResult {
  deletedItem: boolean;
  deletedFiles: number;
  deletedMatrixRows: number;
  warnings: string[];
}

export interface ApprovalLayer {
  status: string;
  outcome: string | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
}

// ── Enhanced Layer System Types (Phase 0+) ──────────────────────────────────

export type LayerType = "approval" | "evaluation";
export type AuthMode = "365" | "public";
export type ConfirmationType = "signature" | "checkbox";
export type EvaluationEmailScheduleMode = "immediate" | "three_months" | "custom_days";

export interface EvaluationEmailSchedule {
  mode: EvaluationEmailScheduleMode;
  customDays?: number;
}

export type LayerStatus =
  | "pending"
  | "in_progress"
  | "confirmed"
  | "approved"
  | "rejected"
  | "skipped"
  | "cancelled";

export type FormStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "completed"
  | "rejected"
  | "cancelled";

/** Mirrors `NotifyRecipientMode` in `src/utils/layerRecipients.ts`. */
export type NotifyRecipientMode = "both" | "notify-only";

export interface FixedUserLayerAssignee {
  type: "user";
  value: string;
}

export interface FieldReferenceLayerAssignee {
  type: "field-reference";
  value: string;
}

/**
 * Several named people share one layer. Any one of them completes it — the
 * first to approve/evaluate wins and the others' links go stale.
 */
export interface MultiUserLayerAssignee {
  type: "users";
  /** Comma/semicolon/newline separated evaluator emails. */
  value: string;
}

/**
 * A distribution list or mail-enabled group. The address is expanded to its
 * members server-side at submit time (Graph `Group.Read.All`), and every member
 * becomes an actor for the layer.
 */
export interface DistributionListLayerAssignee {
  type: "distribution-list";
  /** The distribution list / group address. */
  value: string;
}

export interface DepartmentApproverLayerAssignee {
  type: "department-approver";
  value: string;
  listName?: string;
  departmentColumn?: string;
  emailColumn?: string;
  nameColumn?: string;
  roleColumn?: string;
  roleValue?: string;
}

/** Where a chain assignee starts counting from. */
export type ChainStartFrom = "submitter" | "previous-actor" | "field";

/** What to do when a chain runs out before reaching the requested hop. */
export type ChainFallback =
  | { mode: "department-hod" }
  | { mode: "fixed"; email: string }
  | { mode: "park" };

/**
 * Follows the reporting line recorded in the `Approval Directory` list, which
 * answers "who approves this person" one row per person.
 *
 * This is what lets one setting cover cases that otherwise need a rule each:
 * a clerk goes to their HOD, that HOD goes to the CFO, and the CFO goes to the
 * CEO, all from the same layer configuration, because the answer is per person
 * rather than per department.
 *
 * `startFrom: "previous-actor"` is the "evaluator's evaluator" case — it routes
 * from whoever actually acted on the layer before, so it cannot be resolved
 * until that layer completes.
 */
export interface ChainLayerAssignee {
  type: "chain";
  startFrom: ChainStartFrom;
  /** The field naming the person, when `startFrom` is "field". Otherwise "". */
  value: string;
  /** Steps up the line. 1 = their approver, 2 = their approver's approver. */
  hops: number;
  /** Take another step when a hop lands on the submitter themselves. */
  skipSelf?: boolean;
  fallback?: ChainFallback;
}

/** Where a role-holder assignee reads its department from. */
export type RoleHolderDepartmentSource = "fixed" | "from-submitter" | "from-field";

/**
 * Resolves to whoever holds a role in a department — "the Head of Safety",
 * whoever submitted. This is the functional counterpart to `chain`: a safety or
 * HR form goes to that department's head regardless of the submitter's own line.
 *
 * `from-submitter` reproduces `department-approver` while reading the
 * department off the submitter's directory row instead of a form answer.
 */
export interface RoleHolderLayerAssignee {
  type: "role-holder";
  department: RoleHolderDepartmentSource;
  /** Department name when `department` is "fixed"; field name when "from-field". */
  value: string;
  /** Directory role to match, e.g. "HOD". */
  role: string;
}

export type LayerAssignee =
  | FixedUserLayerAssignee
  | MultiUserLayerAssignee
  | DistributionListLayerAssignee
  | FieldReferenceLayerAssignee
  | DepartmentApproverLayerAssignee
  | ChainLayerAssignee
  | RoleHolderLayerAssignee;

export interface BaseLayer {
  layerNumber: number;
  type: LayerType;
  authMode: AuthMode;
  assignee: LayerAssignee;
  title?: string;
  description?: string;
  publicToken?: string;
  tokenExpiresAt?: string;
  notifyOnComplete?: boolean;
  manualPaperWhenSenderEmail?: boolean;
  submitterRoutingRules?: EvaluationSubmitterRoutingRule[];
  /**
   * Mailboxes that receive this layer's notification email but can never
   * approve/evaluate — typically a shared/team mailbox.
   */
  notifyEmails?: string[];
  /**
   * "both" (default) mails the assignee(s) and `notifyEmails`; "notify-only"
   * routes the notice exclusively to `notifyEmails` while the action still
   * belongs to the assignee(s).
   */
  notifyRecipientMode?: NotifyRecipientMode;
}

export interface ApprovalLayerConfig extends BaseLayer {
  type: "approval";
  confirmationType: ConfirmationType;
  allowRejectionReason: boolean;
}

export interface EvaluationLayerConfig extends BaseLayer {
  type: "evaluation";
  surveyElements: Record<string, unknown>[];
  confirmationLabel?: string;
  emailSchedule?: EvaluationEmailSchedule;
}

export type LayerConfigItem = ApprovalLayerConfig | EvaluationLayerConfig;

export interface EvaluationSubmitterRoutingRule {
  id: string;
  label: string;
  emailField?: string;
  emailValue?: string;
  employeeIdField?: string;
  employeeIdValue?: string;
  userIdField?: string;
  userIdValue?: string;
  fullNameField?: string;
  fullNameValue?: string;
  action: "assign-evaluator" | "manual-paper" | "send-to-configured-sender";
  evaluatorEmail?: string;
}

export interface ManualBranch {
  name: string;
  label: string;
  layers: LayerConfigItem[];
}

export interface LayerConfig {
  version: "1.0";
  layers: LayerConfigItem[];
  routing?: ConditionalRouting[];
  manualBranches?: ManualBranch[];
}

export interface ConditionalRouting {
  conditionField: string;
  rules: {
    when: string;
    skipLayers?: number[];
  }[];
}

/** Stored in EvaluationData Note column as Record<layerNumber, EvaluationDataEntry> */
export interface EvaluationDataEntry {
  status: LayerStatus;
  confirmerEmail: string;
  confirmerName: string | null;
  confirmedAt: string | null;
  fields: Record<string, unknown>;
  notes?: string;
  signatureUrl?: string | null;
}

export interface ApprovalLayerResult {
  layerNumber: number;
  type: "approval";
  status: LayerStatus;
  outcome: "approved" | "rejected" | undefined;
  email: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  signature: string | null;
  confirmedVia: ConfirmationType;
}

export interface EvaluationLayerResult {
  layerNumber: number;
  type: "evaluation";
  status: LayerStatus;
  email: string | null;
  confirmedAt: string | null;
  fields: Record<string, unknown>;
  notes?: string;
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
  layerConfigs?: Record<string, LayerConfig | null>;
  surveyJsonByFormVersion?: Record<string, Record<string, SurveyJson | null>>;
}

// Status config for badges
export interface StatusConfigEntry {
  label: string;
  colorClass: string;
  dotClass: string;
}

// SharePoint client interface
export interface SharePointClient {
  ensureSiteAccess(): Promise<void>;
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
  hardDeleteSubmission(item: Submission): Promise<HardDeleteSubmissionResult>;
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
  // Common props for ALL field types
  inputType?: string;
  autocapitalize?: "none" | "sentences" | "words" | "characters";
  placeholder?: string;
  rows?: number;
  choices?: (string | { value: string; text: string })[];
  colCount?: number;
  hasOther?: boolean;
  /** Label on the "Other" row. Unset falls back to the SurveyJS default. */
  otherText?: string;
  hasNone?: boolean;
  rateMin?: number;
  rateMax?: number;
  /**
   * A label for each point on a rating scale (SurveyJS `rateValues`). Present
   * only once an author has written at least one — a scale with none is a plain
   * `rateMin`/`rateMax` range, and an empty list here would pin the renderers to
   * a step list nobody authored.
   */
  rateValues?: { value: number | string; text: string }[];
  minRateDescription?: string;
  maxRateDescription?: string;
  labelTrue?: string;
  labelFalse?: string;
  defaultValue?: unknown;
  requiredErrorText?: string;
  format?: string;
  visibleIf?: string;
  enableIf?: string;
  titleLocation?: string;
  // Internal tracking
  _visIfField?: string;
  _visIfOp?: string;
  _visIfVal?: string;
  _enabIfField?: string;
  _enabIfOp?: string;
  _enabIfVal?: string;
  _textCustomised?: boolean;
  isManagedCompanyChoice?: boolean;
  managedPlacement?: string;
  // === LAYOUT TYPES ===
  // Page Break
  pageTitle?: string;
  pageDescription?: string;
  showPageNumber?: boolean;
  // Panel
  collapsible?: boolean;
  collapsed?: boolean;
  // Repeater
  minRows?: number;
  maxRows?: number;
  addButtonText?: string;
  removeButtonText?: string;
  showBlankRow?: boolean;
  elements?: FormBuilderField[];
  // Columns
  columnCount?: number;
  gap?: number;
  responsiveBreakpoint?: number;
  // Spacer
  height?: number;
  // Divider
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerColor?: string;
  dividerMargin?: string;

  // === TEXT TYPES ===
  maxLength?: number;
  // Rich Text
  toolbarOptions?: string[];
  stripHtmlOnExport?: boolean;
  // Password
  showToggle?: boolean;
  strengthIndicator?: boolean;
  minLength?: number;
  // Masked
  mask?: "phone" | "ic" | "creditcard" | "custom";
  guideMode?: boolean;
  // Autocomplete
  dataSource?: string[] | Record<string, unknown>[];
  minChars?: number;
  maxResults?: number;
  allowFreeText?: boolean;
  endpointUrl?: string;
  debounceMs?: number;
  // Tag Input
  delimiter?: "enter" | "comma" | "space";
  maxTags?: number;
  suggestions?: string[];
  allowDuplicates?: boolean;

  // === DATE/TIME TYPES ===
  minDate?: string;
  maxDate?: string;
  disableWeekends?: boolean;
  disableDates?: string[];
  displayFormat?: string;
  returnFormat?: "ISO" | "local" | "unix";
  // Date Range
  maxRangeDuration?: number;
  showNightsCount?: boolean;
  presets?: string[];
  // Time
  hour12Format?: boolean;
  stepMinutes?: number;
  minTime?: string;
  maxTime?: string;
  // Duration
  maxHours?: number;
  stepHours?: number;

  // === SELECTION TYPES ===
  // Dropdown/Radio/Checkbox
  searchable?: boolean;
  clearable?: boolean;
  displayAs?: "vertical" | "horizontal" | "buttongroup" | "cardgrid";
  selectAll?: boolean;
  maxSelections?: number;
  // Slider
  step?: number;
  showTooltip?: boolean;
  showMinMax?: boolean;
  prefix?: string;
  suffix?: string;
  // Range Slider
  formatValue?: string;
  // Star Rating
  allowHalfStars?: boolean;
  starIcon?: "star" | "heart" | "thumb";
  starColor?: string;
  // NPS
  lowLabel?: string;
  highLabel?: string;
  showEmojiFaces?: boolean;
  // Color Picker
  presetPalette?: string[];
  allowCustomHex?: boolean;

  // === NUMERIC TYPES ===
  // Number
  min?: number;
  max?: number;
  // Currency
  currency?: string;
  locale?: string;
  // Formula
  expression?: string;
  recalculateOnChange?: boolean;
  // Unit Converter
  unitPairs?: string[];
  defaultUnit?: string;
  showBothValues?: boolean;
  // Counter
  stepValue?: number;
  initialValue?: number;

  // === ADVANCED TYPES ===
  // File
  acceptedTypes?: string;
  maxSize?: number;
  allowMultiple?: boolean;
  showThumbnails?: boolean;
  storeInSharePoint?: boolean;
  // Image Upload
  aspectRatio?: "free" | "1:1" | "16:9" | "4:3";
  maxWidth?: number;
  maxHeight?: number;
  allowWebcam?: boolean;
  // Signature
  signatureWidth?: number;
  signatureHeight?: number;
  penColor?: string;
  backgroundColor?: string;
  exportFormat?: "PNG" | "SVG";
  // Audio Recorder
  maxDuration?: number;
  showWaveform?: boolean;
  // Address Block
  showLine2?: boolean;
  showCity?: boolean;
  showState?: boolean;
  showPostcode?: boolean;
  showCountry?: boolean;
  countryFilter?: string[];
  // Location Picker
  defaultCenter?: string;
  defaultZoom?: number;
  mapProvider?: "OSM" | "Google" | "Bing";
  showCurrentLocation?: boolean;
  radiusConstraint?: number;
  // NRIC/IC
  extractDOB?: boolean;
  extractGender?: boolean;
  extractState?: boolean;
  showExtractedInfo?: boolean;
  // Consent
  termsContent?: string;
  mustScrollToBottom?: boolean;
  dynamicmatrix?: boolean;
  matrixColumns?: string[];
  columns?: { name: string; title: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean } }[];
  rowHeaders?: string[];
  addRowText?: string;
  // Table Input
  tableConfigColumns?: { name: string; title: string; type?: string; cellType?: string; choices?: string[]; multiSelect?: boolean; choicesSource?: { list?: string; column?: string }; filteredListSource?: { list?: string; valueColumn?: string; labelColumn?: string; filterColumn?: string; filterValue?: string; choicesLoaded?: boolean }; required?: boolean }[];
  // Ranking
  rankItems?: string[];
  minItems?: number;
  maxItems?: number;
  // Budget Allocator
  totalAmount?: number;
  lineItems?: string[];
  enforceTotal?: boolean;
  // Hierarchy
  hierarchyLevels?: string[];
  hierarchyDataSource?: Record<string, unknown>[];
  // JSON Editor
  jsonSchema?: string;
  initialJson?: string;
  // Data Source
  spChoicesSource?: {
    list?: string;
    column?: string;
    labelColumn?: string;
    multiSelect?: boolean;
    filter?: string;
    choicesLoaded?: boolean;
  };
  spFilteredListSource?: {
    list?: string;
    valueColumn?: string;
    labelColumn?: string;
    filterColumn?: string;
    filterValue?: string;
    choicesLoaded?: boolean;
  };
  // Data Table
  endpoint?: string;
  dataTableColumns?: { key: string; label: string; sortable?: boolean }[];
  enablePagination?: boolean;
  pageSize?: number;
  // Chart Display
  chartType?: "bar" | "line" | "pie" | "doughnut";
  chartDataSource?: string;
  chartColors?: string[];
  // Countdown
  endDateTime?: string;
  onExpireAction?: "disable" | "message" | "redirect";
  onExpireMessage?: string;
  onExpireRedirect?: string;
  // Scorecard
  scoreExpression?: string;
  thresholds?: { green: number; amber: number; red: number };
  scoreLabel?: string;
  // Alert
  alertType?: "info" | "warning" | "error" | "success";
  alertIcon?: boolean;
  alertTitle?: string;
  alertBody?: string;
  dismissible?: boolean;
  // Image
  imageUrl?: string;
  altText?: string;
  imageMaxWidth?: string;
  caption?: string;
  linkUrl?: string;
  // Video
  videoUrl?: string;
  autoplay?: boolean;
  controls?: boolean;
  videoCaption?: string;
  // HTML
  html?: string;
  htmlBackgroundColor?: string;
  htmlPadding?: string;

  // === LOGIC RULES ===
  // Logic/condition fields
  requiredIf?: string;
  // Full logic rules (stored per field)
  logicRules?: LogicRule[];
  crossFieldValidations?: CrossFieldValidation[];
  // Simple value mapping
  value?: unknown;
  valueMapping?: { sourceField: string; transform?: string };
  // Validation
  validators?: FormValidator[];
  // State (for panels)
  state?: string;
  // Admin only
  adminOnly?: boolean;
  // Variant key
  variantKey?: string;

  // === I18N ===
  translations?: Record<string, Record<string, string>>;
  // Field permissions
  viewRoles?: string[];
  editRoles?: string[];
  readOnlyAfterSubmit?: boolean;
  // Sensitive data masking
  isSensitive?: boolean;
  // Comments/annotations
  comment?: string;
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
  errorColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  labelPosition?: string;
  pages: { name: string; elements: Record<string, unknown>[] }[];
}

export interface FormBuilderMeta {
  isoStandards?: string;
  companies?: string;
  companyChoiceEnabled?: boolean;
  showBanner?: boolean;
  formId?: string;
  formVersion?: string;
  logoUrl?: string;
  publishKey?: string;
  publishLabel?: string;
  documentHeader?: DocumentControlHeader;
  pdfConfig?: PdfConfig;
}

export interface DocumentControlHeader {
  documentNumber?: string;
  issueNumber?: string;
  effectiveDate?: string;
  revisionNumber?: string;
  revisionDate?: string;
}

export interface FormConfig {
  Id?: string;
  Title: string;
  FormID: string;
  NumberOfApprovalLayer: number;
  Slug: string;
  CurrentVersion: string;
  CurrentPublishKey?: string;
  CurrentPublishLabel?: string;
  IsPublished: boolean;
  IsPublic: boolean;
  ConditionField?: string;
  ApprovalRules?: string;
  /** Enhanced layer system: JSON string of LayerConfig */
  LayerConfig?: string | null;
}

export interface FormVersionData {
  surveyJson: SurveyJson;
  meta?: FormBuilderMeta;
  version: string;
  publishKey?: string;
  publishLabel?: string;
  publishStatus?: PublishProfileStatus;
  publishExpiresAt?: string;
  savedAt: string;
  changedBy: string;
  layerConfig?: LayerConfig | null;
}

export type PublishProfileStatus = "active" | "off";

export interface FormVersionHistory {
  FormVersion: string;
  PublishKey?: string;
  PublishLabel?: string;
  PublishStatus?: PublishProfileStatus;
  PublishExpiresAt?: string;
  DisabledAt?: string;
  DisabledBy?: string;
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

// ── Logic Rules Types ──────────────────────────────────────────────────────────────

/** Single condition in a logic rule */
export interface LogicCondition {
  field: string;           // Field name to evaluate
  operator: LogicOperator;
  value?: string;        // Static value to compare against
  fieldValue?: string;   // OR another field to compare against
}

export type LogicOperator = 
  | "equals" 
  | "notEquals" 
  | "contains" 
  | "notContains" 
  | "startsWith" 
  | "endsWith" 
  | "isEmpty" 
  | "isNotEmpty" 
  | "greaterThan" 
  | "lessThan" 
  | "greaterOrEqual" 
  | "lessOrEqual" 
  | "between" 
  | "inList" 
  | "notInList";

/** Logical connector for combining conditions */
export type LogicConnector = "AND" | "OR";

/** A complete logic rule with conditions */
export interface LogicRule {
  id: string;
  name?: string;              // Optional rule name for identification
  conditions: LogicCondition[];
  connector: LogicConnector;    // How to combine conditions
  negateResult?: boolean;     // Invert the final result
  
  // Rule type determines what action the rule performs
  ruleType: 
    | "visibility"         // Show/hide field
    | "required"          // Make field required  
    | "enable"            // Enable/disable field
    | "readonly"         // Make field read-only
    | "value";           // Set field value
  
  // For value rules
  setValue?: unknown;        // Value to set when rule triggers
  transform?: "none" | "uppercase" | "lowercase" | "trim" | "capitalize"; // Transform to apply
  
  // For visibility/enable rules - whether to show or hide
  actionWhenTrue?: "show" | "hide" | "enable" | "disable";
  
  // Metadata
  enabled: boolean;
  description?: string;
}

/** Cross-field validation rule */
export interface CrossFieldValidation {
  id: string;
  fieldA: string;
  operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" | "before" | "after";
  fieldB: string;
  errorMessage: string;
  enabled: boolean;
}

/** Global form-level rule */
export interface GlobalRule {
  id: string;
  trigger: "onLoad" | "onSubmit" | "onPageChange" | "onFieldChange";
  targetField?: string;
  conditions?: LogicCondition[];
  connector?: LogicConnector;
  action: GlobalRuleAction;
  enabled: boolean;
}

export type GlobalRuleAction = 
  | { type: "setValue"; value: unknown }
  | { type: "clearValue" }
  | { type: "showNotification"; message: string; severity: "info" | "warning" | "error" | "success" }
  | { type: "disableSubmit" }
  | { type: "triggerApi"; url: string; method: "POST" | "GET"; headers?: Record<string, string> }
  | { type: "redirect"; url: string };

/** All logic configurations for a field */
export interface FieldLogic {
  visibilityRules: LogicRule[];
  requiredRules: LogicRule[];
  enableRules: LogicRule[];
  valueRules: LogicRule[];
  crossFieldValidations: CrossFieldValidation[];
}

// ── Part 5: Data, Integration & Submission Types ─────────────────────────────────

/** REST API data source for dropdowns */
export interface DataSourceConfig {
  name: string;                  // Unique identifier for the data source
  url: string;                    // REST API endpoint URL
  labelKey: string;              // Field name for display label
  valueKey: string;              // Field name for value
  groupKey?: string;             // Optional field for option grouping
  method?: "GET" | "POST";       // HTTP method (default: GET)
  headers?: Record<string, string>; // Optional headers
  refreshInterval?: number;      // Auto-refresh interval in ms (0 = disabled)
  debounceMs?: number;           // Debounce for search queries
}

/** Webhook configuration for form events */
export interface WebhookConfig {
  id: string;
  name: string;                  // Friendly name for the webhook
  url: string;                   // Target URL
  method: "POST" | "PATCH";      // HTTP method
  events: WebhookEvent[];        // Trigger events
  payloadTemplate?: string;      // JSON template with {fieldName} tokens
  headers?: Record<string, string>; // Custom headers (e.g., auth)
  enabled: boolean;
  secret?: string;              // Optional signature secret for verification
}

/** Webhook trigger events */
export type WebhookEvent = 
  | "onSubmission"        // New submission created
  | "onApprovalDecision" // Approval status changed
  | "onFormPublished"   // Form published
  | "onFormDraftSaved";  // Draft saved

/** Email notification template */
export interface EmailTemplate {
  id: string;
  name: string;                  // Template name
  event: EmailTriggerEvent;      // When to send
  to: string;                    // Recipient: dynamic {fieldName} or static email
  cc?: string;                   // Optional CC
  bcc?: string;                  // Optional BCC
  subject: string;               // Subject line with {fieldName} tokens
  body: string;                  // HTML body with {fieldName} tokens
  attachPdf?: boolean;           // Attach PDF receipt
  enabled: boolean;
}

/** Email trigger events */
export type EmailTriggerEvent = 
  | "submissionConfirm"   // Send to submitter on successful submission
  | "newSubmissionAlert"  // Send to admins when new submission arrives
  | "approvalRequest"     // Send to approvers when approval needed
  | "approvalComplete"    // Send when approval decision made
  | "rejectionNotice";    // Send to submitter when rejected

/** PDF generation configuration */
export interface PdfConfig {
  enabled: boolean;
  headerLogoUrl?: string;         // URL for logo in header
  title: string;                 // Document title
  fieldDisplayMap?: Record<string, string>; // Field name -> Display label mapping
  footerText?: string;           // Footer text
  showSubmissionDate?: boolean;
  showApproverChain?: boolean;
  showEvaluationDetails?: boolean;
  showSignatures?: boolean;
  showStatusBadge?: boolean;
  includeEmptyEvaluationFields?: boolean;
  density?: "compact" | "comfortable";
  primaryColor?: string;
  secondaryColor?: string;
  deliveryMethod: "download" | "email" | "sharepoint";
  sharepointLibrary?: string;     // Target SharePoint document library name
  sharepointFolder?: string;      // Target folder path
}

/** Calculated submission score */
export interface ScoreConfig {
  enabled: boolean;
  expression: string;            // Formula using {fieldName} tokens, e.g., "{q1} * 0.3 + {q2} * 0.7"
  thresholds: {
    green: number;              // Score >= this = green (approved)
    amber: number;              // Score >= this = amber (review)
    red: number;                // Score < this = red (rejected)
  };
  label: string;                 // Display label, e.g., "Score", "Rating"
  saveToColumn?: string;         // Optional: save raw score to this SP column
}

/** Duplicate submission detection */
export interface DuplicateDetectionConfig {
  enabled: boolean;
  identifyBy: string[];         // Field names to check for duplicates
  action: "block" | "warn" | "overwrite";
  blockMessage?: string;         // Message shown when duplicate blocked
  warnMessage?: string;         // Warning message when duplicate found
}

/** Field-level permissions */
export interface FieldPermission {
  fieldName: string;
  viewRoles: string[];          // AD groups that can view (["All"] = everyone)
  editRoles: string[];          // AD groups that can edit
  readOnlyAfterSubmit: boolean;
  isSensitive: boolean;         // Mark as sensitive for data masking
}

/** Submission quota configuration */
export interface SubmissionQuotaConfig {
  enabled: boolean;
  maxSubmissions: number;       // Max total submissions
  maxPerUser?: number;          // Max per user (if different)
  actionWhenReached: "disable" | "message" | "redirect";
  customMessage?: string;       // Message to show when quota reached
  redirectUrl?: string;         // URL to redirect to when quota reached
}

/** Form integration settings (all Part 5 configs) */
export interface FormIntegrationSettings {
  // Data Sources
  dataSources: DataSourceConfig[];
  
  // Webhooks
  webhooks: WebhookConfig[];
  
  // Email Notifications
  emailTemplates: EmailTemplate[];
  
  // PDF Generation
  pdfConfig: PdfConfig;
  
  // Scoring
  scoreConfig: ScoreConfig;
  
  // Duplicate Detection
  duplicateDetection: DuplicateDetectionConfig;
  
  // Field Permissions
  fieldPermissions: FieldPermission[];
  
  // Submission Quota
  quotaConfig: SubmissionQuotaConfig;
  
  // Power Automate
  powerAutomateTriggerUrl?: string;
}

/** SharePoint column provisioning mapping */
export interface SpColumnMapping {
  fieldName: string;
  fieldType: string;            // SurveyJS type
  spColumnKind: number;         // SP FieldTypeKind
  spColumnName: string;         // Target SP column name
  status: "new" | "existing" | "changed" | "obsolete";
  currentType?: string;         // Current SP type (for changed)
  required: boolean;
}

// ── Career Jobs Types ───────────────────────────────────────────────────────────

export interface CustomFieldDefinition {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "choice" | "date";
  required: boolean;
  choices?: string[];
}

export interface JobListing {
  id: string;
  title: string;
  company?: string;
  jobDescription: string;
  department: string;
  location: string;
  employmentType: string;
  closingDate: string | null;
  status: string;
  applicationCount: number;
  created: string;
  customFields?: CustomFieldDefinition[];
}

/** Who the career portal is open to. Admin-controlled, stored in `AdminPanelSettings`. */
export interface CareerPortalAccessSetting {
  /** true = open to anyone; false = signed-in PMW accounts only. */
  isPublic: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

export interface CareerPortalCard {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imageSource: string;
  imageOpacity: number;
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

// ── Learning materials (e-learning hub) ──────────────────────────────────────

/** How a material is rendered. Derived from the file extension, never trusted input. */
export type LearningMaterialKind = "video" | "image" | "pdf" | "document" | "other";

/** A folder in the "Learning Materials" document library — a topic or subtopic. */
export interface LearningTopic {
  /** Library-relative path, e.g. "Safety/Fire Drill". Root is "". */
  path: string;
  name: string;
  /** "" for a top-level topic. */
  parentPath: string;
  description: string;
  sortOrder: number;
  /** Materials directly inside this folder. */
  materialCount: number;
  /** Materials in this folder and every folder below it. */
  totalMaterialCount: number;
  subtopicCount: number;
  /** Up to a few thumbnails from inside, for the folder card slideshow. */
  coverThumbnails: string[];
}

export interface LearningMaterial {
  /** Drive item id — the identity used for views, settings, and open requests. */
  id: string;
  /** File name in SharePoint, including extension. */
  fileName: string;
  /** Admin-set display title, falling back to the file name without extension. */
  title: string;
  description: string;
  kind: LearningMaterialKind;
  extension: string;
  folderPath: string;
  sizeBytes: number;
  thumbnailUrl: string;
  /**
   * Short-lived direct URL, only present for video and image materials — the
   * card previews and the viewer play the bytes straight from SharePoint.
   * Documents never expose one; they open through a server-issued embed URL.
   */
  mediaUrl?: string;
  /** Admin toggle. When false the viewer offers no download and no save action. */
  downloadable: boolean;
  sortOrder: number;
  createdAt: string;
  modifiedAt: string;
  /** Distinct signed-in accounts that have opened this material. */
  viewCount: number;
  /** Whether the requesting account is one of them. */
  viewedByMe: boolean;
}

export interface LearningLibraryData {
  topics: LearningTopic[];
  materials: LearningMaterial[];
  /** False when the library has not been provisioned in SharePoint yet. */
  libraryReady: boolean;
  /**
   * False when the view-tracking list is missing. Materials still open normally,
   * so this never stops a learner — but nothing is counted and no portal view is
   * logged until an admin provisions it.
   */
  viewsReady: boolean;
}

/**
 * Only the view numbers, without the library tree around them — what the hub
 * re-reads on a timer so a count that changes while someone is looking at the
 * page catches up without a reload.
 */
export interface LearningViewCounts {
  /** Distinct viewers, keyed by material id. A missing id means nobody yet. */
  counts: Record<string, number>;
  /** Material ids the requesting account is one of those viewers for. */
  viewedByMe: string[];
}

/** What the viewer needs to render one material. */
export interface LearningMaterialOpenResult {
  /** `embed` → iframe a SharePoint viewer; `media` → play/show the bytes directly. */
  mode: "embed" | "media";
  url: string;
  /** Only issued when the material is marked downloadable. */
  downloadUrl?: string;
}

export interface JobApplication {
  id: string;
  jobListingId: string;
  jobTitle: string;
  company?: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  resumeUrl: string;
  coverLetterUrl: string;
  status: string;
  submittedAt: string;
  modifiedAt?: string;
  submissionRef: string;
  customAnswers?: Record<string, unknown>;
  supportingDocuments?: JobDocumentLink[];
}

export interface JobsApiResponse {
  jobs: JobListing[];
  portalCards?: CareerPortalCard[];
}

export interface JobDocumentLink {
  name: string;
  url: string;
}

export interface JobApplyRequest {
  jobListingId: string;
  jobTitle: string;
  company?: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  currentPosition?: string;
  currentDepartment?: string;
  coverLetter: string;
  files: {
    name: string;
    content: string;
    contentType: string;
    role?: "resume" | "supporting" | "applicationPdf";
  }[];
  customAnswers?: Record<string, unknown>;
  accessToken?: string;
  submittedByEmail?: string;
  forceApply?: boolean;
  /** Client-generated submission ref; API will use this if provided instead of generating its own. */
  submissionRef?: string;
  pdpaConsent: boolean;
  pdpaNoticeVersion: string;
  pdpaConsentedAt: string;
  retentionUntil: string;
}

export interface JobAdminApplication {
  id: string;
  jobTitle: string;
  company?: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  status: string;
  submittedAt: string;
  modifiedAt?: string;
  submissionRef: string;
  coverLetterUrl?: string;
  resumeUrl?: string;
  supportingDocuments?: JobDocumentLink[];
  customAnswers?: Record<string, unknown>;
  jobListingId?: string;
}

export interface ReactiveFormConfig {
  [key: string]: {
    value: unknown;
    validators?: ((value: unknown) => Record<string, boolean> | null)[];
  };
}

export interface ReactiveFormResult<T> {
  controls: {
    [K in keyof T]: {
      value: T[K];
      errors: Record<string, boolean>;
      touched: boolean;
      dirty: boolean;
      setValue: (val: T[K]) => void;
      onBlur: () => void;
      setErrors: (errors: Record<string, boolean>) => void;
      clearValidators: () => void;
      setValidators: (validators: ((value: T[K]) => Record<string, boolean> | null)[]) => void;
    };
  };
  valid: boolean;
  value: T;
  errors: Record<string, Record<string, boolean>>;
  touched: boolean;
  dirty: boolean;
  setValue: (values: Partial<T>) => void;
  reset: (values?: T) => void;
  submit: (handler: (values: T) => void) => (e: React.FormEvent) => void;
}

/** Export format options */
export type ExportFormat = "json" | "csv" | "html" | "pdf" | "zip";

/** Export wizard configuration */
export interface ExportConfig {
  format: ExportFormat;
  includeEmailTemplates?: boolean;
  includeWebhookConfig?: boolean;
  includeImages?: boolean;
  pdfBlankForm?: boolean;
}
