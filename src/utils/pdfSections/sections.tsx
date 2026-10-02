/** sections.tsx — The nine PDF block sections plus the footer page chrome. */
import type { ReactElement } from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { C, S } from "./styles";
import {
  fmtDate,
  stampInfo,
  fmtVal,
  badgeStyle,
  docControlCells,
  LayerRow,
  renderMatrixField,
  shouldRenderMeasure,
  measureText,
  collectImageSources,
  renderImageSources,
  evaluationFieldsForLayer,
  renderPaperFieldValue,
} from "./helpers";
import { footerContentForPage } from "../pdfTemplate/footer";
import { resolveSpan } from "../pdfTemplate/resolve";
import type { FormSubmissionField } from "../formSubmissionLayout";
import type { PdfSectionContext } from "./context";
import type { PdfLayerResult } from "../FormPdfDocument";
import { signOffLabel, signOffName, signOffPosition, signOffVerdictFromStatus } from "../signOff";
import type { TemplateFooter } from "../pdfTemplate/types";

export { C, S };

// A label above its value: the one cell shape the whole document is built from.
function LabelledCell({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <>
      <Text style={S.cellLabel}>{label}</Text>
      <Text style={S.cellValue}>{value}</Text>
    </>
  );
}

export function HeaderSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta, layerResults } = ctx.data;
  const showBadge = ctx.layoutConfig?.showStatusBadge !== false;
  const badge = badgeStyle(meta.formStatus, layerResults);
  const stamp = ctx.layoutConfig?.showStamp === false ? null : stampInfo(meta.formStatus, layerResults);
  return (
    <View style={[S.header, { borderBottomColor: ctx.primary }]}>
      <View style={S.headerLeft}>
        {ctx.effectiveLogoUrl ? (
          <View style={S.logoBox}>
            <Image style={S.logo} src={ctx.effectiveLogoUrl} />
          </View>
        ) : null}
        <Text style={S.docTitle}>{ctx.title}</Text>
      </View>
      {stamp ? (
        <View style={S.stamp}>
          <View style={[S.stampOuter, { borderColor: stamp.color }]}>
            <View style={[S.stampInner, { borderColor: stamp.color }]}>
              <Text style={[S.stampTop, { color: stamp.color }]}>PMW HR FORM</Text>
              <Text style={[S.stampWord, { color: stamp.color }]}>{stamp.label}</Text>
              <Text style={[S.stampDate, { color: stamp.color }]}>{stamp.date || " "}</Text>
            </View>
          </View>
        </View>
      ) : null}
      <View style={S.headerRight}>
        {showBadge && (
          <View style={[S.badge, { backgroundColor: C.white, borderColor: badge.text }]}>
            <Text style={[S.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        )}
        <Text style={S.docRef}>Document Ref: {meta.formTitle} / v{meta.formVersion}</Text>
      </View>
    </View>
  );
}

export function DocumentControlSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta, documentHeader } = ctx.data;
  const cells = docControlCells(documentHeader, meta.formVersion);
  if (cells.length === 0) return null;
  return (
    <View style={S.docControl}>
      {cells.map((cell) => (
        <View key={cell.label} style={S.docControlCell}>
          <LabelledCell label={cell.label} value={cell.value} />
        </View>
      ))}
    </View>
  );
}

// The status badge is drawn in the header's right-hand column; this block is
// kept so existing templates that list it keep resolving.
export function StatusBadgeSection(_props: { ctx: PdfSectionContext }) {
  return null;
}

export function SubmissionMetaSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta } = ctx.data;
  // A reference leads: on a printed copy it is what gets read back by phone.
  const cells: { label: string; value: string }[] = [
    ...(ctx.referenceNo ? [{ label: "Reference No.", value: ctx.referenceNo }] : []),
    { label: "Submitted By", value: meta.submittedBy || "—" },
    { label: "Date Submitted", value: fmtDate(meta.submittedAt) },
    ...(ctx.selectedCompany ? [{ label: "Company", value: ctx.selectedCompany }] : []),
  ];
  return (
    <View style={S.infoGrid}>
      {cells.map((cell) => (
        <View key={cell.label} style={S.infoCell}>
          <LabelledCell label={cell.label} value={cell.value} />
        </View>
      ))}
    </View>
  );
}

