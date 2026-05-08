/**
 * FormPdfDocument.tsx — Corporate-style PDF for form submissions with approval/evaluation layers.
 */
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────────

export interface PdfFormData {
  surveyJson: {
    title?: string;
    description?: string;
    pages?: { name?: string; elements: Record<string, unknown>[] }[];
  };
  responseData: Record<string, unknown>;
  meta: {
    submittedBy: string;
    submittedAt: string;
    formTitle: string;
    formVersion: string;
    formStatus?: string;
  };
  /** Layer results: each entry is one layer's data */
  layerResults?: PdfLayerResult[];
  companyInfo?: string[];
  isoStandards?: string;
  logoUrl?: string;
}

export interface PdfLayerResult {
  layerNumber: number;
  type: "approval" | "evaluation";
  status: string;
  email: string;
  signedAt?: string;
  rejection?: string;
  signature?: string;
  /** For evaluation layers: submitted field values */
  evaluationFields?: Record<string, unknown>;
  /** For evaluation layers: confirmer name/email */
  confirmerEmail?: string;
  confirmerName?: string;
}

// ── Colors ────────────────────────────────────────────────────────────────

const C = {
  primary: "#0078D4",
  secondary: "#6264A7",
  border: "#D1D5DB",
  borderLight: "#E5E7EB",
  bg: "#F3F4F6",
  bgAlt: "#FAFBFC",
  text: "#111827",
  muted: "#6B7280",
  white: "#FFFFFF",
  // Status colors
  greenBg: "#D1FAE5",
  greenText: "#065F46",
  greenBorder: "#6EE7B7",
  redBg: "#FEE2E2",
  redText: "#991B1B",
  redBorder: "#FCA5A5",
  blueBg: "#DBEAFE",
  blueText: "#1E40AF",
  blueBorder: "#93C5FD",
  amberBg: "#FEF3C7",
  amberText: "#92400E",
  amberBorder: "#FCD34D",
  grayBg: "#F3F4F6",
  grayText: "#374151",
};

// ── Styles ────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 8.5, color: C.text },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 12, borderBottomWidth: 2.5, borderBottomColor: C.primary },
  logoBox: { width: 90, height: 42 },
  logo: { width: 90, height: 42, objectFit: "contain" },
  headerRight: { flex: 1, alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontWeight: "heavy", color: C.primary, marginBottom: 1 },
  docRef: { fontSize: 7, color: C.muted },
  // Info grid
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  infoCell: { width: "50%", marginBottom: 2 },
  infoLabel: { fontSize: 6, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  infoValue: { fontSize: 8, color: C.text, marginTop: 1 },
  // Company block
  companyBox: { backgroundColor: C.bg, padding: 7, marginBottom: 10 },
  companyLine: { fontSize: 6.5, color: C.muted, marginBottom: 1 },
  // Status badge
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 8, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, borderWidth: 1 },

  // ── Section headings ──
  sectionLabel: { fontSize: 7.5, fontWeight: "heavy", color: C.text, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 1.5, borderBottomColor: C.primary },
  subSectionLabel: { fontSize: 7.5, fontWeight: "bold", color: C.primary, marginBottom: 3, marginTop: 6 },

  // ── Layer table ──
  layerRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingVertical: 3 },
  layerHeader: { backgroundColor: C.primary },
  layerHeaderText: { color: C.white, fontSize: 6, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 3, paddingVertical: 2.5 },
  layerCell: { paddingHorizontal: 3, fontSize: 6.5, color: C.text },
  colNum: { width: "6%" },
  colType: { width: "10%" },
  colStatus: { width: "12%" },
  colEmail: { width: "22%" },
  colTime: { width: "18%" },
  colReason: { width: "32%" },

  // ── Signature block ──
  sigBlock: { flexDirection: "row", alignItems: "center", marginTop: 3, marginBottom: 3, padding: 6, backgroundColor: C.bgAlt, borderWidth: 0.5, borderColor: C.borderLight },
  sigLine: { flex: 1 },
  sigLabel: { fontSize: 5.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  sigName: { fontSize: 8, fontWeight: "bold", color: C.text, marginTop: 1 },
  sigDetail: { fontSize: 5.5, color: C.muted, marginTop: 1 },
  sigImageBox: { width: 70, height: 26, marginLeft: "auto", justifyContent: "center", alignItems: "flex-end" },
  sigImage: { maxWidth: 70, maxHeight: 26, objectFit: "contain" },

  // ── Field rows ──
  fieldRow: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 4, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  fieldRowAlt: { backgroundColor: C.bgAlt },
  fieldLabel: { width: "38%", fontSize: 7, color: C.muted, paddingRight: 4 },
  fieldValue: { width: "62%", fontSize: 7, color: C.text },

  // ── Eval fields sub-table ──
  evalSubRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 6, borderBottomWidth: 0.3, borderBottomColor: C.borderLight },
  evalSubLabel: { width: "40%", fontSize: 6, color: C.muted },
  evalSubValue: { width: "60%", fontSize: 6, color: C.text },

  // ── No data ──
  noData: { fontSize: 7, color: C.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 10 },

  // ── Footer ──
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 0.5, borderTopColor: C.borderLight, fontSize: 5.5, color: C.muted },
});

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-MY", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.Url) return o.Description ? `${o.Description}` : String(o.Url);
    return JSON.stringify(v);
  }
  return String(v);
}

