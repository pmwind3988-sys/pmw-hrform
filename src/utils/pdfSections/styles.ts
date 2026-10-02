/** styles.ts — Colors and StyleSheet definitions shared by every PDF section. */
import { StyleSheet } from "@react-pdf/renderer";
import { editorial } from "../../theme/editorial";

// ── Colors ────────────────────────────────────────────────────────────────

export const C = {
  primary: "#2b2870",
  secondary: "#00658e",
  border: "#d8dde4",
  borderLight: "#e5e9ee",
  bg: "#f7f9fb",
  bgAlt: "#fafbfd",
  text: "#0c0e14",
  body: "#4c5566",
  muted: "#6b7484",
  white: editorial.white,
  // Status colors
  greenBg: "#e2f4ec",
  greenText: "#1f8a5b",
  greenBorder: editorial.successFill,
  redBg: "#fbe6e4",
  redText: "#c0362c",
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
//
// Sizes follow the one-page prototype (px * 0.75): body 7.3pt, labels 6pt,
// block titles 6.4pt, 7pt between blocks.

export const S = StyleSheet.create({
  page: { paddingTop: 24, paddingHorizontal: 30, paddingBottom: 40, fontFamily: "Helvetica", fontSize: 7.3, color: C.text},
  // Header
  header: { flexDirection: "row", alignItems: "flex-start", minHeight: 48, marginBottom: 7, paddingBottom: 7, borderBottomWidth: 1.5, borderBottomColor: C.primary },
  headerLeft: { flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 1, maxWidth: 235 },
  logoBox: { width: 62, height: 24, marginRight: 9, flexShrink: 0 },
  logo: { width: 62, height: 24, objectFit: "contain", objectPositionX: 0 },
  headerRight: { flexGrow: 1, flexShrink: 0, alignItems: "flex-end" },
  docTitle: { flexShrink: 1, fontSize: 12.75, fontWeight: "bold", color: C.text, textAlign: "left", lineHeight: 1.5 },
  docRef: { fontSize: 6.4, color: C.muted, textAlign: "right", lineHeight: 1.5 },
  // Status badge
  badge: { alignSelf: "flex-end", paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 1.5, borderWidth: 1.1, marginBottom: 3 },
  badgeText: { fontSize: 7, fontWeight: "bold", letterSpacing: 1, lineHeight: 1.5 },

  // Document control + submission meta
  docControl: { flexDirection: "row", backgroundColor: C.bg, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 7, marginBottom: 7 },
  docControlCell: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 7, marginBottom: 4 },
  infoCell: { width: "25%", marginBottom: 4, paddingRight: 8 },
  // One label/value pair, used by every cell in the document.
  cellLabel: { fontSize: 5.8, fontWeight: "bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.55, lineHeight: 1.5 },
  cellValue: { fontSize: 7.3, color: C.text, marginTop: 0.5, lineHeight: 1.5 },

  // ── Section headings ──
  sectionLabel: { fontSize: 6.4, fontWeight: "bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.9, textDecoration: "underline", marginBottom: 3, lineHeight: 1.5 },
  dataLabel: { fontSize: 6.4, fontWeight: "bold", color: C.text, textTransform: "uppercase", letterSpacing: 0.9, paddingBottom: 2, borderBottomWidth: 0.6, borderBottomColor: C.borderLight, marginBottom: 4, lineHeight: 1.5 },
  pageSection: { marginBottom: 7 },
  subSectionLabel: { fontSize: 6.4, fontWeight: "bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.9, textDecoration: "underline", marginBottom: 2.5, marginTop: 3, lineHeight: 1.5 },
  formSection: { marginBottom: 3 },

  // ── Answer grid ──
  gridRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  gridCell: { paddingRight: 10 },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 1.5 },
  thumb: { height: 28, width: 84, objectFit: "contain", objectPositionX: 0, marginRight: 6 },

  // ── Layer table ──
  tableBlock: { borderWidth: 0.5, borderColor: C.border },
  layerRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.borderLight, alignItems: "flex-start" },
  layerHeader: { backgroundColor: C.primary, borderTopWidth: 0 },
  layerHeaderText: { color: C.white, fontSize: 5.8, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 5, paddingVertical: 2.5, lineHeight: 1.5 },
  layerCell: { paddingHorizontal: 5, paddingVertical: 2.5, fontSize: 7, color: C.text, lineHeight: 1.5 },
  layerStatusText: { fontWeight: "bold" },
  colNum: { width: "5%" },
  colType: { width: "11%" },
  colStatus: { width: "14%" },
  colEmail: { width: "36%" },
  colTime: { width: "20%" },
  colReason: { width: "14%" },

  // ── Signature cards + evaluation details (side by side) ──
  bottomRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  bottomLeft: { flexGrow: 1, flexBasis: 0, marginRight: 12 },
  bottomRight: { flexGrow: 1.25, flexBasis: 0 },
  sigCard: { flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: 6, backgroundColor: C.bgAlt, borderWidth: 0.5, borderColor: C.borderLight, marginBottom: 3 },
  sigText: { flexGrow: 1, flexShrink: 1 },
  sigLabel: { fontSize: 5.8, fontWeight: "bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.5 },
  sigName: { fontSize: 7.3, fontWeight: "bold", color: C.text, lineHeight: 1.5 },
  sigDetail: { fontSize: 6, color: C.muted, lineHeight: 1.5 },
  sigPad: { width: 96, alignItems: "flex-end", flexShrink: 0, marginLeft: 6 },
  sigImage: { width: 96, height: 24, objectFit: "contain", objectPositionX: 1 },
  sigLine: { width: 96, height: 0.7, backgroundColor: C.text },
  sigLineGap: { height: 24 },
  sigNote: { fontSize: 6, color: C.muted, lineHeight: 1.5 },
  evalBlock: { marginBottom: 4 },
  evalTitle: { fontSize: 7, fontWeight: "bold", color: C.primary, marginBottom: 1, lineHeight: 1.5 },
  evalRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2, borderTopWidth: 0.5, borderTopColor: C.borderLight },
  evalLabel: { width: "62%", fontSize: 7, color: C.body, paddingRight: 6, lineHeight: 1.5 },
  evalValue: { width: "38%", fontSize: 7, fontWeight: "bold", color: C.text, lineHeight: 1.5 },
  evalEnd: { borderTopWidth: 0.5, borderTopColor: C.borderLight },

  // ── Rubber stamp ("chop") ──
  // Fixed box and explicit line heights: the three lines are stacked by height,
  // never by font metrics, so they cannot run into each other.
  stamp: { position: "absolute", top: 0, left: 252, width: 86, height: 44, opacity: 0.85, transform: "rotate(-7deg)" },
  stampOuter: { width: 86, height: 44, borderWidth: 1.4, borderRadius: 5, padding: 2 },
  stampInner: { flexGrow: 1, borderWidth: 0.6, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  stampTop: { fontSize: 4.6, fontWeight: "bold", letterSpacing: 0.9, lineHeight: 1.5, height: 7, textAlign: "center" },
  stampWord: { fontSize: 10.5, fontWeight: "bold", letterSpacing: 0.7, lineHeight: 1.5, height: 16, textAlign: "center" },
  stampDate: { fontSize: 4.6, fontWeight: "bold", letterSpacing: 0.9, lineHeight: 1.5, height: 7, textAlign: "center" },

  // ── Misc ──
  measureBox: { width: "66%" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap" },
  paperEvalRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, alignItems: "flex-start" },
  paperEvalLabel: { width: "30%", fontSize: 10, color: C.text, paddingRight: 10, lineHeight: 1.5 },
  paperFieldBox: { width: "66%" },
  paperLine: { height: 32, borderBottomWidth: 0.9, borderBottomColor: C.border, marginBottom: 8 },
  paperLineText: { fontSize: 9.5, color: C.text, lineHeight: 1.5 },
  paperOptionGroup: { width: "70%", flexDirection: "row", flexWrap: "wrap" },
  paperOption: { flexDirection: "row", alignItems: "center", marginRight: 20, marginBottom: 11 },
  paperOptionBox: { width: 15, height: 15, borderWidth: 1, borderColor: C.text, marginRight: 7, alignItems: "center", justifyContent: "center" },
  paperOptionMark: { fontSize: 10, fontWeight: "bold", lineHeight: 1.5 },
  paperOptionLabel: { fontSize: 9.5, color: C.text, lineHeight: 1.5 },
  noData: { fontSize: 7, color: C.muted, fontStyle: "italic", textAlign: "center", paddingVertical: 8, lineHeight: 1.5 },

  // ── Footer ──
  // The footer is the one place with no lineHeight, and the page sets none
  // either: react-pdf drops a fixed, absolutely placed page-number Text (and its
  // siblings) as soon as a lineHeight is set on it or on its page, which is why
  // the footer used to vanish. Every other text style carries lineHeight 1.5.
  footer: { position: "absolute", bottom: 14, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", paddingTop: 5, borderTopWidth: 0.6, borderTopColor: C.borderLight, fontSize: 6, color: C.muted },
  footerLeft: { flexGrow: 1, flexShrink: 1, textAlign: "left" },
  footerRight: { width: 80, flexShrink: 0, textAlign: "right" },

  // ── Matrix table ──
  matrixSection: { marginBottom: 4, marginTop: 1 },
  // The legend, printed under the table it explains.
  matrixGuideBlock: { marginTop: 1, marginBottom: 3, paddingLeft: 3 },
  matrixGuideTitle: { fontSize: 5.8, fontWeight: "bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 1, lineHeight: 1.5 },
  matrixGuideLine: { fontSize: 6, color: C.muted, marginBottom: 0.5, lineHeight: 1.5 },
  matrixTable: { borderWidth: 0.5, borderColor: C.border },
  matrixHeaderRow: { flexDirection: "row", backgroundColor: C.primary },
  // Banner row: one heading over a run of columns, divided from its neighbours
  // and set a shade apart from the column titles beneath it.
  matrixGroupRow: { flexDirection: "row", backgroundColor: C.primary, borderBottomWidth: 0.5, borderBottomColor: C.white },
  matrixGroupText: { fontSize: 5.8, fontWeight: "bold", color: C.white, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center", lineHeight: 1.5 },
  matrixHeaderCell: { paddingHorizontal: 4, paddingVertical: 2.5, borderRightWidth: 0.5, borderRightColor: C.white },
  matrixHeaderText: { fontSize: 5.8, fontWeight: "bold", color: C.white, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.5 },
  matrixDataRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.borderLight },
  matrixDataRowAlt: { backgroundColor: C.bgAlt },
  matrixDataCell: { paddingHorizontal: 4, paddingVertical: 2, borderRightWidth: 0.3, borderRightColor: C.borderLight },
  matrixDataText: { fontSize: 6.8, color: C.text, lineHeight: 1.5 },
  matrixFieldLabel: { fontSize: 6.4, fontWeight: "bold", color: C.primary, marginBottom: 2, lineHeight: 1.5 },
});
