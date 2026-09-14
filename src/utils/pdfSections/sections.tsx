/** sections.tsx — The nine PDF block sections plus the footer page chrome. */
import { View, Text, Image } from "@react-pdf/renderer";
import { C, S } from "./styles";
import {
  fmtDate,
  fmtVal,
  badgeStyle,
  docControlCells,
  LayerRow,
  renderMatrixField,
  shouldRenderMeasure,
  renderMeasureValue,
  collectImageSources,
  renderImageSources,
  evaluationFieldsForLayer,
  renderPaperFieldValue,
} from "./helpers";
import type { PdfSectionContext } from "./context";

export { C, S };

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

export function DocumentControlSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta, documentHeader } = ctx.data;
  const cells = docControlCells(documentHeader, meta.formVersion);
  if (cells.length === 0) return null;
  return (
    <View style={S.docControl}>
      {cells.map((cell) => (
        <View key={cell.label} style={S.docControlCell}>
          <Text style={S.docControlLabel}>{cell.label}</Text>
          <Text style={S.docControlValue}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function StatusBadgeSection({ ctx }: { ctx: PdfSectionContext }) {
  if (ctx.layoutConfig?.showStatusBadge === false) return null;
  const badge = badgeStyle(ctx.data.meta.formStatus);
  return (
    <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
      <Text style={{ color: badge.text }}>{badge.label}</Text>
    </View>
  );
}

export function SubmissionMetaSection({ ctx }: { ctx: PdfSectionContext }) {
  const { meta } = ctx.data;
  return (
    <View style={S.infoGrid}>
      {/* First cell: on a printed copy the reference is what someone reads
          back over the phone, so it leads rather than trails the grid. */}
      {ctx.referenceNo && (
        <View style={S.infoCell}><Text style={S.infoLabel}>Reference No.</Text><Text style={S.infoValue}>{ctx.referenceNo}</Text></View>
      )}
      <View style={S.infoCell}><Text style={S.infoLabel}>Submitted By</Text><Text style={S.infoValue}>{meta.submittedBy || "—"}</Text></View>
      <View style={S.infoCell}><Text style={S.infoLabel}>Date Submitted</Text><Text style={S.infoValue}>{fmtDate(meta.submittedAt)}</Text></View>
      <View style={S.infoCell}><Text style={S.infoLabel}>Form</Text><Text style={S.infoValue}>{meta.formTitle}</Text></View>
      <View style={S.infoCell}><Text style={S.infoLabel}>Version</Text><Text style={S.infoValue}>v{meta.formVersion}</Text></View>
      {ctx.selectedCompany && (
        <View style={S.infoCell}><Text style={S.infoLabel}>Company</Text><Text style={S.infoValue}>{ctx.selectedCompany}</Text></View>
      )}
    </View>
  );
}

export function AnswersSection({ ctx }: { ctx: PdfSectionContext }) {
  const { formSections, primary } = ctx;
  return (
    <View style={S.pageSection}>
      <Text style={[S.sectionLabel, { borderBottomColor: primary }]}>FORM DATA</Text>
      {formSections.length === 0 ? (
        <Text style={S.noData}>No form fields available.</Text>
      ) : (
        formSections.map((section) => (
          <View key={section.id} style={S.formSection}>
            {/* A section carrying no title is the rest of the one above it,
                resumed after a nested panel — it prints no second heading. */}
            {section.title ? <Text style={S.subSectionLabel}>{section.title}</Text> : null}
            {section.fields.map((field, fieldIndex) => {
              if (field.kind === "matrix") {
                return <View key={field.key} wrap={false}>{renderMatrixField(field)}</View>;
              }
              const imageSources = collectImageSources(field.value);
              const measureValue = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
              return (
                <View key={field.key} style={[S.fieldRow, fieldIndex % 2 === 1 ? S.fieldRowAlt : {}]} wrap={false}>
                  <Text style={S.fieldLabel}>{field.label}</Text>
                  {imageSources.length > 0 ? renderImageSources(imageSources) : measureValue || <Text style={S.fieldValue}>{fmtVal(field.value, field)}</Text>}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

export function ApprovalsSection({ ctx }: { ctx: PdfSectionContext }) {
  const { layerResults } = ctx.data;
  if (ctx.layoutConfig?.showApproverChain === false) return null;
  if (!layerResults || layerResults.length === 0) return null;
  return (
    <View break style={S.approvalPageSection}>
      <Text style={[S.sectionLabel, { borderBottomColor: ctx.primary }]}>APPROVAL / EVALUATION CHAIN</Text>
      <View style={S.tableBlock} wrap={false}>
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

export function SignaturesSection({ ctx }: { ctx: PdfSectionContext }) {
  const { layerResults } = ctx.data;
  if (ctx.layoutConfig?.showSignatures === false) return null;
  if (!layerResults || layerResults.filter((l) => l.signature).length === 0) return null;
  return (
    <View style={S.approvalPageSection}>
      <Text style={[S.sectionLabel, { borderBottomColor: ctx.primary }]}>SIGNATURES</Text>
      {layerResults.filter((l) => l.signature).map((layer, i) => {
        const badge = badgeStyle(layer.status);
        return (
          <View key={i} style={S.sigBlock} wrap={false}>
            <View style={S.sigLine}>
              <Text style={S.sigLabel}>Layer {layer.layerNumber} - {layer.type === "evaluation" ? "Evaluation" : "Approval"}</Text>
              <Text style={S.sigName}>{layer.email || ""} - <Text style={{ color: badge.text }}>{badge.label}</Text></Text>
              <Text style={S.sigDetail}>{fmtDate(layer.signedAt)}{layer.rejection ? ` - Reason: ${layer.rejection}` : ""}</Text>
            </View>
            <View style={S.sigImageBox}>
              <Image style={S.sigImage} src={layer.signature} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function EvaluationDetailsSection({ ctx }: { ctx: PdfSectionContext }) {
  const { layerResults } = ctx.data;
  const includeEmptyEvaluationFields = ctx.layoutConfig?.includeEmptyEvaluationFields === true;
  if (ctx.layoutConfig?.showEvaluationDetails === false) return null;
  if (!layerResults || layerResults.filter((l) => l.type === "evaluation" && ((l.evaluationFields && Object.keys(l.evaluationFields).length > 0) || (includeEmptyEvaluationFields && l.evaluationSurveyElements?.length))).length === 0) return null;
  return (
    <View style={S.approvalPageSection}>
      <Text style={[S.sectionLabel, { borderBottomColor: ctx.primary }]}>EVALUATION DETAILS</Text>
      {layerResults.filter((l) => l.type === "evaluation").map((layer, i) => {
        const fields = evaluationFieldsForLayer(layer, includeEmptyEvaluationFields);
        if (fields.length === 0) return null;
        return (
          <View key={i} style={{ marginBottom: includeEmptyEvaluationFields ? 12 : 6 }} wrap={false}>
            <Text style={[S.subSectionLabel, { color: ctx.secondary }]}>Layer {layer.layerNumber} - {layer.confirmerName || layer.confirmerEmail || "Evaluator"}</Text>
            {fields.map((field, fi) => {
              const imageSources = collectImageSources(field.value);
              const measureValue = shouldRenderMeasure(field) ? renderMeasureValue(field) : null;
              return (
                <View key={fi} style={includeEmptyEvaluationFields ? S.paperEvalRow : S.evalSubRow} wrap={false}>
                  <Text style={includeEmptyEvaluationFields ? S.paperEvalLabel : S.evalSubLabel}>{field.label}</Text>
                  {includeEmptyEvaluationFields
                    ? renderPaperFieldValue(field)
                    : imageSources.length > 0 ? renderImageSources(imageSources) : measureValue || <Text style={S.evalSubValue}>{fmtVal(field.value, field)}</Text>}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export function IsoStandardsSection({ ctx }: { ctx: PdfSectionContext }) {
  const { isoStandards } = ctx.data;
  if (!isoStandards) return null;
  return (
    <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
      <Text style={{ fontSize: 5.5, color: C.muted, textAlign: "center" }}>{isoStandards}</Text>
    </View>
  );
}

// Hoisted so it is the same function reference on every render — an inline
// arrow here would be a fresh closure each call, which is invisible in the PDF
// output but makes two otherwise-identical element trees compare unequal.
function renderPageNumber({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return `Page ${pageNumber} of ${totalPages}`;
}

export function FooterChrome({ ctx }: { ctx: PdfSectionContext }) {
  return (
    <View style={S.footer} fixed>
      <Text>{ctx.layoutConfig?.footerText?.trim() || `Generated ${fmtDate(new Date().toISOString())}`}</Text>
      <Text render={renderPageNumber} />
    </View>
  );
}