// ── Form data ─────────────────────────────────────────────────────────────

type GridItem = { field: FormSubmissionField; span: 1 | 2 | 3; text: string; images: string[] };

function gridItem(field: FormSubmissionField): GridItem {
  const images = collectImageSources(field.value);
  const measure = shouldRenderMeasure(field) ? measureText(field) : null;
  const text = images.length > 0 ? "" : measure ?? (fmtVal(field.value, field) || "—");
  let span: 1 | 2 | 3 = 1;
  if (images.length > 2) span = 2;
  else if (text.includes("\n") || text.length > 84) span = 3;
  else if (text.length > 34) span = 2;
  return { field, span, text, images };
}

function GridCell({ item }: { item: GridItem }): ReactElement {
  return (
    <View style={[S.gridCell, { width: `${item.span * 33.333}%` }]} wrap={false}>
      <Text style={S.cellLabel}>{item.field.label}</Text>
      {item.images.length > 0 ? renderImageSources(item.images) : <Text style={S.cellValue}>{item.text}</Text>}
    </View>
  );
}

/** Fills rows three units wide in document order; a cell that does not fit
 *  starts the next row rather than jumping ahead of the one before it. */
function packRows(items: GridItem[]): GridItem[][] {
  const rows: GridItem[][] = [];
  let current: GridItem[] = [];
  let used = 0;
  for (const item of items) {
    if (used + item.span > 3) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += item.span;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function sectionBody(fields: FormSubmissionField[]): ReactElement[] {
  const out: ReactElement[] = [];
  let pending: GridItem[] = [];
  const flush = () => {
    packRows(pending).forEach((row, i) => {
      out.push(
        <View key={`row-${out.length}-${i}`} style={S.gridRow} wrap={false}>
          {row.map((item) => <GridCell key={item.field.key} item={item} />)}
        </View>,
      );
    });
    pending = [];
  };
  for (const field of fields) {
    if (field.kind === "matrix") {
      flush();
      const matrix = renderMatrixField(field);
      if (matrix) out.push(<View key={field.key}>{matrix}</View>);
      continue;
    }
    pending.push(gridItem(field));
  }
  flush();
  return out;
}

export function AnswersSection({ ctx }: { ctx: PdfSectionContext }) {
  const { formSections } = ctx;
  return (
    <View style={S.pageSection}>
      <Text style={S.dataLabel} minPresenceAhead={40}>Form data</Text>
      {formSections.length === 0 ? (
        <Text style={S.noData}>No form fields available.</Text>
      ) : (
        formSections.map((section) => (
          <View key={section.id} style={S.formSection}>
            {/* A section carrying no title is the rest of the one above it,
                resumed after a nested panel — it prints no second heading. */}
            {section.title ? <Text style={S.subSectionLabel} minPresenceAhead={36}>{section.title}</Text> : null}
            {sectionBody(section.fields)}
          </View>
        ))
      )}
    </View>
  );
}

// ── Chain ─────────────────────────────────────────────────────────────────

export function ApprovalsSection({ ctx }: { ctx: PdfSectionContext }) {
  const { layerResults } = ctx.data;
  if (ctx.layoutConfig?.showApproverChain === false) return null;
  if (!layerResults || layerResults.length === 0) return null;
  return (
    <View style={S.pageSection}>
      <Text style={S.sectionLabel} minPresenceAhead={40}>Approval / evaluation chain</Text>
      <View style={S.tableBlock}>
        <View style={[S.layerRow, S.layerHeader, { backgroundColor: ctx.primary }]} wrap={false}>
          <Text style={[S.layerHeaderText, S.colNum]}>#</Text>
          <Text style={[S.layerHeaderText, S.colType]}>Type</Text>
          <Text style={[S.layerHeaderText, S.colStatus]}>Status</Text>
          <Text style={[S.layerHeaderText, S.colEmail]}>Assignee</Text>
          <Text style={[S.layerHeaderText, S.colTime]}>Date/Time</Text>
          <Text style={[S.layerHeaderText, S.colReason]}>Remarks</Text>
        </View>
        {layerResults.map((layer, i) => (
          <LayerRow key={i} layer={layer} isLast={i === layerResults.length - 1} />
        ))}
      </View>
    </View>
  );
}

function isManual(layer: PdfLayerResult): boolean {
  return layer.status.trim().toLowerCase().startsWith("manual ");
}

// Name and post come from the sign-off helpers (`utils/signOff.ts`): the
// directory name and position stamped at signing, else the address and the
// layer's own title.
function SignatureCard({ layer }: { layer: PdfLayerResult }): ReactElement {
  const verdict = signOffVerdictFromStatus(layer.status);
  const name = signOffName(layer.signerName || layer.confirmerName, layer.email || layer.confirmerEmail);
  const position = signOffPosition(layer.signerPosition, layer.layerTitle || `Layer ${layer.layerNumber}`);
  const when = layer.signedAt ? fmtDate(layer.signedAt) : "";
  return (
    <View style={S.sigCard} wrap={false}>
      <View style={S.sigText}>
        <Text style={[S.sigLabel, verdict === "rejected" ? { color: C.redText } : {}]}>
          {signOffLabel(verdict ?? "approved")} - Layer {layer.layerNumber}
        </Text>
        <Text style={S.sigName}>{name || " "}</Text>
        {position ? <Text style={S.sigDetail}>{position}</Text> : null}
        {layer.rejection ? <Text style={S.sigDetail}>Reason: {layer.rejection}</Text> : null}
        {when ? <Text style={S.sigDetail}>{when}</Text> : null}
      </View>
      {layer.signature ? (
        <View style={S.sigPad}>
          <Image style={S.sigImage} src={layer.signature} />
          <View style={S.sigLine} />
        </View>
      ) : null}
    </View>
  );
}

function signedLayers(ctx: PdfSectionContext): PdfLayerResult[] {
  if (ctx.layoutConfig?.showSignatures === false) return [];
  // Every personally decided layer is listed, with or without a drawn
  // signature: a checkbox approval or an evaluation is signed just as surely,
  // and the record has to name its signer. Paper-closed and cascade-rejected
  // layers record no decision of their own and are left out.
  return (ctx.data.layerResults ?? []).filter((l) => !isManual(l) && signOffVerdictFromStatus(l.status) !== null);
}

function EvaluationBlocks({ ctx }: { ctx: PdfSectionContext }): ReactElement[] {
  const { layerResults } = ctx.data;
  const includeEmpty = ctx.layoutConfig?.includeEmptyEvaluationFields === true;
  const out: ReactElement[] = [];
  (layerResults ?? []).filter((l) => l.type === "evaluation").forEach((layer, i) => {
    const fields = evaluationFieldsForLayer(layer, includeEmpty);
    if (fields.length === 0) return;
    out.push(
      <View key={i} style={S.evalBlock} wrap={false}>
        <Text style={S.evalTitle}>Layer {layer.layerNumber} {"·"} {ctx.layoutConfig?.showSignatures === false ? signOffName(layer.signerName || layer.confirmerName, layer.confirmerEmail || layer.email) || "Evaluator" : "Evaluation"}</Text>
        {fields.map((field, fi) => {
          if (includeEmpty) {
            return (
              <View key={fi} style={S.paperEvalRow} wrap={false}>
                <Text style={S.paperEvalLabel}>{field.label}</Text>
                {renderPaperFieldValue(field)}
              </View>
            );
          }
          const item = gridItem(field);
          return (
            <View key={fi} style={S.evalRow} wrap={false}>
              <Text style={S.evalLabel}>{field.label}</Text>
              <View style={{ width: "38%" }}>
                {item.images.length > 0 ? renderImageSources(item.images) : <Text style={{ fontSize: 7, fontWeight: "bold", lineHeight: 1.5 }}>{item.text}</Text>}
              </View>
            </View>
          );
        })}
        <View style={S.evalEnd} />
      </View>,
    );
  });
  return out;
}

function hasEvaluationDetails(ctx: PdfSectionContext): boolean {
  if (ctx.layoutConfig?.showEvaluationDetails === false) return false;
  const includeEmpty = ctx.layoutConfig?.includeEmptyEvaluationFields === true;
  return (ctx.data.layerResults ?? []).some((l) => l.type === "evaluation" && evaluationFieldsForLayer(l, includeEmpty).length > 0);
}

function EvaluationColumn({ ctx }: { ctx: PdfSectionContext }): ReactElement {
  return (
    <>
      <Text style={S.sectionLabel} minPresenceAhead={40}>Evaluation details</Text>
      {EvaluationBlocks({ ctx })}
    </>
  );
}

function SignatureColumn({ layers }: { layers: PdfLayerResult[] }): ReactElement {
  return (
    <>
      <Text style={S.sectionLabel} minPresenceAhead={40}>Signatures</Text>
      {layers.map((layer, i) => <SignatureCard key={i} layer={layer} />)}
    </>
  );
}

// Signatures and evaluation details sit side by side when both exist. They are
// two blocks, so the one that is drawn first carries the other and marks it
// done on the context; the second then has nothing left to draw.
export function SignaturesSection({ ctx }: { ctx: PdfSectionContext }) {
  const layers = signedLayers(ctx);
  if (layers.length === 0) return null;
  const paired = !ctx.state.evaluationDrawn && hasEvaluationDetails(ctx) && ctx.layoutConfig?.includeEmptyEvaluationFields !== true;
  if (!paired) {
    return <View style={S.pageSection}>{SignatureColumn({ layers })}</View>;
  }
  ctx.state.evaluationDrawn = true;
  return (
    <View style={S.bottomRow}>
      <View style={S.bottomLeft}>{SignatureColumn({ layers })}</View>
      <View style={S.bottomRight}>{EvaluationColumn({ ctx })}</View>
    </View>
  );
}

export function EvaluationDetailsSection({ ctx }: { ctx: PdfSectionContext }) {
  if (ctx.state.evaluationDrawn || !hasEvaluationDetails(ctx)) return null;
  ctx.state.evaluationDrawn = true;
  return <View style={S.pageSection}>{EvaluationColumn({ ctx })}</View>;
}

// The ISO line now lives in the footer, with the generated-on stamp.
export function IsoStandardsSection(_props: { ctx: PdfSectionContext }) {
  return null;
}

// ── Footer ────────────────────────────────────────────────────────────────

// Hoisted so it is the same function reference on every render — an inline
// arrow here would be a fresh closure each call, which is invisible in the PDF
// output but makes two otherwise-identical element trees compare unequal.
function renderPageNumber({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return `Page ${pageNumber} of ${totalPages}`;
}

function defaultFooterText(ctx: PdfSectionContext): string {
  const iso = ctx.data.isoStandards?.trim();
  const stamp = ctx.layoutConfig?.footerText?.trim() || `Generated ${fmtDate(new Date().toISOString())}`;
  return iso ? `${iso} · ${stamp}` : stamp;
}

// Memoised per (footer, ctx) pair so repeated renders of the same document
// hand `Text` the same `render` function instance every time — a fresh
// closure per call is invisible in the PDF output but makes two otherwise-
// identical element trees compare unequal in the equivalence tests.
const footerRenderCache = new WeakMap<TemplateFooter, WeakMap<PdfSectionContext, (args: { pageNumber: number; totalPages: number }) => string>>();

function getFooterContentRender(footer: TemplateFooter, ctx: PdfSectionContext) {
  let byCtx = footerRenderCache.get(footer);
  if (!byCtx) {
    byCtx = new WeakMap();
    footerRenderCache.set(footer, byCtx);
  }
  let render = byCtx.get(ctx);
  if (!render) {
    render = ({ pageNumber, totalPages }) => {
      const content = footerContentForPage(footer, pageNumber);
      if (!content) return defaultFooterText(ctx);
      const text = content.flatMap((p) => p.spans).map((span) => resolveSpan(span, ctx, { pageNumber, totalPages })).join("");
      // A template footer that resolves to nothing must not blank the page.
      return text.trim() ? text : defaultFooterText(ctx);
    };
    byCtx.set(ctx, render);
  }
  return render;
}

export function FooterChrome({ ctx, footer }: { ctx: PdfSectionContext; footer?: TemplateFooter }) {
  return (
    <View style={S.footer} fixed>
      {footer ? (
        <Text style={S.footerLeft} render={getFooterContentRender(footer, ctx)} />
      ) : (
        <Text style={S.footerLeft}>{defaultFooterText(ctx)}</Text>
      )}
      <Text style={S.footerRight} render={renderPageNumber} />
    </View>
  );
}