function badgeStyle(status?: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("reject")) return { bg: C.redBg, text: C.redText, border: C.redBorder, label: "REJECTED" };
  if (s.includes("approved") || s.includes("completed")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "APPROVED" };
  if (s.includes("confirm")) return { bg: C.greenBg, text: C.greenText, border: C.greenBorder, label: "CONFIRMED" };
  if (s.includes("submit")) return { bg: C.blueBg, text: C.blueText, border: C.blueBorder, label: "SUBMITTED" };
  return { bg: C.grayBg, text: C.grayText, border: C.borderLight, label: (status || "SUBMITTED").toUpperCase() };
}

function isLayoutType(t: string) {
  return ["html", "image", "panel", "spacer", "divider", "pagebreak", "columns", "videeembed", "alert", "countdown", "datatable", "chartdisplay"].includes(t);
}

function flattenElements(elements: Record<string, unknown>[]): Record<string, unknown>[] {
  const r: Record<string, unknown>[] = [];
  for (const el of elements) {
    if (el.type === "panel" && Array.isArray(el.elements)) r.push(...flattenElements(el.elements as Record<string, unknown>[]));
    else r.push(el);
  }
  return r;
}

// ── Layer row component ───────────────────────────────────────────────────

function LayerRow({ layer }: { layer: PdfLayerResult; isLast: boolean }) {
  const badge = badgeStyle(layer.status);
  return (
    <View style={S.layerRow}>
      <Text style={[S.layerCell, S.colNum]}>{layer.layerNumber}</Text>
      <Text style={[S.layerCell, S.colType]}>{layer.type === "evaluation" ? "Eval" : "Approval"}</Text>
      <Text style={[S.layerCell, S.colStatus, { color: badge.text }]}>{badge.label}</Text>
      <Text style={[S.layerCell, S.colEmail]}>{layer.email || "—"}</Text>
      <Text style={[S.layerCell, S.colTime]}>{fmtDate(layer.signedAt)}</Text>
      <Text style={[S.layerCell, S.colReason]}>{layer.rejection || (layer.type === "evaluation" ? "Confirmed" : "")}</Text>
    </View>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────

export default function FormPdfDocument({ surveyJson, responseData, meta, layerResults, companyInfo, isoStandards, logoUrl }: PdfFormData) {
  const pages = surveyJson?.pages ?? [];
  const title = surveyJson?.title || meta.formTitle;
  const badge = badgeStyle(meta.formStatus);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ═══ HEADER ═══ */}
        <View style={S.header}>
          <View style={S.logoBox}>
            {logoUrl ? <Image style={S.logo} src={logoUrl} /> : <Text style={{ fontSize: 14, fontWeight: "bold", color: C.primary }}>LOGO</Text>}
          </View>
          <View style={S.headerRight}>
            <Text style={S.docTitle}>{title}</Text>
            <Text style={S.docRef}>Document Ref: {meta.formTitle} / v{meta.formVersion}</Text>
          </View>
        </View>

        {/* ═══ STATUS BADGE ═══ */}
        <View style={[S.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={{ color: badge.text }}>{badge.label}</Text>
        </View>

        {/* ═══ INFO GRID ═══ */}
        <View style={S.infoGrid}>
          <View style={S.infoCell}><Text style={S.infoLabel}>Submitted By</Text><Text style={S.infoValue}>{meta.submittedBy || "—"}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Date Submitted</Text><Text style={S.infoValue}>{fmtDate(meta.submittedAt)}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Form</Text><Text style={S.infoValue}>{meta.formTitle}</Text></View>
          <View style={S.infoCell}><Text style={S.infoLabel}>Version</Text><Text style={S.infoValue}>v{meta.formVersion}</Text></View>
        </View>

        {/* ═══ COMPANY INFO ═══ */}
        {companyInfo && companyInfo.length > 0 && (
          <View style={S.companyBox}>
            {companyInfo.map((l, i) => <Text key={i} style={S.companyLine}>{l}</Text>)}
          </View>
        )}

        {/* ═══ FORM FIELDS ═══ */}
        <View style={{ marginBottom: 24 }}>
          <Text style={S.sectionLabel}>FORM DATA</Text>
          {pages.length === 0 || pages.every(p => !p.elements?.length) ? (
            <Text style={S.noData}>No form fields available.</Text>
          ) : (
            pages.map((page, pIdx) => {
              const elements = flattenElements(page.elements || []).filter(el => !isLayoutType((el.type as string) || ""));
              if (elements.length === 0) return null;
              return (
                <View key={pIdx} wrap={false}>
                  {pages.length > 1 && <Text style={S.subSectionLabel}>{page.name || `Page ${pIdx + 1}`}</Text>}
                  {elements.map((el, fIdx) => {
                    const name = el.name as string;
                    const label = (el.title as string) || name;
                    const value = name ? responseData[name] : undefined;
                    return (
                      <View key={fIdx} style={[S.fieldRow, fIdx % 2 === 1 ? S.fieldRowAlt : {}]} wrap={false}>
                        <Text style={S.fieldLabel}>{label}</Text>
                        <Text style={S.fieldValue}>{fmtVal(value)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>

        {/* ═══ LAYER APPROVAL TABLE ═══ */}
        {layerResults && layerResults.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={S.sectionLabel}>APPROVAL / EVALUATION CHAIN</Text>
            <View style={[S.layerRow, S.layerHeader]}>
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
        )}

        {/* ═══ SIGNATURE BLOCKS (only shown when at least one layer has a signature) ═══ */}
        {layerResults && layerResults.filter(l => l.signature).length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={S.sectionLabel}>SIGNATURES</Text>
            {layerResults.filter(l => l.signature).map((layer, i) => {
              const badge = badgeStyle(layer.status);
              return (
                <View key={i} style={S.sigBlock}>
                  <View style={S.sigLine}>
                    <Text style={S.sigLabel}>Layer {layer.layerNumber} — {layer.type === "evaluation" ? "Evaluation" : "Approval"}</Text>
                    <Text style={S.sigName}>{layer.email || "—"} — <Text style={{ color: badge.text }}>{badge.label}</Text></Text>
                    <Text style={S.sigDetail}>{fmtDate(layer.signedAt)}{layer.rejection ? ` — Reason: ${layer.rejection}` : ""}</Text>
                  </View>
                  <View style={S.sigImageBox}>
                    <Image style={S.sigImage} src={layer.signature} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ EVALUATION FIELDS (per layer) ═══ */}
        {layerResults && layerResults.filter(l => l.type === "evaluation" && l.evaluationFields && Object.keys(l.evaluationFields).length > 0).length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={S.sectionLabel}>EVALUATION DETAILS</Text>
            {layerResults.filter(l => l.type === "evaluation").map((layer, i) => {
              const fields = layer.evaluationFields;
              if (!fields || Object.keys(fields).length === 0) return null;
              return (
                <View key={i} style={{ marginBottom: 6 }}>
                  <Text style={S.subSectionLabel}>Layer {layer.layerNumber} — {layer.confirmerName || layer.confirmerEmail || "Evaluator"}</Text>
                  {Object.entries(fields).map(([k, v], fi) => (
                    <View key={fi} style={S.evalSubRow}>
                      <Text style={S.evalSubLabel}>{k}</Text>
                      <Text style={S.evalSubValue}>{fmtVal(v)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ ISO STANDARDS ═══ */}
        {isoStandards && (
          <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
            <Text style={{ fontSize: 5.5, color: C.muted, textAlign: "center" }}>{isoStandards}</Text>
          </View>
        )}

        {/* ═══ FOOTER ═══ */}
        <View style={S.footer} fixed>
          <Text>Generated {new Date().toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" })}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
