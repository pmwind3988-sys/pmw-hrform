# PDF Template Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a form admin rearrange, restyle and write free text into the PDF produced for that form's submissions, starting from the PDF it produces today.

**Architecture:** A template is an ordered list of typed blocks stored on `FormBuilderMeta` beside `pdfConfig`. Smart blocks are thin wrappers over the section renderers extracted out of `FormPdfDocument.tsx`, so the default template is the current layout by construction rather than by imitation. Content blocks (text, table, image, divider, spacer, page break) are authored by the admin and may embed variables that resolve against the submission. `FormPdfDocument` branches once at the top: template present → render blocks; absent → today's code path, untouched.

**Tech Stack:** TypeScript, React 18, `@react-pdf/renderer` 4.5, Vite, Vitest, MUI icons (builder UI only).

**Spec:** `docs/superpowers/specs/2026-09-14-pdf-template-editor-design.md`

## Global Constraints

- No new runtime dependency. Rendering stays on `@react-pdf/renderer`; the editor uses React plus the MUI icons already in `package.json`.
- A form with no template must produce a byte-identical document to today. Task 4's equivalence test is the guard.
- Source files in this repo are CRLF. Use the Write/Edit tools, not heredocs, when creating or patching files.
- Verify with `npx tsc -b` — it must match the Vercel deploy build. `npm run build` runs `tsc -b && vite build`.
- Run tests with `npx vitest run <path>`. There is no `npm test` script.
- Fields are referenced by internal SurveyJS name, never by label.
- Every block type must render without throwing for empty, missing and malformed data.
- Follow the file header comment convention: `/** FileName.ts — one-line purpose. */`

## Section inventory (read before Task 2)

Reading `src/utils/FormPdfDocument.tsx:609-769`, today's page is **ten** regions, not the six named informally in the spec:

| Region | Lines | Becomes |
|---|---|---|
| Header (logo + title + doc ref) | 611-620 | smart block `header` |
| Document control grid | 622-632 | smart block `documentControl` |
| Status badge | 634-637 | smart block `statusBadge` |
| Info grid | 639-657 | smart block `submissionMeta` |
| Form fields | 659-687 | smart block `answers` |
| Approval/evaluation chain | 690-708 | smart block `approvals` |
| Signature blocks | 710-732 | smart block `signatures` |
| Evaluation details | 734-762 | smart block `evaluationDetails` |
| ISO standards strip | 764-768 | smart block `isoStandards` |
| Footer | 770-773 | **page chrome, not a block** |

The footer is `position: "absolute"` + `fixed`, so it is painted on every page rather than flowing in document order. It stays outside the block list and keeps being driven by `pdfConfig.footerText`. The plan uses **nine** smart block types.

---

### Task 1: Template types and test plumbing

**Files:**
- Create: `src/utils/pdfTemplate/types.ts`
- Modify: `src/types/index.ts:803-815` (add `pdfTemplate` to `FormBuilderMeta`)
- Modify: `vitest.config.ts:5` (include `.test.tsx`)
- Test: `src/utils/pdfTemplate/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PdfTemplate`, `PdfBlock`, `SmartBlockType`, `BlockStyle`, `RichText`, `RichSpan`, `isPdfTemplate(value: unknown): value is PdfTemplate`.

- [ ] **Step 1: Allow `.test.tsx` files to run**

In `vitest.config.ts`, change the `include` line to:

```ts
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/_utils/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/pdfTemplate/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPdfTemplate } from "./types";

describe("isPdfTemplate", () => {
  it("accepts a template with a version and a block list", () => {
    expect(isPdfTemplate({ version: 1, blocks: [{ id: "a", kind: "smart", smart: "header" }] })).toBe(true);
  });

  it("accepts an empty block list", () => {
    expect(isPdfTemplate({ version: 1, blocks: [] })).toBe(true);
  });

  it("rejects a missing block list", () => {
    expect(isPdfTemplate({ version: 1 })).toBe(false);
  });

  it("rejects blocks that are not objects", () => {
    expect(isPdfTemplate({ version: 1, blocks: ["header"] })).toBe(false);
  });

  it("rejects blocks with no id", () => {
    expect(isPdfTemplate({ version: 1, blocks: [{ kind: "smart", smart: "header" }] })).toBe(false);
  });

  it("rejects null, strings and arrays", () => {
    expect(isPdfTemplate(null)).toBe(false);
    expect(isPdfTemplate("{}")).toBe(false);
    expect(isPdfTemplate([])).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 4: Write the types**

Create `src/utils/pdfTemplate/types.ts`:

```ts
/**
 * types.ts — Block model for the per-form PDF template.
 *
 * A template is an ordered block list. Smart blocks redraw themselves from the
 * submission; content blocks hold what the admin wrote. Unknown `kind` values
 * are tolerated on read so an older build can open a newer template without
 * losing the blocks it does understand.
 */

/** The regions of today's built-in layout, each available as one block. */
export type SmartBlockType =
  | "header"
  | "documentControl"
  | "statusBadge"
  | "submissionMeta"
  | "answers"
  | "approvals"
  | "signatures"
  | "evaluationDetails"
  | "isoStandards";

export interface BlockStyle {
  fontFamily?: "Helvetica" | "Times-Roman" | "Courier";
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right" | "justify";
  marginTop?: number;
  marginBottom?: number;
  paddingX?: number;
  paddingY?: number;
  background?: string;
  borderWidth?: number;
  borderColor?: string;
  /** Start this block on a fresh page. */
  breakBefore?: boolean;
}

/** One run of text, or one variable reference, inside a text block. */
export interface RichSpan {
  text?: string;
  /** Internal field name or built-in token; see variables.ts. */
  variable?: string;
  /** Printed when the variable resolves to nothing. */
  fallback?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  color?: string;
}

export interface RichParagraph {
  spans: RichSpan[];
  align?: BlockStyle["align"];
  /** Renders as a bulleted or numbered item when set. */
  list?: "bullet" | "number";
}

export type RichText = RichParagraph[];

export interface SmartBlock {
  id: string;
  kind: "smart";
  smart: SmartBlockType;
  style?: BlockStyle;
  /** Per-smart-block settings, e.g. `{ heading: "FORM DATA" }`. */
  settings?: Record<string, unknown>;
}

export interface TextBlock {
  id: string;
  kind: "text";
  content: RichText;
  style?: BlockStyle;
}

export interface TableBlock {
  id: string;
  kind: "table";
  /** Column widths as percentages summing to 100. */
  widths: number[];
  /** First row is the header row when `hasHeader`. */
  rows: RichText[][];
  hasHeader?: boolean;
  style?: BlockStyle;
}

export interface ImageBlock {
  id: string;
  kind: "image";
  src: string;
  width?: number;
  height?: number;
  style?: BlockStyle;
}

export interface DividerBlock {
  id: string;
  kind: "divider";
  style?: BlockStyle;
}

export interface SpacerBlock {
  id: string;
  kind: "spacer";
  height: number;
  style?: BlockStyle;
}

export interface PageBreakBlock {
  id: string;
  kind: "pageBreak";
  style?: BlockStyle;
}

export type PdfBlock =
  | SmartBlock
  | TextBlock
  | TableBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | PageBreakBlock;

export interface PdfTemplate {
  version: 1;
  blocks: PdfBlock[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural check only. Individual blocks are validated at render time, where
 * a bad one is skipped rather than costing the whole document.
 */
export function isPdfTemplate(value: unknown): value is PdfTemplate {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.blocks)) return false;
  return value.blocks.every((block) => isRecord(block) && typeof block.id === "string" && typeof block.kind === "string");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/pdfTemplate/types.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Hang the template off form meta**

In `src/types/index.ts`, add to `FormBuilderMeta` (after `pdfConfig?: PdfConfig;` at line 814):

```ts
  /** Per-form PDF block template. Absent means the built-in layout. */
  pdfTemplate?: PdfTemplate;
```

and add to the import/export surface at the top of the file's type section:

```ts
import type { PdfTemplate } from "../utils/pdfTemplate/types";
export type { PdfTemplate } from "../utils/pdfTemplate/types";
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/utils/pdfTemplate/types.ts src/utils/pdfTemplate/types.test.ts src/types/index.ts vitest.config.ts
git commit -m "Add the PDF template block model"
```

---

### Task 2: Extract the PDF sections

A pure refactor. `FormPdfDocument.tsx` is 770 lines and both render paths must share one implementation of each region — that sharing is what makes the default template faithful. No behaviour changes here.

**Files:**
- Create: `src/utils/pdfSections/styles.ts` (the `C` and `S` constants, moved)
- Create: `src/utils/pdfSections/helpers.tsx` (the formatting/probing helpers, moved)
- Create: `src/utils/pdfSections/sections.tsx` (nine section components)
- Create: `src/utils/pdfSections/context.ts` (`PdfSectionContext`)
- Modify: `src/utils/FormPdfDocument.tsx` (import the sections, delete the moved code)
- Test: `src/utils/pdfSections/sections.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `PdfSectionContext` — `{ data: PdfFormData; formSections: FormSubmissionSection[]; title: string; primary: string; secondary: string; comfortable: boolean; referenceNo: string; selectedCompany: string; effectiveLogoUrl?: string; layoutConfig?: PdfConfig }`
  - `buildPdfSectionContext(data: PdfFormData): PdfSectionContext`
  - Nine components, each `(props: { ctx: PdfSectionContext }) => JSX.Element | null`: `HeaderSection`, `DocumentControlSection`, `StatusBadgeSection`, `SubmissionMetaSection`, `AnswersSection`, `ApprovalsSection`, `SignaturesSection`, `EvaluationDetailsSection`, `IsoStandardsSection`
  - `FooterChrome` — `(props: { ctx: PdfSectionContext }) => JSX.Element`
  - `S` and `C` re-exported from `./styles`

Each section returns `null` under exactly the condition that hides it today (e.g. `StatusBadgeSection` returns `null` when `layoutConfig?.showStatusBadge === false`), so visibility logic moves with the markup instead of being duplicated at the call site.

- [ ] **Step 1: Write the characterisation test first**

This test pins today's output *before* anything moves, so the refactor is provably behaviour-preserving. Create `src/utils/pdfSections/sections.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToJson, sampleFormData } from "./testSupport";
import FormPdfDocument from "../FormPdfDocument";

