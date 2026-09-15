/** styles.ts — Colors and StyleSheet definitions shared by every PDF section. */
import { StyleSheet } from "@react-pdf/renderer";
import { editorial } from "../../theme/editorial";

// ── Colors ────────────────────────────────────────────────────────────────

export const C = {
  primary: editorial.pmwBlue,
  secondary: editorial.pmwPurple,
  border: editorial.border,
  borderLight: editorial.border,
  bg: editorial.skySoft,
  bgAlt: editorial.paperSoft,
  text: editorial.ink,
  muted: editorial.muted,
  white: editorial.white,
  // Status colors
  greenBg: editorial.successSoft,
  greenText: editorial.success,
  greenBorder: editorial.successFill,
  redBg: editorial.errorSoft,
  redText: editorial.error,
  redBorder: editorial.errorFill,
  blueBg: editorial.blueWash,
  blueText: editorial.pmwBlueDark,
  blueBorder: editorial.sky,
  amberBg: editorial.accentSoft,
  amberText: editorial.accentText,
  amberBorder: editorial.accent,
  grayBg: editorial.skySoft,
  grayText: editorial.ink,
};

// ── Styles ────────────────────────────────────────────────────────────────

export const S = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 32, paddingBottom: 54, fontFamily: "Helvetica", fontSize: 8.5, color: C.text, lineHeight: 1.25 },
  // Header
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14, paddingBottom: 12, borderBottomWidth: 2.5, borderBottomColor: C.primary },
  logoBox: { width: 90, height: 42, marginRight: 18, flexShrink: 0 },
  logo: { width: 90, height: 42, objectFit: "contain" },
  headerRight: { flexGrow: 1, flexShrink: 1, alignItems: "flex-end" },
  docTitle: { fontSize: 15, fontWeight: "heavy", color: C.primary, marginBottom: 3, textAlign: "right", lineHeight: 1.12 },
  docRef: { fontSize: 6.5, color: C.muted, textAlign: "right", lineHeight: 1.2 },
  // Info grid
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  infoCell: { width: "50%", marginBottom: 4, paddingRight: 8 },
  infoLabel: { fontSize: 6, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  infoValue: { fontSize: 8, color: C.text, marginTop: 1, lineHeight: 1.25 },
  // Document control header
  docControl: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.5, borderColor: C.border, marginBottom: 10 },
  docControlCell: { paddingVertical: 3.5, paddingHorizontal: 7, borderRightWidth: 0.5, borderRightColor: C.borderLight, borderBottomWidth: 0.5, borderBottomColor: C.borderLight },
  docControlLabel: { fontSize: 5.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  docControlValue: { fontSize: 7.5, color: C.text, marginTop: 1, fontWeight: "bold" },
  // Company block
  companyBox: { backgroundColor: C.bg, padding: 7, marginBottom: 10 },
  companyLine: { fontSize: 6.5, color: C.muted, marginBottom: 1 },
  // Status badge
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 8, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, borderWidth: 1 },

  // ── Section headings ──
  sectionLabel: { fontSize: 7.5, fontWeight: "heavy", color: C.text, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 1.5, borderBottomColor: C.primary },
  pageSection: { marginBottom: 24 },
  approvalPageSection: { marginBottom: 18 },
  tableBlock: { borderWidth: 0.5, borderColor: C.borderLight, marginTop: 2 },
  subSectionLabel: { fontSize: 7.5, fontWeight: "bold", color: C.primary, marginBottom: 3, marginTop: 6 },

  // ── Layer table ──
  layerRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingVertical: 3.5, alignItems: "flex-start" },
  layerHeader: { backgroundColor: C.primary },
  layerHeaderText: { color: C.white, fontSize: 6, fontWeight: "heavy", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: 3, paddingVertical: 2.5 },
  layerCell: { paddingHorizontal: 3, fontSize: 6.5, color: C.text, lineHeight: 1.25 },
  colNum: { width: "6%" },
  colType: { width: "12%" },
  colStatus: { width: "13%" },
  colEmail: { width: "21%" },
  colTime: { width: "20%" },
  colReason: { width: "28%" },

  // ── Signature block ──
  sigBlock: { flexDirection: "row", alignItems: "center", marginTop: 3, marginBottom: 4, padding: 7, backgroundColor: C.bgAlt, borderWidth: 0.5, borderColor: C.borderLight },
  sigLine: { flex: 1 },
  sigLabel: { fontSize: 5.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  sigName: { fontSize: 8, fontWeight: "bold", color: C.text, marginTop: 1 },
  sigDetail: { fontSize: 5.5, color: C.muted, marginTop: 1 },
  sigImageBox: { width: 92, minHeight: 34, marginLeft: "auto", justifyContent: "center", alignItems: "flex-end" },
  sigImage: { maxWidth: 92, maxHeight: 34, objectFit: "contain" },

  // ── Field rows ──
  fieldRow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  fieldRowAlt: { backgroundColor: C.bgAlt },
  fieldLabel: { width: "34%", fontSize: 7, color: C.muted, paddingRight: 6, lineHeight: 1.3 },
  fieldValue: { width: "66%", fontSize: 7, color: C.text, lineHeight: 1.3 },
  imageGrid: { width: "66%", flexDirection: "row", flexWrap: "wrap" },
  imageTile: { width: "45%", minHeight: 64, borderWidth: 0.5, borderColor: C.borderLight, backgroundColor: C.white, padding: 4, marginRight: 6, marginBottom: 5, justifyContent: "center", alignItems: "center" },
  imagePreview: { maxWidth: "100%", maxHeight: 76, objectFit: "contain" },
  measureBox: { width: "66%" },
  measureValue: { fontSize: 7, fontWeight: "bold", color: C.text, marginBottom: 3 },
  measureTrack: { height: 5, backgroundColor: C.borderLight, borderRadius: 2.5, marginBottom: 3 },
  measureFill: { height: 5, backgroundColor: C.primary, borderRadius: 2.5 },
  measureScale: { flexDirection: "row", justifyContent: "space-between" },
  measureScaleText: { fontSize: 5.5, color: C.muted },

  // ── Eval fields sub-table ──
  evalSubRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 6, borderBottomWidth: 0.3, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  evalSubLabel: { width: "34%", fontSize: 6, color: C.muted, paddingRight: 5, lineHeight: 1.25 },
  evalSubValue: { width: "66%", fontSize: 6, color: C.text, lineHeight: 1.25 },
  paperEvalRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  paperEvalLabel: { width: "30%", fontSize: 10, color: C.text, paddingRight: 10, lineHeight: 1.35 },
  paperFieldBox: { width: "66%" },
  paperLine: { height: 32, borderBottomWidth: 0.9, borderBottomColor: C.border, marginBottom: 8 },
  paperLineText: { fontSize: 9.5, color: C.text, lineHeight: 1.25 },
  paperOptionGroup: { width: "70%", flexDirection: "row", flexWrap: "wrap" },
  paperOption: { flexDirection: "row", alignItems: "center", marginRight: 20, marginBottom: 11 },
  paperOptionBox: { width: 15, height: 15, borderWidth: 1, borderColor: C.text, marginRight: 7, alignItems: "center", justifyContent: "center" },
  paperOptionMark: { fontSize: 10, fontWeight: "bold", lineHeight: 1 },
  paperOptionLabel: { fontSize: 9.5, color: C.text, lineHeight: 1.25 },

  // ── No data ──
  noData: { fontSize: 7, color: C.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 10 },

  // ── Footer ──
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 0.5, borderTopColor: C.borderLight, fontSize: 6, color: C.muted },

  // ── Matrix table ──
  matrixSection: { marginBottom: 16 },
  // The legend, printed under the table it explains.
  matrixGuideBlock: { marginTop: 2, marginBottom: 6, paddingLeft: 4 },
  matrixGuideTitle: { fontSize: 6, fontWeight: "heavy", color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  matrixGuideLine: { fontSize: 6.5, color: C.muted, marginBottom: 1 },
  matrixTable: { marginBottom: 8, borderWidth: 0.5, borderColor: C.border },
  matrixHeaderRow: { flexDirection: "row", backgroundColor: C.primary },
  // Banner row: one heading over a run of columns, divided from its neighbours
  // and set a shade apart from the column titles beneath it.
  matrixGroupRow: { flexDirection: "row", backgroundColor: C.primary, borderBottomWidth: 0.5, borderBottomColor: C.white },
  matrixGroupText: { fontSize: 6, fontWeight: "heavy", color: C.white, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center" },
  matrixHeaderCell: { paddingHorizontal: 4, paddingVertical: 3, borderRightWidth: 0.5, borderRightColor: C.white },
  matrixHeaderText: { fontSize: 6, fontWeight: "heavy", color: C.white, textTransform: "uppercase", letterSpacing: 0.3 },
  matrixDataRow: { flexDirection: "row", borderBottomWidth: 0.3, borderBottomColor: C.borderLight },
  matrixDataRowAlt: { backgroundColor: C.bgAlt },
  matrixDataCell: { paddingHorizontal: 4, paddingVertical: 2.5, borderRightWidth: 0.3, borderRightColor: C.borderLight },
  matrixDataText: { fontSize: 6.5, color: C.text },
  matrixFieldLabel: { fontSize: 7.5, fontWeight: "bold", color: C.secondary, marginBottom: 3, marginTop: 2 },
  formSection: { marginBottom: 8 },
});