describe("FormPdfDocument", () => {
  it("renders the same element tree after the section extraction", () => {
    expect(renderToJson(FormPdfDocument(sampleFormData()))).toMatchSnapshot();
  });

  it("renders without throwing when there are no layers and no answers", () => {
    const data = sampleFormData();
    data.layerResults = [];
    data.responseData = {};
    expect(() => renderToJson(FormPdfDocument(data))).not.toThrow();
  });
});
```

- [ ] **Step 2: Write the test support module**

Create `src/utils/pdfSections/testSupport.tsx`:

```tsx
/**
 * testSupport.tsx — Fixtures and a serializer for PDF element trees.
 *
 * Rendering real PDF bytes is slow and compares badly. Serializing the React
 * element tree instead catches every structural or style change while running
 * in milliseconds.
 */
import type { ReactElement, ReactNode } from "react";
import type { PdfFormData } from "../FormPdfDocument";

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: unknown[];
}

function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "Anonymous";
  const named = type as { displayName?: string };
  return named?.displayName || "Unknown";
}

function serializeChild(child: ReactNode): unknown {
  if (child === null || child === undefined || typeof child === "boolean") return null;
  if (typeof child === "string" || typeof child === "number") return child;
  if (Array.isArray(child)) return child.map(serializeChild).filter((c) => c !== null);
  return renderToJson(child as ReactElement);
}

/** Serializes a react-pdf element tree to comparable plain JSON. */
export function renderToJson(element: ReactElement): JsonNode {
  const { children, ...props } = (element.props ?? {}) as Record<string, unknown> & { children?: ReactNode };
  return {
    type: typeName(element.type),
    props,
    children: ([] as unknown[]).concat(serializeChild(children ?? null) ?? []).filter((c) => c !== null),
  };
}

export function sampleFormData(): PdfFormData {
  return {
    surveyJson: {
      title: "Leave Application",
      pages: [{ name: "page1", elements: [
        { type: "text", name: "employeeName", title: "Employee Name" },
        { type: "text", name: "reason", title: "Reason" },
      ] }],
    },
    responseData: { employeeName: "Aisyah binti Rahman", reason: "Medical" },
    meta: {
      submittedBy: "aisyah@example.com",
      submittedAt: "2026-09-01T08:30:00.000Z",
      formTitle: "Leave Application",
      formVersion: "3",
      formStatus: "Approved",
      referenceNo: "LV-010926-0007",
    },
    layerResults: [
      { layerNumber: 1, type: "approval", status: "Approved", email: "manager@example.com", signedAt: "2026-09-02T02:00:00.000Z", signature: "data:image/png;base64,iVBORw0KGgo=" },
    ],
    isoStandards: "ISO 9001:2015",
    documentHeader: { documentNumber: "HR-F-001", issueNumber: "2", effectiveDate: "2026-01-01", revisionNumber: "1", revisionDate: "2026-06-01" },
  };
}
```

- [ ] **Step 3: Run the test to record the baseline**

Run: `npx vitest run src/utils/pdfSections/sections.test.tsx`
Expected: PASS, and a new `src/utils/pdfSections/__snapshots__/sections.test.tsx.snap` is written. Commit this snapshot — it is the contract the refactor must not break.

```bash
git add src/utils/pdfSections/ vitest.config.ts
git commit -m "Pin the current PDF element tree before refactoring"
```

- [ ] **Step 4: Move the styles**

Create `src/utils/pdfSections/styles.ts` containing, verbatim and unchanged, the `C` object (`FormPdfDocument.tsx:56-82`) and the `S = StyleSheet.create({...})` block (`:86-186`), with `export const C` and `export const S`, plus the `editorial` import they need.

- [ ] **Step 5: Move the helpers**

Create `src/utils/pdfSections/helpers.tsx` containing, verbatim, every helper from `FormPdfDocument.tsx:191-584` — `fmtDate`, `fmtVal`, `isEmptyPdfValue`, `fallbackPdfLabel`, `isRecord`, `parseMaybeJson`, `isImageSource`, `isSharePointImageCandidate`, `extractImageSrcFromHtml`, `splitSharePointUrlFieldValue`, `collectImageSources`, `docControlCells`, `badgeStyle`, `LayerRow`, `renderMatrixField`, `shouldRenderMeasure`, `renderMeasureValue`, `textValue`, `numberValue`, `optionText`, `choiceOption`, `normalizedSelectedValues`, `choiceOptionsForField`, `shouldRenderTickboxes`, `isLongTextField`, `lineCountForField`, `renderPaperLines`, `renderTickboxOptions`, `renderPaperFieldValue`, `evaluationChildElements`, `emptyEvaluationFields`, `evaluationFieldsForLayer`, `renderImageSources` — each with `export` added. Import `C` and `S` from `./styles`.

- [ ] **Step 6: Write the context builder and the nine sections**

Create `src/utils/pdfSections/context.ts`:

```ts
/** context.ts — The derived values every PDF section reads. */
import { buildFormSubmissionSections, type FormSubmissionSection } from "../formSubmissionLayout";
import { getSelectedCompany } from "../companySelection";
import { REFERENCE_NO_FIELD } from "../referenceNumber";
import { C } from "./styles";
import type { PdfFormData } from "../FormPdfDocument";
import type { PdfConfig } from "../../types";

export interface PdfSectionContext {
  data: PdfFormData;
  formSections: FormSubmissionSection[];
  title: string;
  primary: string;
  secondary: string;
  comfortable: boolean;
  referenceNo: string;
  selectedCompany: string;
  effectiveLogoUrl?: string;
  layoutConfig?: PdfConfig;
}

export function buildPdfSectionContext(data: PdfFormData): PdfSectionContext {
  const { surveyJson, responseData, meta, logoUrl, pdfConfig } = data;
  const layoutConfig = pdfConfig?.enabled === false ? undefined : pdfConfig;
  return {
    data,
    formSections: buildFormSubmissionSections(surveyJson, responseData, {
      fallbackSectionTitle: "Main Page",
      includeAdditionalFields: false,
    }),
    title: layoutConfig?.title?.trim() || surveyJson?.title || meta.formTitle,
    primary: layoutConfig?.primaryColor?.trim() || C.primary,
    secondary: layoutConfig?.secondaryColor?.trim() || C.secondary,
    comfortable: layoutConfig?.density === "comfortable",
    referenceNo: (meta.referenceNo || String(responseData?.[REFERENCE_NO_FIELD] ?? "")).trim(),
    selectedCompany: getSelectedCompany(responseData, surveyJson),
    effectiveLogoUrl: layoutConfig?.headerLogoUrl?.trim() || logoUrl,
    layoutConfig,
  };
}
```

Create `src/utils/pdfSections/sections.tsx`. Each component wraps the JSX from the line range in the inventory table above, **moved unchanged**, with the local variables it used now read from `ctx`, and each early-returning `null` where the current code's `&&` guard is false. For example:

```tsx
export function StatusBadgeSection({ ctx }: { ctx: PdfSectionContext }) {
  if (ctx.layoutConfig?.showStatusBadge === false) return null;
  const badge = badgeStyle(ctx.data.meta.formStatus);
  return (
    <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
      <Text style={{ color: badge.text }}>{badge.label}</Text>
    </View>
  );
}

export function HeaderSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta } = ctx.data;
  return (
    <View style={[S.header, { borderBottomColor: ctx.primary }]}>
      <View style={S.logoBox}>
        {ctx.effectiveLogoUrl
          ? <Image style={S.logo} src={ctx.effectiveLogoUrl} />
          : <Text style={{ fontSize: 14, fontWeight: "bold", color: ctx.primary }}>LOGO</Text>}
      </View>
      <View style={S.headerRight}>
        <Text style={[S.docTitle, { color: ctx.primary }]}>{ctx.title}</Text>
        <Text style={S.docRef}>Document Ref: {meta.formTitle} / v{meta.formVersion}</Text>
      </View>
    </View>
  );
}
```

Do the same for `DocumentControlSection` (returns `null` when `docControlCells(...)` is empty), `SubmissionMetaSection`, `AnswersSection`, `ApprovalsSection` (`null` unless `showApproverChain !== false` and there is at least one layer), `SignaturesSection` (`null` unless `showSignatures !== false` and at least one layer has a signature), `EvaluationDetailsSection` (`null` unless `showEvaluationDetails !== false` and the current filter finds a layer with fields), `IsoStandardsSection` (`null` when `isoStandards` is blank), and `FooterChrome`.

- [ ] **Step 7: Reduce FormPdfDocument to composition**

Replace `FormPdfDocument.tsx:586-770` with:

```tsx
export default function FormPdfDocument(data: PdfFormData) {
  const ctx = buildPdfSectionContext(data);
  return (
    <Document>
      <Page size="A4" style={[S.page, ctx.comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        <HeaderSection ctx={ctx} />
        <DocumentControlSection ctx={ctx} />
        <StatusBadgeSection ctx={ctx} />
        <SubmissionMetaSection ctx={ctx} />
        <AnswersSection ctx={ctx} />
        <ApprovalsSection ctx={ctx} />
        <SignaturesSection ctx={ctx} />
        <EvaluationDetailsSection ctx={ctx} />
        <IsoStandardsSection ctx={ctx} />
        <FooterChrome ctx={ctx} />
      </Page>
    </Document>
  );
}
```

Delete every definition now living in `styles.ts`, `helpers.tsx` and `sections.tsx`, keeping only the `PdfFormData` / `PdfLayerResult` interfaces and the imports the file still needs.

- [ ] **Step 8: Run the snapshot test**

Run: `npx vitest run src/utils/pdfSections/sections.test.tsx`
Expected: PASS with **no snapshot change**. A snapshot diff here means the refactor altered output — fix the section, do not update the snapshot.

Then run: `npx tsc -b` — no errors. And `npx vitest run` — the whole suite passes.

- [ ] **Step 9: Commit**

```bash
git add src/utils/pdfSections/ src/utils/FormPdfDocument.tsx
git commit -m "Extract the PDF sections so both render paths share them"
```

---

### Task 3: The default template

**Files:**
- Create: `src/utils/pdfTemplate/defaultTemplate.ts`
- Test: `src/utils/pdfTemplate/defaultTemplate.test.ts`

**Interfaces:**
- Consumes: `PdfTemplate`, `SmartBlockType` from Task 1.
- Produces: `buildDefaultTemplate(): PdfTemplate`, `DEFAULT_SMART_ORDER: SmartBlockType[]`.

The default carries every smart block in today's order and no styles. Visibility stays with `pdfConfig` — a block whose switch is off renders nothing, exactly as today — so the default template is the same for every form and holds no per-form state.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/defaultTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDefaultTemplate, DEFAULT_SMART_ORDER } from "./defaultTemplate";
import { isPdfTemplate } from "./types";

describe("buildDefaultTemplate", () => {
  it("produces a valid template", () => {
    expect(isPdfTemplate(buildDefaultTemplate())).toBe(true);
  });

  it("carries every smart block in the built-in layout's order", () => {
    const blocks = buildDefaultTemplate().blocks;
    expect(blocks.map((b) => (b.kind === "smart" ? b.smart : b.kind))).toEqual([
      "header",
      "documentControl",
      "statusBadge",
      "submissionMeta",
      "answers",
      "approvals",
      "signatures",
      "evaluationDetails",
      "isoStandards",
    ]);
  });

  it("matches DEFAULT_SMART_ORDER", () => {
    expect(buildDefaultTemplate().blocks.map((b) => (b as { smart: string }).smart)).toEqual(DEFAULT_SMART_ORDER);
  });

  it("gives every block a distinct id", () => {
    const ids = buildDefaultTemplate().blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies no styling, leaving the built-in look alone", () => {
    expect(buildDefaultTemplate().blocks.every((b) => b.style === undefined)).toBe(true);
  });

  it("returns a fresh object each call so callers can mutate safely", () => {
    const a = buildDefaultTemplate();
    const b = buildDefaultTemplate();
    a.blocks.pop();
    expect(b.blocks).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/defaultTemplate.test.ts`
Expected: FAIL — cannot resolve `./defaultTemplate`.

- [ ] **Step 3: Implement**

Create `src/utils/pdfTemplate/defaultTemplate.ts`:

```ts
/**
 * defaultTemplate.ts — The built-in layout expressed as blocks.
 *
 * Opening the editor starts here, so this list and the composition in
 * FormPdfDocument must stay in lockstep. The equivalence test in
 * renderTemplate.test.tsx is what keeps them honest.
 */
import type { PdfTemplate, SmartBlockType } from "./types";

export const DEFAULT_SMART_ORDER: SmartBlockType[] = [
  "header",
  "documentControl",
  "statusBadge",
  "submissionMeta",
  "answers",
  "approvals",
  "signatures",
  "evaluationDetails",
  "isoStandards",
];

export function buildDefaultTemplate(): PdfTemplate {
  return {
    version: 1,
    blocks: DEFAULT_SMART_ORDER.map((smart) => ({ id: `default-${smart}`, kind: "smart" as const, smart })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/pdfTemplate/defaultTemplate.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pdfTemplate/defaultTemplate.ts src/utils/pdfTemplate/defaultTemplate.test.ts
git commit -m "Express the built-in PDF layout as a default block template"
```

---

### Task 4: Render smart blocks, and prove equivalence

The keystone task. After this, a form carrying the default template produces the same document as a form carrying none.

**Files:**
- Create: `src/utils/pdfTemplate/renderTemplate.tsx`
- Modify: `src/utils/FormPdfDocument.tsx` (one branch)
- Test: `src/utils/pdfTemplate/renderTemplate.test.tsx`

**Interfaces:**
- Consumes: `PdfBlock`, `PdfTemplate`, `BlockStyle` (Task 1); `buildDefaultTemplate` (Task 3); `PdfSectionContext`, the nine section components, `FooterChrome`, `S` (Task 2).
- Produces:
  - `renderBlock(block: PdfBlock, ctx: PdfSectionContext): JSX.Element | null`
  - `TemplateBody({ template, ctx }: { template: PdfTemplate; ctx: PdfSectionContext }): JSX.Element`
  - `blockStyleToPdf(style: BlockStyle | undefined): Record<string, unknown>`

- [ ] **Step 1: Write the failing equivalence test**

Create `src/utils/pdfTemplate/renderTemplate.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import FormPdfDocument from "../FormPdfDocument";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { buildDefaultTemplate } from "./defaultTemplate";
import { blockStyleToPdf } from "./renderTemplate";

describe("default template equivalence", () => {
  it("renders the same document as no template at all", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const templated = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: buildDefaultTemplate() }));
    expect(templated).toEqual(legacy);
  });

  it("stays equivalent for a submission with no layers and no answers", () => {
    const bare = { ...sampleFormData(), layerResults: [], responseData: {} };
    expect(renderToJson(FormPdfDocument({ ...bare, pdfTemplate: buildDefaultTemplate() })))
      .toEqual(renderToJson(FormPdfDocument(bare)));
  });

  it("reorders sections when the template reorders blocks", () => {
    const template = buildDefaultTemplate();
    const [first, second] = [template.blocks[0], template.blocks[1]];
    template.blocks[0] = second;
    template.blocks[1] = first;
    const out = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: template }));
    const page = out.children[0] as { children: { type: string }[] };
    expect(page.children[0].type).toBe("DocumentControlSection");
    expect(page.children[1].type).toBe("HeaderSection");
  });

  it("drops a section when its block is removed", () => {
    const template = buildDefaultTemplate();
    template.blocks = template.blocks.filter((b) => (b as { smart: string }).smart !== "signatures");
    const out = JSON.stringify(renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: template })));
    expect(out).not.toContain("SignaturesSection");
  });
});

describe("blockStyleToPdf", () => {
  it("returns an empty object for no style", () => {
    expect(blockStyleToPdf(undefined)).toEqual({});
  });

  it("maps bold and italic onto react-pdf font properties", () => {
    expect(blockStyleToPdf({ bold: true, italic: true })).toMatchObject({ fontWeight: "bold", fontStyle: "italic" });
  });

  it("passes spacing, colour and alignment through", () => {
    expect(blockStyleToPdf({ marginTop: 6, color: "#123456", align: "center", fontSize: 11 }))
      .toMatchObject({ marginTop: 6, color: "#123456", textAlign: "center", fontSize: 11 });
  });

  it("omits properties that were not set", () => {
    expect(blockStyleToPdf({ marginTop: 6 })).not.toHaveProperty("backgroundColor");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/renderTemplate.test.tsx`
Expected: FAIL — cannot resolve `./renderTemplate`.

- [ ] **Step 3: Implement the renderer**

Create `src/utils/pdfTemplate/renderTemplate.tsx`:

```tsx
/**
 * renderTemplate.tsx — Draws a block template with @react-pdf primitives.
 *
 * A smart block delegates to the very component the built-in layout uses, which
 * is what lets the default template be identical to the built-in document
 * rather than a careful imitation of it.
 */
import { View } from "@react-pdf/renderer";
import {
  HeaderSection, DocumentControlSection, StatusBadgeSection, SubmissionMetaSection,
  AnswersSection, ApprovalsSection, SignaturesSection, EvaluationDetailsSection, IsoStandardsSection,
} from "../pdfSections/sections";
import type { PdfSectionContext } from "../pdfSections/context";
import type { BlockStyle, PdfBlock, PdfTemplate, SmartBlockType } from "./types";

const SMART: Record<SmartBlockType, (props: { ctx: PdfSectionContext }) => JSX.Element | null> = {
  header: HeaderSection,
  documentControl: DocumentControlSection,
  statusBadge: StatusBadgeSection,
  submissionMeta: SubmissionMetaSection,
  answers: AnswersSection,
  approvals: ApprovalsSection,
  signatures: SignaturesSection,
  evaluationDetails: EvaluationDetailsSection,
  isoStandards: IsoStandardsSection,
};

/** Only properties the admin actually set are emitted, so an unstyled block
 *  inherits the built-in look untouched. */
export function blockStyleToPdf(style: BlockStyle | undefined): Record<string, unknown> {
  if (!style) return {};
  const out: Record<string, unknown> = {};
  if (style.fontFamily) out.fontFamily = style.fontFamily;
  if (style.fontSize !== undefined) out.fontSize = style.fontSize;
  if (style.bold) out.fontWeight = "bold";
  if (style.italic) out.fontStyle = "italic";
  if (style.color) out.color = style.color;
  if (style.align) out.textAlign = style.align;
  if (style.marginTop !== undefined) out.marginTop = style.marginTop;
  if (style.marginBottom !== undefined) out.marginBottom = style.marginBottom;
  if (style.paddingX !== undefined) out.paddingHorizontal = style.paddingX;
  if (style.paddingY !== undefined) out.paddingVertical = style.paddingY;
  if (style.background) out.backgroundColor = style.background;
  if (style.borderWidth !== undefined) out.borderWidth = style.borderWidth;
  if (style.borderColor) out.borderColor = style.borderColor;
  return out;
}

export function renderBlock(block: PdfBlock, ctx: PdfSectionContext): JSX.Element | null {
  if (block.kind === "smart") {
    const Section = SMART[block.smart];
    if (!Section) return null;
    const style = blockStyleToPdf(block.style);
    const element = <Section ctx={ctx} />;
    // An unstyled smart block is emitted bare so its output is identical to the
    // built-in layout's — no extra wrapper, no extra element in the tree.
    if (Object.keys(style).length === 0 && !block.style?.breakBefore) return element;
    return <View style={style} break={block.style?.breakBefore}>{element}</View>;
  }
  return null; // content blocks arrive in Tasks 6 and 7
}

export function TemplateBody({ template, ctx }: { template: PdfTemplate; ctx: PdfSectionContext }) {
  return <>{template.blocks.map((block) => <Fragment key={block.id}>{renderBlock(block, ctx)}</Fragment>)}</>;
}
```

Import `Fragment` from `react` at the top.

- [ ] **Step 4: Add the branch to FormPdfDocument**

In `src/utils/FormPdfDocument.tsx`, add `pdfTemplate?: PdfTemplate;` to `PdfFormData`, then replace the `<Page>` body:

```tsx
export default function FormPdfDocument(data: PdfFormData) {
  const ctx = buildPdfSectionContext(data);
  const template = isPdfTemplate(data.pdfTemplate) ? data.pdfTemplate : null;
  return (
    <Document>
      <Page size="A4" style={[S.page, ctx.comfortable ? { fontSize: 9.3, lineHeight: 1.35 } : {}]}>
        {template ? <TemplateBody template={template} ctx={ctx} /> : <BuiltInBody ctx={ctx} />}
        <FooterChrome ctx={ctx} />
      </Page>
    </Document>
  );
}
```

and move the nine section elements from Task 2 Step 7 into a local `BuiltInBody({ ctx }: { ctx: PdfSectionContext })` returning them inside a fragment.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/pdfTemplate/renderTemplate.test.tsx src/utils/pdfSections/sections.test.tsx`
Expected: PASS, including the two `toEqual` equivalence assertions and an unchanged Task 2 snapshot.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`

```bash
git add src/utils/pdfTemplate/renderTemplate.tsx src/utils/pdfTemplate/renderTemplate.test.tsx src/utils/FormPdfDocument.tsx
git commit -m "Render smart blocks through the shared PDF sections"
```

---

### Task 5: The variable catalogue

**Files:**
- Create: `src/utils/pdfTemplate/variables.ts`
- Test: `src/utils/pdfTemplate/variables.test.ts`

**Interfaces:**
- Consumes: `fieldsFromSurveyJson` from `src/utils/formFieldCatalog.ts`.
- Produces:
  - `interface PdfVariable { token: string; label: string; group: string }`
  - `BUILTIN_VARIABLES: PdfVariable[]`
  - `buildVariableCatalogue(surveyJson: unknown, layerCount: number): PdfVariable[]`

Field tokens are `field:<internalName>`; built-ins are `meta:<name>`; per-layer values are `layer:<n>:<property>`. Prefixing keeps a field called `submittedBy` from colliding with the built-in of that name.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/variables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildVariableCatalogue, BUILTIN_VARIABLES } from "./variables";

const survey = {
  title: "Leave",
  pages: [{ name: "p1", elements: [
    { type: "text", name: "employeeName", title: "Employee Name" },
    { type: "dropdown", name: "leaveType", title: "Leave Type", choices: ["Annual", "Medical"] },
  ] }],
};

describe("buildVariableCatalogue", () => {
  it("offers every form field under its label", () => {
    const tokens = buildVariableCatalogue(survey, 0);
    expect(tokens).toContainEqual({ token: "field:employeeName", label: "Employee Name", group: "Form fields" });
    expect(tokens).toContainEqual({ token: "field:leaveType", label: "Leave Type", group: "Form fields" });
  });

  it("includes the built-in submission values", () => {
    const tokens = buildVariableCatalogue(survey, 0).map((v) => v.token);
    for (const builtin of BUILTIN_VARIABLES) expect(tokens).toContain(builtin.token);
  });

  it("adds one group of variables per approval layer", () => {
    const tokens = buildVariableCatalogue(survey, 2).map((v) => v.token);
    expect(tokens).toContain("layer:1:email");
    expect(tokens).toContain("layer:1:status");
    expect(tokens).toContain("layer:2:signedAt");
    expect(tokens).not.toContain("layer:3:email");
  });

  it("falls back to the field name when a question has no title", () => {
    const untitled = { pages: [{ name: "p1", elements: [{ type: "text", name: "remarks" }] }] };
    expect(buildVariableCatalogue(untitled, 0)).toContainEqual(
      expect.objectContaining({ token: "field:remarks", label: "remarks" }),
    );
  });

  it("survives a malformed survey", () => {
    expect(() => buildVariableCatalogue(null, 0)).not.toThrow();
    expect(buildVariableCatalogue(null, 0).length).toBe(BUILTIN_VARIABLES.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/variables.test.ts`
Expected: FAIL — cannot resolve `./variables`.

- [ ] **Step 3: Implement**

Create `src/utils/pdfTemplate/variables.ts`:

```ts
/**
 * variables.ts — What an admin may drop into a text or table block.
 *
 * Tokens are namespaced (`field:`, `meta:`, `layer:`) so a question named
 * `submittedBy` cannot shadow the built-in of the same name.
 */
import { fieldsFromSurveyJson } from "../formFieldCatalog";

export interface PdfVariable {
  token: string;
  label: string;
  group: string;
}

export const BUILTIN_VARIABLES: PdfVariable[] = [
  { token: "meta:submittedBy", label: "Submitted by", group: "Submission" },
  { token: "meta:submittedAt", label: "Date submitted", group: "Submission" },
  { token: "meta:referenceNo", label: "Reference number", group: "Submission" },
  { token: "meta:formStatus", label: "Status", group: "Submission" },
  { token: "meta:formTitle", label: "Form title", group: "Submission" },
  { token: "meta:formVersion", label: "Form version", group: "Submission" },
  { token: "meta:company", label: "Company", group: "Submission" },
  { token: "meta:isoStandards", label: "ISO standards", group: "Submission" },
];

const LAYER_PROPERTIES: { key: string; label: string }[] = [
  { key: "email", label: "assignee" },
  { key: "status", label: "decision" },
  { key: "signedAt", label: "signed at" },
  { key: "rejection", label: "remarks" },
  { key: "confirmerName", label: "name" },
];

export function buildVariableCatalogue(surveyJson: unknown, layerCount: number): PdfVariable[] {
  const fields = fieldsFromSurveyJson(surveyJson).map((field) => ({
    token: `field:${field.name}`,
    label: field.label?.trim() || field.name,
    group: "Form fields",
  }));

  const layers: PdfVariable[] = [];
  for (let n = 1; n <= layerCount; n += 1) {
    for (const property of LAYER_PROPERTIES) {
      layers.push({ token: `layer:${n}:${property.key}`, label: `Layer ${n} ${property.label}`, group: `Layer ${n}` });
    }
  }

  return [...fields, ...BUILTIN_VARIABLES, ...layers];
}
```

If `fieldsFromSurveyJson` returns a property named other than `name`/`label`, adjust the mapping to that module's actual `FilterableField` shape (`src/utils/formFieldCatalog.ts:44`) — the token must carry the internal field name and the label the display title.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/pdfTemplate/variables.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pdfTemplate/variables.ts src/utils/pdfTemplate/variables.test.ts
git commit -m "List the variables a PDF template may reference"
```

---

### Task 6: Resolve variables, and render text blocks

**Files:**
- Create: `src/utils/pdfTemplate/resolve.ts`
- Modify: `src/utils/pdfTemplate/renderTemplate.tsx` (handle `text`)
- Test: `src/utils/pdfTemplate/resolve.test.ts`, `src/utils/pdfTemplate/renderText.test.tsx`

**Interfaces:**
- Consumes: `PdfSectionContext` (Task 2), `RichSpan`/`RichText` (Task 1), `formatPdfFieldValue`/`formatPdfDateTimeValue` from `src/utils/pdfFieldFormatting.ts`.
- Produces:
  - `resolveVariable(token: string, ctx: PdfSectionContext): string`
  - `resolveSpan(span: RichSpan, ctx: PdfSectionContext): string`
  - `unresolvedVariables(template: PdfTemplate, known: Set<string>): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { sampleFormData } from "../pdfSections/testSupport";
import { resolveSpan, resolveVariable, unresolvedVariables } from "./resolve";

const ctx = () => buildPdfSectionContext(sampleFormData());

describe("resolveVariable", () => {
  it("reads a form field by its internal name", () => {
    expect(resolveVariable("field:employeeName", ctx())).toBe("Aisyah binti Rahman");
  });

  it("reads built-in submission values", () => {
    expect(resolveVariable("meta:submittedBy", ctx())).toBe("aisyah@example.com");
    expect(resolveVariable("meta:referenceNo", ctx())).toBe("LV-010926-0007");
    expect(resolveVariable("meta:formVersion", ctx())).toBe("3");
  });

  it("formats dates the same way the answers table does", () => {
    expect(resolveVariable("meta:submittedAt", ctx())).not.toBe("2026-09-01T08:30:00.000Z");
    expect(resolveVariable("meta:submittedAt", ctx())).not.toBe("");
  });

  it("reads per-layer values", () => {
    expect(resolveVariable("layer:1:email", ctx())).toBe("manager@example.com");
    expect(resolveVariable("layer:1:status", ctx())).toBe("Approved");
  });

  it("returns empty for a field that no longer exists", () => {
    expect(resolveVariable("field:deletedQuestion", ctx())).toBe("");
  });

  it("returns empty for a layer that did not run", () => {
    expect(resolveVariable("layer:9:email", ctx())).toBe("");
  });

  it("returns empty for a token it does not understand", () => {
    expect(resolveVariable("nonsense", ctx())).toBe("");
    expect(resolveVariable("", ctx())).toBe("");
  });
});

describe("resolveSpan", () => {
  it("returns literal text unchanged", () => {
    expect(resolveSpan({ text: "Dear Sir," }, ctx())).toBe("Dear Sir,");
  });

  it("uses the fallback when a variable resolves to nothing", () => {
    expect(resolveSpan({ variable: "field:gone", fallback: "N/A" }, ctx())).toBe("N/A");
  });

  it("prefers the value over the fallback when both exist", () => {
    expect(resolveSpan({ variable: "field:employeeName", fallback: "N/A" }, ctx())).toBe("Aisyah binti Rahman");
  });

  it("returns empty for a span with neither text nor variable", () => {
    expect(resolveSpan({}, ctx())).toBe("");
  });
});

describe("unresolvedVariables", () => {
  it("names every variable no longer in the catalogue", () => {
    const template = {
      version: 1 as const,
      blocks: [{ id: "t1", kind: "text" as const, content: [{ spans: [
        { variable: "field:employeeName" },
        { variable: "field:deletedQuestion" },
        { text: "hello" },
      ] }] }],
    };
    expect(unresolvedVariables(template, new Set(["field:employeeName"]))).toEqual(["field:deletedQuestion"]);
  });

  it("reports nothing for a template with no variables", () => {
    expect(unresolvedVariables({ version: 1, blocks: [] }, new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Implement**

Create `src/utils/pdfTemplate/resolve.ts`:

```ts
/**
 * resolve.ts — Turns template variables into printable text.
 *
 * Values go through the same formatters the answers table uses, so a date reads
 * the same inside a sentence as it does in the table above it. A token that no
 * longer resolves yields an empty string; it never throws and never prints the
 * token itself, which would look like a bug on a signed document.
 */
import { formatPdfDateTimeValue, formatPdfFieldValue } from "../pdfFieldFormatting";
import type { PdfSectionContext } from "../pdfSections/context";
import type { PdfTemplate, RichSpan } from "./types";

function fieldValue(name: string, ctx: PdfSectionContext): string {
  for (const section of ctx.formSections) {
    for (const field of section.fields) {
      if (field.name === name || field.key === name) return formatPdfFieldValue(field.value, field);
    }
  }
  const raw = ctx.data.responseData?.[name];
  return raw === undefined || raw === null ? "" : formatPdfFieldValue(raw);
}

function metaValue(name: string, ctx: PdfSectionContext): string {
  const { meta } = ctx.data;
  switch (name) {
    case "submittedBy": return meta.submittedBy || "";
    case "submittedAt": return meta.submittedAt ? formatPdfDateTimeValue(meta.submittedAt, true) : "";
    case "referenceNo": return ctx.referenceNo;
    case "formStatus": return meta.formStatus || "";
    case "formTitle": return meta.formTitle || "";
    case "formVersion": return meta.formVersion || "";
    case "company": return ctx.selectedCompany || "";
    case "isoStandards": return ctx.data.isoStandards || "";
    default: return "";
  }
}

function layerValue(layerNumber: number, property: string, ctx: PdfSectionContext): string {
  const layer = ctx.data.layerResults?.find((l) => l.layerNumber === layerNumber);
  if (!layer) return "";
  const value = (layer as unknown as Record<string, unknown>)[property];
  if (typeof value !== "string" || !value) return "";
  return property === "signedAt" ? formatPdfDateTimeValue(value, true) : value;
}

export function resolveVariable(token: string, ctx: PdfSectionContext): string {
  const [namespace, a, b] = token.split(":");
  if (namespace === "field" && a) return fieldValue(a, ctx);
  if (namespace === "meta" && a) return metaValue(a, ctx);
  if (namespace === "layer" && a && b) {
    const n = Number(a);
    return Number.isFinite(n) ? layerValue(n, b, ctx) : "";
  }
  return "";
}

export function resolveSpan(span: RichSpan, ctx: PdfSectionContext): string {
  if (span.variable) return resolveVariable(span.variable, ctx) || span.fallback || "";
  return span.text ?? "";
}

/** Variables pointing at something the form no longer has, for the editor's
 *  warnings list. Reported at edit time so nobody meets them on a submission. */
export function unresolvedVariables(template: PdfTemplate, known: Set<string>): string[] {
  const missing: string[] = [];
  const visit = (spans: RichSpan[]) => {
    for (const span of spans) {
      if (span.variable && !known.has(span.variable) && !missing.includes(span.variable)) missing.push(span.variable);
    }
  };
  for (const block of template.blocks) {
    if (block.kind === "text") block.content.forEach((p) => visit(p.spans));
    if (block.kind === "table") block.rows.forEach((row) => row.forEach((cell) => cell.forEach((p) => visit(p.spans))));
  }
  return missing;
}
```

If `FormSubmissionField` has no `name` property, drop that half of the comparison in `fieldValue` and rely on `key` plus the `responseData` fallback (check `src/utils/formSubmissionLayout.ts:5`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/pdfTemplate/resolve.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the failing text-block render test**

Create `src/utils/pdfTemplate/renderText.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { renderBlock } from "./renderTemplate";
import type { TextBlock } from "./types";

const ctx = () => buildPdfSectionContext(sampleFormData());

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object") return textOf((node as { children?: unknown }).children);
  return "";
}

describe("text blocks", () => {
  it("prints literal text", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [{ text: "Declaration" }] }] };
    expect(textOf(renderToJson(renderBlock(block, ctx())!))).toContain("Declaration");
  });

  it("prints a variable's value, not its token", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [
      { text: "Name: " }, { variable: "field:employeeName" },
    ] }] };
    const out = textOf(renderToJson(renderBlock(block, ctx())!));
    expect(out).toContain("Name: Aisyah binti Rahman");
    expect(out).not.toContain("field:employeeName");
  });

  it("renders an empty paragraph without throwing", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ spans: [] }] };
    expect(() => renderToJson(renderBlock(block, ctx())!)).not.toThrow();
  });

  it("marks a bulleted paragraph", () => {
    const block: TextBlock = { id: "t", kind: "text", content: [{ list: "bullet", spans: [{ text: "One" }] }] };
    expect(textOf(renderToJson(renderBlock(block, ctx())!))).toContain("•");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/renderText.test.tsx`
Expected: FAIL — `renderBlock` returns `null` for `text`.

- [ ] **Step 7: Render text blocks**

In `renderTemplate.tsx`, add above `renderBlock`:

```tsx
function spanStyle(span: RichSpan): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (span.bold) out.fontWeight = "bold";
  if (span.italic) out.fontStyle = "italic";
  if (span.underline) out.textDecoration = "underline";
  if (span.fontSize !== undefined) out.fontSize = span.fontSize;
  if (span.color) out.color = span.color;
  return out;
}

function TextBlockView({ block, ctx }: { block: TextBlock; ctx: PdfSectionContext }) {
  return (
    <View style={{ ...blockStyleToPdf(block.style) }} break={block.style?.breakBefore}>
      {block.content.map((paragraph, i) => (
        <Text key={i} style={paragraph.align ? { textAlign: paragraph.align } : {}}>
          {paragraph.list === "bullet" ? "•  " : paragraph.list === "number" ? `${i + 1}.  ` : ""}
          {paragraph.spans.map((span, j) => (
            <Text key={j} style={spanStyle(span)}>{resolveSpan(span, ctx)}</Text>
          ))}
        </Text>
      ))}
    </View>
  );
}
```

and in `renderBlock`, before the final `return null`:

```tsx
  if (block.kind === "text") return <TextBlockView block={block} ctx={ctx} />;
```

Import `Text` from `@react-pdf/renderer`, `resolveSpan` from `./resolve`, and the `RichSpan`/`TextBlock` types.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/utils/pdfTemplate/`
Expected: PASS across all files, equivalence assertions still green.

- [ ] **Step 9: Commit**

```bash
git add src/utils/pdfTemplate/
git commit -m "Resolve template variables and render text blocks"
```

---

### Task 7: The remaining content blocks

**Files:**
- Modify: `src/utils/pdfTemplate/renderTemplate.tsx`
- Test: `src/utils/pdfTemplate/renderContent.test.tsx`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: `renderBlock` handling `table`, `image`, `divider`, `spacer`, `pageBreak`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/renderContent.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import { renderBlock } from "./renderTemplate";
import type { PdfBlock } from "./types";

const ctx = () => buildPdfSectionContext(sampleFormData());
const json = (block: PdfBlock) => JSON.stringify(renderToJson(renderBlock(block, ctx())!));

describe("content blocks", () => {
  it("renders a table with one view per cell", () => {
    const block: PdfBlock = {
      id: "tb", kind: "table", widths: [50, 50], hasHeader: true,
      rows: [
        [[{ spans: [{ text: "Item" }] }], [{ spans: [{ text: "Value" }] }]],
        [[{ spans: [{ text: "Name" }] }], [{ spans: [{ variable: "field:employeeName" }] }]],
      ],
    };
    const out = json(block);
    expect(out).toContain("Item");
    expect(out).toContain("Aisyah binti Rahman");
  });

  it("renders a table with no rows without throwing", () => {
    expect(() => json({ id: "tb", kind: "table", widths: [], rows: [] })).not.toThrow();
  });

  it("renders an image block", () => {
    expect(json({ id: "im", kind: "image", src: "https://example.com/logo.png", width: 80 })).toContain("logo.png");
  });

  it("skips an image block with no source", () => {
    expect(renderBlock({ id: "im", kind: "image", src: "" }, ctx())).toBeNull();
  });

  it("renders a divider", () => {
    expect(json({ id: "dv", kind: "divider" })).toContain("borderBottomWidth");
  });

  it("renders a spacer at the requested height", () => {
    expect(json({ id: "sp", kind: "spacer", height: 24 })).toContain("24");
  });

  it("renders a page break", () => {
    expect(json({ id: "pb", kind: "pageBreak" })).toContain("break");
  });

  it("skips a block type it does not recognise", () => {
    expect(renderBlock({ id: "x", kind: "future" } as unknown as PdfBlock, ctx())).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/renderContent.test.tsx`
Expected: FAIL — `renderBlock` returns `null` for these kinds.

- [ ] **Step 3: Implement**

In `renderTemplate.tsx`, add:

```tsx
function TableBlockView({ block, ctx }: { block: TableBlock; ctx: PdfSectionContext }) {
  const widths = block.widths.length ? block.widths : block.rows[0]?.map(() => 100 / (block.rows[0]?.length || 1)) ?? [];
  return (
    <View style={{ ...blockStyleToPdf(block.style) }} break={block.style?.breakBefore}>
      {block.rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight }} wrap={false}>
          {row.map((cell, c) => (
            <View key={c} style={{ width: `${widths[c] ?? 100 / row.length}%`, padding: 4 }}>
              {cell.map((paragraph, p) => (
                <Text key={p} style={block.hasHeader && r === 0 ? { fontWeight: "bold" } : {}}>
                  {paragraph.spans.map((span, s) => (
                    <Text key={s} style={spanStyle(span)}>{resolveSpan(span, ctx)}</Text>
                  ))}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
```

and in `renderBlock`, before the final `return null`:

```tsx
  if (block.kind === "table") return <TableBlockView block={block} ctx={ctx} />;
  if (block.kind === "image") {
    if (!block.src.trim()) return null;
    return <Image src={block.src} style={{ ...blockStyleToPdf(block.style), width: block.width, height: block.height, objectFit: "contain" }} />;
  }
  if (block.kind === "divider") {
    return <View style={{ ...blockStyleToPdf(block.style), borderBottomWidth: block.style?.borderWidth ?? 0.5, borderBottomColor: block.style?.borderColor ?? C.borderLight, marginVertical: 6 }} />;
  }
  if (block.kind === "spacer") return <View style={{ height: block.height }} />;
  if (block.kind === "pageBreak") return <View break />;
```

Import `Image` from `@react-pdf/renderer` and `C` from `../pdfSections/styles`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/pdfTemplate/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pdfTemplate/
git commit -m "Render table, image, divider, spacer and page-break blocks"
```

---

### Task 8: Never let a template cost a submission its PDF

**Files:**
- Create: `src/utils/pdfTemplate/safeTemplate.ts`
- Modify: `src/utils/FormPdfDocument.tsx`
- Test: `src/utils/pdfTemplate/safeTemplate.test.tsx`

**Interfaces:**
- Consumes: `isPdfTemplate` (Task 1), `renderBlock` (Tasks 4, 6, 7).
- Produces: `readTemplate(value: unknown): PdfTemplate | null`, `safeRenderBlock(block: PdfBlock, ctx: PdfSectionContext): JSX.Element | null`.

PDF generation runs after a submission is already recorded, so a template fault must degrade to the built-in layout rather than surface to the person submitting.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/safeTemplate.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { renderToJson, sampleFormData } from "../pdfSections/testSupport";
import FormPdfDocument from "../FormPdfDocument";
import { readTemplate, safeRenderBlock } from "./safeTemplate";
import type { PdfBlock } from "./types";

describe("readTemplate", () => {
  it("accepts a template object", () => {
    expect(readTemplate({ version: 1, blocks: [] })).not.toBeNull();
  });

  it("parses a template stored as a JSON string", () => {
    expect(readTemplate('{"version":1,"blocks":[]}')).not.toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(readTemplate("{not json")).toBeNull();
  });

  it("returns null for undefined, null and wrong shapes", () => {
    expect(readTemplate(undefined)).toBeNull();
    expect(readTemplate(null)).toBeNull();
    expect(readTemplate({ version: 1 })).toBeNull();
  });
});

describe("safeRenderBlock", () => {
  it("returns null and logs instead of throwing when a block fails", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exploding = { id: "bad", kind: "text", content: null } as unknown as PdfBlock;
    expect(safeRenderBlock(exploding, buildPdfSectionContext(sampleFormData()))).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("FormPdfDocument fallback", () => {
  it("falls back to the built-in layout when the template is malformed", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const broken = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: "{not json" as never }));
    expect(broken).toEqual(legacy);
  });

  it("falls back when the template has no blocks at all", () => {
    const legacy = renderToJson(FormPdfDocument(sampleFormData()));
    const empty = renderToJson(FormPdfDocument({ ...sampleFormData(), pdfTemplate: { version: 1, blocks: [] } }));
    expect(empty).toEqual(legacy);
  });
});
```

An empty block list falls back deliberately: a document with nothing on it is never what an admin meant, and a blank PDF is worse than the default one.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/safeTemplate.test.tsx`
Expected: FAIL — cannot resolve `./safeTemplate`.

- [ ] **Step 3: Implement**

Create `src/utils/pdfTemplate/safeTemplate.ts`:

```ts
/**
 * safeTemplate.ts — Reading and rendering a template defensively.
 *
 * A PDF is generated after the submission is already saved. A bad template must
 * therefore cost a section at worst and the custom layout at most — never the
 * document, and never the submission.
 */
import { isPdfTemplate, type PdfBlock, type PdfTemplate } from "./types";
import { renderBlock } from "./renderTemplate";
import type { PdfSectionContext } from "../pdfSections/context";

export function readTemplate(value: unknown): PdfTemplate | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!isPdfTemplate(candidate)) return null;
  if (candidate.blocks.length === 0) return null;
  return candidate;
}

export function safeRenderBlock(block: PdfBlock, ctx: PdfSectionContext): JSX.Element | null {
  try {
    return renderBlock(block, ctx);
  } catch (error) {
    console.warn(`PDF template: skipped block ${block?.id} (${block?.kind})`, error);
    return null;
  }
}
```

In `FormPdfDocument.tsx`, replace `isPdfTemplate(data.pdfTemplate) ? data.pdfTemplate : null` with `readTemplate(data.pdfTemplate)`, and in `TemplateBody` (`renderTemplate.tsx`) call `safeRenderBlock` instead of `renderBlock`. Import it lazily inside `TemplateBody` if the circular import bites; otherwise move `safeRenderBlock` into `renderTemplate.tsx` and keep only `readTemplate` in `safeTemplate.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/pdfTemplate/ && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pdfTemplate/ src/utils/FormPdfDocument.tsx
git commit -m "Fall back to the built-in layout when a template is unusable"
```

---

### Task 9: Unlocking a smart block

**Files:**
- Create: `src/utils/pdfTemplate/unlock.ts`
- Test: `src/utils/pdfTemplate/unlock.test.ts`

**Interfaces:**
- Consumes: `PdfBlock`, `SmartBlock`, `RichText` (Task 1); `PdfSectionContext` (Task 2).
- Produces: `unlockBlock(block: SmartBlock, ctx: PdfSectionContext): PdfBlock[]`, `UNLOCKABLE: SmartBlockType[]`.

Unlocking snapshots the block's **structure** — labels and rows as the form stands now — with variables in the value cells, so the text still updates per submission even though the row list no longer does.

- [ ] **Step 1: Write the failing test**

Create `src/utils/pdfTemplate/unlock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPdfSectionContext } from "../pdfSections/context";
import { sampleFormData } from "../pdfSections/testSupport";
import { unlockBlock, UNLOCKABLE } from "./unlock";

const ctx = () => buildPdfSectionContext(sampleFormData());

describe("unlockBlock", () => {
  it("turns the answers block into a table of the form's current fields", () => {
    const [block] = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    expect(block.kind).toBe("table");
    const rows = (block as { rows: unknown[][] }).rows;
    expect(rows).toHaveLength(2);
  });

  it("keeps values live by writing them as variables, not as text", () => {
    const [block] = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    expect(JSON.stringify(block)).toContain("field:employeeName");
    expect(JSON.stringify(block)).not.toContain("Aisyah binti Rahman");
  });

  it("turns the submission details block into a table of built-in variables", () => {
    const [block] = unlockBlock({ id: "m", kind: "smart", smart: "submissionMeta" }, ctx());
    expect(JSON.stringify(block)).toContain("meta:submittedBy");
  });

  it("gives every produced block a fresh unique id", () => {
    const blocks = unlockBlock({ id: "a", kind: "smart", smart: "answers" }, ctx());
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("a");
  });

  it("returns the block unchanged when its type cannot be unlocked", () => {
    const input = { id: "s", kind: "smart" as const, smart: "signatures" as const };
    expect(unlockBlock(input, ctx())).toEqual([input]);
    expect(UNLOCKABLE).not.toContain("signatures");
  });

  it("produces an empty table rather than throwing when the form has no fields", () => {
    const bare = buildPdfSectionContext({ ...sampleFormData(), responseData: {}, surveyJson: { pages: [] } });
    expect(() => unlockBlock({ id: "a", kind: "smart", smart: "answers" }, bare)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/pdfTemplate/unlock.test.ts`
Expected: FAIL — cannot resolve `./unlock`.

- [ ] **Step 3: Implement**

Create `src/utils/pdfTemplate/unlock.ts`:

```ts
/**
 * unlock.ts — Converts a smart block into editable content blocks.
 *
 * The structure is frozen at the moment of unlocking: a question added to the
 * form afterwards will not appear. The values stay live, because each one is
 * written as a variable rather than as the text it happens to hold today.
 * One-way by design; re-adding the smart block is how you go back.
 *
 * Signature and approval blocks are not unlockable — their content is images
 * and a row count that only exists at submission time, so a frozen copy would
 * be wrong rather than merely static.
 */
import type { PdfBlock, RichText, SmartBlock, SmartBlockType, TableBlock } from "./types";
import type { PdfSectionContext } from "../pdfSections/context";

export const UNLOCKABLE: SmartBlockType[] = ["submissionMeta", "answers", "documentControl", "isoStandards", "statusBadge"];

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

const cell = (text: string): RichText => [{ spans: [{ text }] }];
const varCell = (token: string): RichText => [{ spans: [{ variable: token }] }];

function table(rows: RichText[][]): TableBlock {
  return { id: nextId("table"), kind: "table", widths: [34, 66], rows };
}

export function unlockBlock(block: SmartBlock, ctx: PdfSectionContext): PdfBlock[] {
  if (!UNLOCKABLE.includes(block.smart)) return [block];

  if (block.smart === "answers") {
    const rows: RichText[][] = [];
    for (const section of ctx.formSections) {
      for (const field of section.fields) {
        const name = (field as unknown as { name?: string }).name || field.key;
        rows.push([cell(field.label), varCell(`field:${name}`)]);
      }
    }
    return [{ ...table(rows), style: block.style }];
  }

  if (block.smart === "submissionMeta") {
    const rows: RichText[][] = [
      [cell("Reference No."), varCell("meta:referenceNo")],
      [cell("Submitted By"), varCell("meta:submittedBy")],
      [cell("Date Submitted"), varCell("meta:submittedAt")],
      [cell("Form"), varCell("meta:formTitle")],
      [cell("Version"), varCell("meta:formVersion")],
      [cell("Company"), varCell("meta:company")],
    ];
    return [{ ...table(rows), style: block.style }];
  }

  if (block.smart === "documentControl") {
    const header = ctx.data.documentHeader ?? {};
    const rows: RichText[][] = [
      [cell("Document No."), cell(header.documentNumber ?? "")],
      [cell("Issue No."), cell(header.issueNumber ?? "")],
      [cell("Effective Date"), cell(header.effectiveDate ?? "")],
      [cell("Revision No."), cell(header.revisionNumber ?? "")],
      [cell("Revision Date"), cell(header.revisionDate ?? "")],
    ];
    return [{ ...table(rows), style: block.style }];
  }

  if (block.smart === "statusBadge") {
    return [{ id: nextId("text"), kind: "text", content: [{ spans: [{ variable: "meta:formStatus" }] }], style: block.style }];
  }

  return [{ id: nextId("text"), kind: "text", content: [{ spans: [{ variable: "meta:isoStandards" }] }], style: block.style }];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/pdfTemplate/unlock.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pdfTemplate/unlock.ts src/utils/pdfTemplate/unlock.test.ts
git commit -m "Let an admin unlock a smart block into editable content"
```

---

### Task 10: Editor state

The editor's logic is separated from its markup so the interesting behaviour — reorder, add, delete, unlock, undo — is testable without a DOM.

**Files:**
- Create: `src/components/builder/pdfEditor/editorState.ts`
- Test: `src/components/builder/pdfEditor/editorState.test.ts`

**Interfaces:**
- Consumes: `PdfTemplate`, `PdfBlock` (Task 1); `buildDefaultTemplate` (Task 3); `unlockBlock` (Task 9).
- Produces:
  - `interface EditorState { template: PdfTemplate; selectedId: string | null; past: PdfTemplate[] }`
  - `initialEditorState(stored: PdfTemplate | undefined): EditorState`
  - `type EditorAction` — `{ type: "select"; id: string | null }`, `{ type: "move"; id: string; to: number }`, `{ type: "insert"; block: PdfBlock; after: string | null }`, `{ type: "delete"; id: string }`, `{ type: "update"; id: string; patch: Partial<PdfBlock> }`, `{ type: "replace"; id: string; blocks: PdfBlock[] }`, `{ type: "undo" }`
  - `editorReducer(state: EditorState, action: EditorAction): EditorState`
  - `newBlock(kind: PdfBlock["kind"]): PdfBlock`

- [ ] **Step 1: Write the failing test**

Create `src/components/builder/pdfEditor/editorState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { editorReducer, initialEditorState, newBlock } from "./editorState";

const kinds = (state: { template: { blocks: { kind: string }[] } }) => state.template.blocks.map((b) => b.kind);

describe("initialEditorState", () => {
  it("starts from the built-in layout when the form has no template", () => {
    expect(initialEditorState(undefined).template.blocks).toHaveLength(9);
  });

  it("starts from the stored template when there is one", () => {
    const stored = { version: 1 as const, blocks: [newBlock("text")] };
    expect(initialEditorState(stored).template.blocks).toHaveLength(1);
  });

  it("does not share state with the stored template", () => {
    const stored = { version: 1 as const, blocks: [newBlock("text")] };
    initialEditorState(stored).template.blocks.pop();
    expect(stored.blocks).toHaveLength(1);
  });
});

describe("editorReducer", () => {
  it("moves a block to a new position", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const moved = editorReducer(state, { type: "move", id, to: 2 });
    expect(moved.template.blocks[2].id).toBe(id);
    expect(moved.template.blocks).toHaveLength(9);
  });

  it("ignores a move to an out-of-range position", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    expect(editorReducer(state, { type: "move", id, to: 99 }).template.blocks[0].id).toBe(id);
  });

  it("inserts a block after the named one", () => {
    const state = initialEditorState(undefined);
    const after = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "insert", block: newBlock("text"), after });
    expect(kinds(next)[1]).toBe("text");
  });

  it("inserts at the end when after is null", () => {
    const next = editorReducer(initialEditorState(undefined), { type: "insert", block: newBlock("divider"), after: null });
    expect(kinds(next).at(-1)).toBe("divider");
  });

  it("deletes a block", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[3].id;
    const next = editorReducer(state, { type: "delete", id });
    expect(next.template.blocks.map((b) => b.id)).not.toContain(id);
  });

  it("clears the selection when the selected block is deleted", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const selected = editorReducer(state, { type: "select", id });
    expect(editorReducer(selected, { type: "delete", id }).selectedId).toBeNull();
  });

  it("patches a block's style without touching its neighbours", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "update", id, patch: { style: { fontSize: 14 } } });
    expect(next.template.blocks[0].style).toEqual({ fontSize: 14 });
    expect(next.template.blocks[1].style).toBeUndefined();
  });

  it("replaces one block with several", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const next = editorReducer(state, { type: "replace", id, blocks: [newBlock("text"), newBlock("divider")] });
    expect(next.template.blocks).toHaveLength(10);
    expect(kinds(next).slice(0, 2)).toEqual(["text", "divider"]);
  });

  it("undoes the last change", () => {
    const state = initialEditorState(undefined);
    const id = state.template.blocks[0].id;
    const deleted = editorReducer(state, { type: "delete", id });
    expect(editorReducer(deleted, { type: "undo" }).template.blocks).toHaveLength(9);
  });

  it("undo on a fresh state is a no-op", () => {
    const state = initialEditorState(undefined);
    expect(editorReducer(state, { type: "undo" }).template.blocks).toHaveLength(9);
  });

  it("does not record selection changes in history", () => {
    const state = initialEditorState(undefined);
    const selected = editorReducer(state, { type: "select", id: state.template.blocks[0].id });
    expect(selected.past).toHaveLength(0);
  });
});

describe("newBlock", () => {
  it("gives each new block a distinct id", () => {
    expect(newBlock("text").id).not.toBe(newBlock("text").id);
  });

  it("creates a text block with one empty paragraph ready to type into", () => {
    const block = newBlock("text");
    expect(block).toMatchObject({ kind: "text", content: [{ spans: [{ text: "" }] }] });
  });

  it("creates a table with a header row", () => {
    const block = newBlock("table") as { rows: unknown[][]; hasHeader: boolean };
    expect(block.hasHeader).toBe(true);
    expect(block.rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/builder/pdfEditor/editorState.test.ts`
Expected: FAIL — cannot resolve `./editorState`.

- [ ] **Step 3: Implement**

Create `src/components/builder/pdfEditor/editorState.ts` with a reducer matching the Interfaces block above. Requirements the tests pin:

- `initialEditorState` deep-clones (`structuredClone`) its input so the editor never mutates the saved template, and falls back to `buildDefaultTemplate()`.
- Every mutating action pushes the previous template onto `past` (cap it at 50 entries); `select` does not.
- `move` with a `to` outside `0..blocks.length-1` returns the state unchanged.
- `delete` clears `selectedId` when it pointed at the deleted block.
- `newBlock("text")` → `{ kind: "text", content: [{ spans: [{ text: "" }] }] }`; `newBlock("table")` → `hasHeader: true`, `widths: [50, 50]`, two rows of two empty cells; `newBlock("spacer")` → `height: 12`; `image` → `src: ""`; `divider` and `pageBreak` need only an id.
- Ids come from the same `nextId` shape as `unlock.ts` (`${prefix}-${Date.now().toString(36)}-${counter}`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/builder/pdfEditor/editorState.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/builder/pdfEditor/
git commit -m "Add the PDF template editor's state model"
```

---

### Task 11: The editor UI

**Files:**
- Create: `src/components/builder/pdfEditor/PdfTemplateEditor.tsx` (dialog shell, two-column layout, save/cancel)
- Create: `src/components/builder/pdfEditor/BlockList.tsx` (the document column: block cards, drag handle, add/delete, unlock)
- Create: `src/components/builder/pdfEditor/BlockSettings.tsx` (the rail: style controls for the selected block)
- Create: `src/components/builder/pdfEditor/TextBlockEditor.tsx` (formatting toolbar and span editing)
- Create: `src/components/builder/pdfEditor/VariablePicker.tsx` (grouped variable list, inserts a chip)
- Create: `src/components/builder/pdfEditor/TemplatePreview.tsx` (live PDF preview plus the warnings list)
- Modify: `src/components/builder/index.ts` (export `PdfTemplateEditor`)

**Interfaces:**
- Consumes: `editorReducer`, `initialEditorState`, `newBlock` (Task 10); `buildVariableCatalogue` (Task 5); `unresolvedVariables` (Task 6); `unlockBlock`, `UNLOCKABLE` (Task 9); `PdfPreviewDialog` patterns from `src/components/common/PdfPreviewDialog.tsx`; `C` from `src/components/builder/constants.ts`.
- Produces: `PdfTemplateEditor` — props `{ open: boolean; template?: PdfTemplate; surveyJson: unknown; layerCount: number; pdfConfig: PdfConfig; sampleData: PdfFormData; onSave: (template: PdfTemplate) => void; onClose: () => void }`.

This task is UI assembly over logic already tested in Tasks 5–10; its own tests cover the two pieces with real logic in them.

- [ ] **Step 1: Write the failing tests**

Create `src/components/builder/pdfEditor/VariablePicker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupVariables, filterVariables } from "./VariablePicker";

const catalogue = [
  { token: "field:employeeName", label: "Employee Name", group: "Form fields" },
  { token: "field:reason", label: "Reason", group: "Form fields" },
  { token: "meta:submittedBy", label: "Submitted by", group: "Submission" },
];

describe("groupVariables", () => {
  it("groups variables under their group name, preserving order", () => {
    expect(groupVariables(catalogue).map((g) => g.group)).toEqual(["Form fields", "Submission"]);
    expect(groupVariables(catalogue)[0].items).toHaveLength(2);
  });

  it("handles an empty catalogue", () => {
    expect(groupVariables([])).toEqual([]);
  });
});

describe("filterVariables", () => {
  it("matches on label, case-insensitively", () => {
    expect(filterVariables(catalogue, "employee").map((v) => v.token)).toEqual(["field:employeeName"]);
  });

  it("matches on token too, so an admin can search by field name", () => {
    expect(filterVariables(catalogue, "reason").map((v) => v.token)).toEqual(["field:reason"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterVariables(catalogue, "   ")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/builder/pdfEditor/VariablePicker.test.ts`
Expected: FAIL — cannot resolve `./VariablePicker`.

- [ ] **Step 3: Build VariablePicker**

Create `VariablePicker.tsx` exporting the two pure helpers the test pins:

```tsx
export function groupVariables(catalogue: PdfVariable[]): { group: string; items: PdfVariable[] }[] {
  const groups: { group: string; items: PdfVariable[] }[] = [];
  for (const variable of catalogue) {
    const existing = groups.find((g) => g.group === variable.group);
    if (existing) existing.items.push(variable);
    else groups.push({ group: variable.group, items: [variable] });
  }
  return groups;
}

export function filterVariables(catalogue: PdfVariable[], query: string): PdfVariable[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalogue;
  return catalogue.filter((v) => v.label.toLowerCase().includes(q) || v.token.toLowerCase().includes(q));
}
```

plus the default-exported component: a search box over `filterVariables`, sections from `groupVariables`, each item a button calling `onPick(variable.token)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/builder/pdfEditor/VariablePicker.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Build the remaining five components**

Follow the conventions in `src/components/builder/` — file header comment, `C` from `./constants` for colours, MUI icons, `bx-input` class names as used in `AdminFormBuilder.tsx:2586-2606`.

- **`PdfTemplateEditor.tsx`** — full-screen dialog. `useReducer(editorReducer, initialEditorState(template))`. Left column `BlockList`, right rail `BlockSettings` over `TemplatePreview`. Header carries Undo, Reset to default (dispatch a `replace` of the whole template with `buildDefaultTemplate()`), Cancel, and Save (calls `onSave(state.template)`).
- **`BlockList.tsx`** — one card per block showing a human name (`header` → "Header", `submissionMeta` → "Submission details", `answers` → "Answers table", and so on for all nine, plus "Text", "Table", "Image", "Divider", "Spacer", "Page break"). Each card: drag handle (HTML5 `draggable`, dispatch `move` on drop), up/down buttons as a keyboard-accessible equivalent, delete, click-to-select, and for a smart block in `UNLOCKABLE` an **Unlock** button that confirms first — "Unlocking lets you edit every word of this section, but it will stop following the form. A question added later will not appear here." — then dispatches `replace` with `unlockBlock(block, ctx)`. Between cards, an **+ Add** control inserting any content block via `newBlock`.
- **`BlockSettings.tsx`** — the selected block's `BlockStyle`: font family select, font size number, bold/italic toggles, colour inputs for text/background/border, alignment, margins, padding, border width, "start on a new page". Each control dispatches `update` with a style patch. Smart blocks additionally show a read-only note saying which `pdfConfig` switch controls their visibility.
- **`TextBlockEditor.tsx`** — shown inside a selected text block's card. A toolbar (bold, italic, underline, size, colour, align, bullet, number) applying to the active span, a paragraph list with add/remove, and an **Insert variable** button opening `VariablePicker`, which appends a `{ variable: token }` span rendered as a chip showing the variable's label.
- **`TemplatePreview.tsx`** — renders `<FormPdfDocument {...sampleData} pdfTemplate={state.template} />` through `pdf().toBlob()` into an `<iframe>`, debounced ~400ms after the last edit, following `src/components/common/PdfPreviewDialog.tsx`. Above it, the warnings list from `unresolvedVariables(state.template, new Set(catalogue.map(v => v.token)))`, each entry naming the missing variable.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -b && npx eslint src/components/builder/pdfEditor/`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/builder/pdfEditor/ src/components/builder/index.ts
git commit -m "Build the PDF template editor UI"
```

---

### Task 12: Wire it into the builder

**Files:**
- Modify: `src/pages/AdminFormBuilder.tsx` (Edit document button; carry `pdfTemplate` through load, save and publish)
- Modify: `src/utils/generateFormPdf.ts` (pass the stored template into `FormPdfDocument`)
- Test: `src/pages/adminFormBuilderPdfTemplate.test.ts`

**Interfaces:**
- Consumes: `PdfTemplateEditor` (Task 11); `readTemplate` (Task 8).
- Produces: nothing new — this is the wiring.

- [ ] **Step 1: Write the failing test**

Create `src/pages/adminFormBuilderPdfTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readTemplate } from "../utils/pdfTemplate/safeTemplate";
import { buildDefaultTemplate } from "../utils/pdfTemplate/defaultTemplate";

describe("template round-trip through form meta", () => {
  it("survives being stored as JSON and read back", () => {
    const stored = JSON.stringify({ pdfTemplate: buildDefaultTemplate() });
    const meta = JSON.parse(stored) as { pdfTemplate: unknown };
    expect(readTemplate(meta.pdfTemplate)?.blocks).toHaveLength(9);
  });

  it("reads back as no template when the form never had one", () => {
    const meta = JSON.parse(JSON.stringify({})) as { pdfTemplate?: unknown };
    expect(readTemplate(meta.pdfTemplate)).toBeNull();
  });

  it("does not lose blocks an older build does not recognise", () => {
    const template = { version: 1, blocks: [...buildDefaultTemplate().blocks, { id: "x", kind: "future" }] };
    expect(readTemplate(JSON.stringify(template))?.blocks).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/pages/adminFormBuilderPdfTemplate.test.ts`
Expected: PASS if Task 8 is complete — this test pins the contract the wiring must not break. If it fails, fix `readTemplate` before wiring.

- [ ] **Step 3: Carry the template through the builder**

In `src/pages/AdminFormBuilder.tsx`:

- Add `pdfTemplate: undefined` to the initial meta at `:617` and `:1036`.
- In the load path at `:960`, read it back: `pdfTemplate: readTemplate(loadedMeta.pdfTemplate) ?? undefined`.
- Add `pdfTemplate: meta.pdfTemplate` to **both** meta snapshots written at `:1156` and `:1647`. Missing either one loses the template on publish.
- Inside the existing **PDF layout** disclosure at `:2575`, below the density and colour controls, add the button and dialog:

```tsx
<button type="button" className="bx-btn" onClick={() => setPdfEditorOpen(true)}>
  Edit document
</button>
{pdfEditorOpen && (
  <PdfTemplateEditor
    open
    template={meta.pdfTemplate}
    surveyJson={surveyJson}
    layerCount={layers.length}
    pdfConfig={meta.pdfConfig}
    sampleData={buildSamplePdfData()}
    onSave={(pdfTemplate) => { setMeta((m) => ({ ...m, pdfTemplate })); setPdfEditorOpen(false); }}
    onClose={() => setPdfEditorOpen(false)}
  />
)}
```

Use the existing sample-generation helper that the disclosure's "sample generation" control already relies on for `buildSamplePdfData`; if it is inline, lift it to a named function first.

- Add the disclosure's summary hint so the panel says whether a template exists: `meta.pdfTemplate ? "Custom document" : meta.pdfConfig.enabled ? "Custom" : "Default"`.

- [ ] **Step 4: Feed the template into real generation**

In `src/utils/generateFormPdf.ts`, wherever the `PdfFormData` object is assembled for `FormPdfDocument`, add `pdfTemplate: readTemplate(meta?.pdfTemplate) ?? undefined` alongside the existing `pdfConfig`. Grep for `pdfConfig` in that file to find every construction site and cover them all.

- [ ] **Step 5: Verify end to end**

Run: `npx vitest run` — whole suite passes, equivalence tests included.
Run: `npx tsc -b` — no errors.
Run: `npm run build` — succeeds.

Then in the app: open a form, **PDF layout → Edit document**, confirm the editor opens showing nine blocks; move one, add a text block with a variable, save, publish, submit a test response, and confirm the generated PDF reflects the change. Open a *different* form that was never edited and confirm its PDF is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminFormBuilder.tsx src/pages/adminFormBuilderPdfTemplate.test.ts src/utils/generateFormPdf.ts
git commit -m "Let admins open the PDF document editor from the form builder"
```

---

## Self-review notes

**Spec coverage.** Block model → Task 1. Storage on form meta and version pinning → Tasks 1, 12. Smart blocks and their fidelity → Tasks 2, 3, 4. Content blocks → Tasks 6, 7. Variables, catalogue, fallback text, warnings list → Tasks 5, 6, 11. Unlock → Task 9. Rendering branch → Task 4. Failure handling → Task 8 (and per-block skip in `renderBlock`). Editor UI, live preview, reorder/delete/restyle → Tasks 10, 11. Equivalence test → Task 4. Out-of-scope items are absent, as intended.

**Deviation from the spec.** The spec named six smart blocks informally; the code has nine regions plus a fixed footer. The plan uses nine and keeps the footer as page chrome, documented in the section inventory above. The spec's intent — the whole built-in layout available as blocks — is met.

**Known follow-up.** `FormPdfDocument.tsx` also backs `JobApplyPdfDocument.tsx`-adjacent flows; Task 2 touches only `FormPdfDocument`, and the full suite run in Task 2 Step 8 is what proves nothing else regressed.
