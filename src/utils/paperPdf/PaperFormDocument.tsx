/**
 * PaperFormDocument.tsx — The experimental "paper form" PDF design: the
 * submission printed the way HR's own Word forms look (ISO header table,
 * label/value grid, rating tables with a tick per row, ruled comment lines,
 * Name / Signature / Position / Date sign-offs), with the answers filled in.
 *
 * Chosen per form with `pdfConfig.design = "paper"`; the standard design in
 * FormPdfDocument.tsx stays the default. Layout decisions live in
 * paperLayout.ts — this file only draws them.
 */
import type { ReactElement } from "react";
import { Document, Page, View, Text, Image, Svg, Polyline, StyleSheet } from "@react-pdf/renderer";
import { buildPdfSectionContext } from "../pdfSections/context";
import { fmtDate, fmtDay } from "../pdfSections/helpers";
import { formatPdfDateTimeValue, formatPdfFieldValue } from "../pdfFieldFormatting";
import type { PdfFormData } from "../FormPdfDocument";
import { buildPaperDocument, type PaperBlock, type PaperCell, type PaperHeader, type PaperOption, type PaperSection, type RosterCell, type SignoffColumn } from "./paperLayout";

const INK = "#000000";
const RULE = "#000000";
const BAND = "#DAEEF3"; // the Word form's pale-blue table header fill
const MUTED = "#555555";
const LINE_GAP = 15;

const P = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 36, paddingBottom: 44, fontFamily: "Helvetica", fontSize: 8.6, color: INK, lineHeight: 1.25 },
  bold: { fontFamily: "Helvetica-Bold" },

  table: { borderTopWidth: 0.7, borderLeftWidth: 0.7, borderColor: RULE },
  row: { flexDirection: "row" },
  tableEdge: { borderLeftWidth: 0.7, borderColor: RULE },
  tableTop: { borderTopWidth: 0.7 },
  cell: { borderRightWidth: 0.7, borderBottomWidth: 0.7, borderColor: RULE, paddingVertical: 2.6, paddingHorizontal: 4, justifyContent: "center" },
  center: { textAlign: "center" },

  // The label column is one fifth wide, so its line meets the line after "Document Number:" below.
  logoCell: { width: "20%", alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  logo: { maxHeight: 30, maxWidth: 100, objectFit: "contain" },
  orgCell: { width: "80%", alignItems: "center", justifyContent: "center", minHeight: 36 },
  orgText: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  headLabel: { width: "20%" },
  headValue: { width: "80%" },
  companyName: { width: "78%" },
  companyTick: { width: "22%", alignItems: "center" },
  controlCell: { width: "20%", alignItems: "center", minHeight: 30, justifyContent: "flex-start" },
  controlValue: { fontFamily: "Helvetica-Bold", marginTop: 2, textAlign: "center" },
  trace: { fontSize: 6.8, color: MUTED, marginTop: 4 },

  partHeading: { fontFamily: "Helvetica-Bold", fontSize: 9.2, marginTop: 14, marginBottom: 6 },
  panelHeading: { fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 4 },
  block: { marginBottom: 8 },
  note: { marginBottom: 6 },

  gridLabel: { width: "18%" },
  gridValue: { width: "32%" },
  gridWideValue: { width: "82%" },
  value: { fontFamily: "Helvetica-Bold" },

  tickItem: { flexGrow: 1, flexShrink: 1, flexBasis: 0, flexDirection: "row", justifyContent: "flex-start" },
  tickNumber: { width: 18, textAlign: "right", marginRight: 6 },
  tickHeadBand: { backgroundColor: BAND },

  inlineOptions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  inlineOption: { flexDirection: "row", alignItems: "center", marginRight: 12, marginVertical: 1 },
  box: { width: 8, height: 8, borderWidth: 0.7, borderColor: INK, marginRight: 3, alignItems: "center", justifyContent: "center" },

  choiceLine: { flexDirection: "row", alignItems: "center", marginBottom: 8, flexWrap: "wrap" },
  choiceLabel: { marginRight: 14 },

  longLabel: { marginBottom: 2 },
  longSublabel: { marginBottom: 2 },
  longBody: { position: "relative" },
  longRule: { position: "absolute", left: 0, right: 0, borderBottomWidth: 0.6, borderColor: INK },
  longText: { fontFamily: "Helvetica-Bold", lineHeight: LINE_GAP / 8.6, paddingHorizontal: 2 },

  lineRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 10 },
  lineLabel: { width: 92 },
  lineSlot: { width: 170, borderBottomWidth: 0.6, borderColor: INK, minHeight: 14, justifyContent: "flex-end", paddingHorizontal: 2, paddingBottom: 1 },
  lineGap: { width: 26 },
  sigImage: { height: 34, maxWidth: 160, objectFit: "contain" },
  sigImageLarge: { height: 52, maxWidth: 130, objectFit: "contain" },

  statement: { fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 10 },
  rejected: { color: "#b3261e" },
  remarks: { marginBottom: 8 },

  thumbs: { flexDirection: "row", flexWrap: "wrap", marginTop: 3 },
  thumb: { width: 110, height: 80, objectFit: "contain", marginRight: 6, marginBottom: 6, borderWidth: 0.5, borderColor: "#999999" },

  // "On behalf of …" over a stand-in's signature: absolute, so it takes no
  // height and the page keeps every line where the Word form has it.
  onBehalf: { position: "absolute", top: 1, left: 2, right: 2, fontSize: 6.2, color: MUTED, maxLines: 1, textOverflow: "ellipsis" },

  footer: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

// ── Primitives ──────────────────────────────────────────────────────────────

function Tick({ size = 8 }: { size?: number }): ReactElement {
  return (
    <Svg width={size} height={size} style={{ width: size, height: size }} viewBox="0 0 10 10">
      <Polyline points="1.5,5.4 4,8 8.6,2" stroke={INK} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function Box({ checked }: { checked: boolean }): ReactElement {
  return <View style={P.box}>{checked ? <Tick size={7} /> : null}</View>;
}

function InlineOptions({ options, selected }: { options: PaperOption[]; selected: string[] }): ReactElement {
  return (
    <View style={P.inlineOptions}>
      {options.map((o) => (
        <View key={o.value} style={P.inlineOption}>
          <Box checked={selected.includes(o.value)} />
          <Text style={selected.includes(o.value) ? P.bold : {}}>{o.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Text written on a ruled line: the line stays even when there is nothing on it. */
function LineSlot({ value, image, width, large }: { value?: string; image?: string; width?: number; large?: boolean }): ReactElement {
  return (
    <View style={[P.lineSlot, width ? { width } : {}]}>
      {image ? <Image style={large ? P.sigImageLarge : P.sigImage} src={image} /> : <Text style={P.value}>{value || " "}</Text>}
    </View>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

/** The companies in two columns, each name with a narrow tick cell beside it. */
function CompanyColumns({ companies }: { companies: PaperHeader["companies"] }): ReactElement {
  const half = Math.ceil(companies.length / 2);
  const columns = [companies.slice(0, half), companies.slice(half)];
  return (
    <View style={[P.headValue, P.row]}>
      {columns.map((column, c) => (
        <View key={c} style={{ width: "50%" }}>
          {Array.from({ length: half }).map((_, i) => {
            const company = column[i];
            return (
              <View key={i} style={P.row}>
                <View style={[P.cell, { flexGrow: 1, flexBasis: 0 }]}><Text style={company?.selected ? P.bold : {}}>{company?.label ?? " "}</Text></View>
                <View style={[P.cell, { width: 18, alignItems: "center" }]}>{company?.selected ? <Tick size={8} /> : <Text> </Text>}</View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Every paper form lists its companies in two columns, as the Word forms do.
function HeaderTable({ header, logo, twoColumnCompanies = true }: { header: PaperHeader; logo?: string; twoColumnCompanies?: boolean }): ReactElement {
  return (
    <View>
      <View style={P.table}>
        <View style={P.row}>
          <View style={[P.cell, P.logoCell]}>{logo ? <Image style={P.logo} src={logo} /> : <Text> </Text>}</View>
          <View style={[P.cell, P.orgCell]}><Text style={P.orgText}>{header.organisation}</Text></View>
        </View>
        <View style={P.row}>
          <View style={[P.cell, P.headLabel]}><Text>DOCUMENT TITLE</Text></View>
          <View style={[P.cell, P.headValue]}><Text style={P.center}>{header.documentTitle || " "}</Text></View>
        </View>
        <View style={P.row}>
          <View style={[P.cell, P.headLabel]}><Text>FORM TITLE</Text></View>
          <View style={[P.cell, P.headValue]}><Text style={[P.center, P.bold]}>{header.formTitle}</Text></View>
        </View>
        {header.companies.length > 0 ? (
          <View style={P.row}>
            <View style={[P.cell, P.headLabel, { justifyContent: "flex-start" }]}><Text>COMPANIES</Text></View>
            {twoColumnCompanies ? <CompanyColumns companies={header.companies} /> : (
            <View style={P.headValue}>
              {header.companies.map((company) => (
                <View key={company.label} style={P.row}>
                  <View style={[P.cell, P.companyName]}><Text style={company.selected ? P.bold : {}}>{company.label}</Text></View>
                  <View style={[P.cell, P.companyTick]}>{company.selected ? <Tick size={8} /> : <Text> </Text>}</View>
                </View>
              ))}
            </View>
            )}
          </View>
        ) : null}
        <View style={P.row}>
          {header.control.map((c) => (
            <View key={c.label} style={[P.cell, P.controlCell]}>
              <Text style={P.center}>{c.label}</Text>
              <Text style={P.controlValue}>{c.value || " "}</Text>
            </View>
          ))}
        </View>
      </View>
      {header.trace ? <Text style={P.trace}>{header.trace}</Text> : null}
    </View>
  );
}

// ── Blocks ──────────────────────────────────────────────────────────────────

function CellValue({ cell }: { cell: PaperCell }): ReactElement {
  if (cell.options) return <InlineOptions options={cell.options} selected={cell.selected ?? []} />;
  if (cell.lines) return <View>{cell.lines.map((line, i) => <Text key={i} style={P.value}>{line}</Text>)}</View>;
  return <Text style={P.value}>{cell.text || " "}</Text>;
}

// The Training Evaluation employee table's column widths: label, answer, label, answer.
const ARRANGED_WIDTHS = ["20%", "30%", "17%", "33%"];

/** A grid whose rows were arranged by the layout: a lone cell spans the table. */
function ArrangedGrid({ rows }: { rows: PaperCell[][] }): ReactElement {
  return (
    <View style={[P.table, P.block]}>
      {rows.map((row, i) => (
        <View key={i} style={P.row} wrap={false}>
          {row.length === 1 ? (
            <>
              <View style={[P.cell, { width: ARRANGED_WIDTHS[0], justifyContent: row[0].wide ? "flex-start" : "center" }]}><Text>{row[0].label}</Text></View>
              <View style={[P.cell, { width: "80%" }]}><CellValue cell={row[0]} /></View>
            </>
          ) : (
            row.flatMap((cell, j) => [
              <View key={`${j}l`} style={[P.cell, { width: ARRANGED_WIDTHS[j * 2], justifyContent: cell.lines ? "flex-start" : "center" }]}><Text>{cell.label}</Text></View>,
              <View key={`${j}v`} style={[P.cell, { width: ARRANGED_WIDTHS[j * 2 + 1] }]}><CellValue cell={cell} /></View>,
            ])
          )}
        </View>
      ))}
    </View>
  );
}

function Grid({ cells }: { cells: PaperCell[] }): ReactElement {
  // Two pairs to a row; a wide answer takes a row to itself.
  const rows: PaperCell[][] = [];
  let current: PaperCell[] = [];
  for (const cell of cells) {
    if (cell.wide) {
      if (current.length > 0) rows.push(current);
      rows.push([cell]);
      current = [];
      continue;
    }
    current.push(cell);
    if (current.length === 2) {
      rows.push(current);
      current = [];
    }
  }
  if (current.length > 0) rows.push(current);
  return (
    <View style={[P.table, P.block]}>
      {rows.map((row, i) => (
        <View key={i} style={P.row} wrap={false}>
          {row.length === 1 && (row[0].wide || rows.length === 1 || cells.length === 1) ? (
            <>
              <View style={[P.cell, P.gridLabel]}><Text>{row[0].label}</Text></View>
              <View style={[P.cell, P.gridWideValue]}><CellValue cell={row[0]} /></View>
            </>
          ) : (
            [0, 1].map((j) => {
              const cell = row[j];
              return (
                <View key={j} style={{ flexDirection: "row", width: "50%" }}>
                  <View style={[P.cell, { width: "36%" }]}><Text>{cell?.label ?? " "}</Text></View>
                  <View style={[P.cell, { width: "64%" }]}>{cell ? <CellValue cell={cell} /> : <Text> </Text>}</View>
                </View>
              );
            })
          )}
        </View>
      ))}
    </View>
  );
}

function tickColumnWidth(options: PaperOption[], numbered?: boolean): number {
  if (numbered) return 23;
  const longest = options.reduce((max, o) => Math.max(max, o.label.length), 0);
  const width = Math.max(30, longest * 4.6 + 10);
  // Never let the scale squeeze the statements below about 45% of the row.
  return Math.min(width, 280 / options.length);
}

// Rows are returned flat, to sit directly on the page: react-pdf only honours
// `minPresenceAhead` between page-level siblings, and the header row needs it
// to avoid being stranded at the foot of a page without its first row.
function tickTableRows(block: Extract<PaperBlock, { kind: "ticks" }>, key: string): ReactElement[] {
  const width = tickColumnWidth(block.options, block.numbered);
  // A numbered table heads its columns 1..n; the legend above it says what each means.
  const columnLabel = (o: PaperOption, i: number) => (block.numbered && !/^\d+$/.test(o.label.trim()) ? String(i + 1) : o.label);
  const banner = block.banner ? (
    <View key={`${key}-banner`} style={[P.row, P.tableEdge, P.tableTop, P.tickHeadBand]} wrap={false} minPresenceAhead={40}>
      <View style={[P.cell, P.tickItem]}><Text style={P.bold}>Evaluation Item</Text></View>
      <View style={[P.cell, { width: width * block.options.length, alignItems: "center" }]}>
        {/* Helvetica has no ✓, so the tick is drawn. */}
        <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={P.bold}>Rating (</Text><Tick size={8} /><Text style={P.bold}>)</Text></View>
      </View>
    </View>
  ) : null;
  const header = (
    <View key={`${key}-head`} style={[P.row, P.tableEdge, banner ? {} : P.tableTop, P.tickHeadBand]} wrap={false} minPresenceAhead={24}>
      <View style={[P.cell, P.tickItem]}><Text style={P.bold}>{block.title}</Text></View>
      {block.options.map((o, i) => (
        <View key={o.value} style={[P.cell, { width, alignItems: "center" }]}><Text style={[P.bold, P.center]}>{columnLabel(o, i)}</Text></View>
      ))}
    </View>
  );
  const rows = block.rows.map((row, i) => (
    <View key={`${key}-${row.number}`} style={[P.row, P.tableEdge, i === block.rows.length - 1 ? P.block : {}]} wrap={false}>
      <View style={[P.cell, P.tickItem]}>
        <Text style={P.tickNumber}>{row.number}.</Text>
        <Text style={{ flex: 1 }}>{row.label}</Text>
      </View>
      {block.options.map((o) => (
        <View key={o.value} style={[P.cell, { width, alignItems: "center" }]}>
          {row.selected.includes(o.value) ? <Tick size={9} /> : <Text> </Text>}
        </View>
      ))}
    </View>
  ));
  return banner ? [banner, header, ...rows] : [header, ...rows];
}

function LongText({ block }: { block: Extract<PaperBlock, { kind: "long" }> }): ReactElement {
  // Roughly how many printed lines the answer needs, so the ruling runs under all of it.
  const estimated = block.text
    ? block.text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 115)), 0)
    : 0;
  const lines = Math.max(block.lines, estimated);
  return (
    <View style={P.block}>
      <Text style={block.sublabel ? P.longSublabel : P.longLabel} minPresenceAhead={LINE_GAP * 2}>{block.sublabel || /:$/.test(block.label) ? block.label : `${block.label}:`}</Text>
      {block.sublabel ? <Text style={P.longLabel}>{block.sublabel}</Text> : null}
      <View style={[P.longBody, { height: lines * LINE_GAP + 2 }]}>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={[P.longRule, { top: (i + 1) * LINE_GAP }]} />
        ))}
        <Text style={[P.longText, { paddingTop: 3 }]}>{block.text}</Text>
      </View>
    </View>
  );
}

function Table({ block }: { block: Extract<PaperBlock, { kind: "table" }> }): ReactElement {
  const columns = block.field.matrixColumns ?? [];
  const rows = block.field.matrixRows ?? [];
  const width = `${100 / Math.max(1, columns.length)}%`;
  const body: (Record<string, unknown> | null)[] = rows.length > 0 ? rows : [null, null];
  return (
    <View style={P.block}>
      <Text style={P.longLabel} minPresenceAhead={40}>{block.field.label}</Text>
      <View style={P.table}>
        <View style={[P.row, P.tickHeadBand]} wrap={false}>
          {columns.map((c) => <View key={c.name} style={[P.cell, { width }]}><Text style={P.bold}>{c.title || c.name}</Text></View>)}
        </View>
        {body.map((row, i) => (
          <View key={i} style={P.row} wrap={false}>
            {columns.map((c) => (
              <View key={c.name} style={[P.cell, { width, minHeight: 15 }]}>
                <Text>{row ? formatPdfFieldValue(row[c.name], { type: c.cellType, inputType: c.cellType, choices: c.choices }).replace(/^—$/, "") : " "}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A label that may carry a ✓, which Helvetica cannot print: the tick is drawn instead. */
function TickLabel({ text, width }: { text: string; width: number }): ReactElement {
  if (!text.includes("✓")) return <Text style={{ width }}>{text}</Text>;
  const [before, after] = text.split("✓", 2);
  return (
    <View style={{ width, flexDirection: "row", alignItems: "center" }}>
      <Text>{before}</Text><Tick size={8} /><Text>{after}</Text>
    </View>
  );
}

/** "Label : answer" on ruled lines, as the top of the Training Attendance Form. */
function Lines({ block }: { block: Extract<PaperBlock, { kind: "lines" }> }): ReactElement {
  return (
    <View style={P.block}>
      {block.items.map((item, i) => (
        <View key={i} style={[P.lineRow, { marginBottom: 7 }]} wrap={false}>
          <TickLabel text={item.label} width={96} />
          <Text style={{ width: 10 }}>:</Text>
          {item.options ? (
            <View style={{ flexGrow: 1, flexBasis: 0 }}><InlineOptions options={item.options} selected={item.selected ?? []} /></View>
          ) : (
            <View style={[P.lineSlot, { flexGrow: 1, flexBasis: 0, width: "auto" }]}>
              {item.image ? <Image style={P.sigImage} src={item.image} /> : <CellValue cell={item} />}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** "Label | : | answer" rows with the answer on a line, as the Training Requisition Form. */
function ColonTable({ block }: { block: Extract<PaperBlock, { kind: "colonTable" }> }): ReactElement {
  // A label beside an answer of several lines sits at its top; otherwise label,
  // colon and answer share the line the answer is written on.
  const atTop = (cell: PaperCell) => Boolean(cell.lines) || cell.text.length > 110 || cell.text.includes("\n");
  const label = (cell: PaperCell, width: string) => (
    <View style={[{ width, paddingTop: 3, paddingBottom: 2, paddingHorizontal: 4, justifyContent: atTop(cell) ? "flex-start" : "flex-end" }, block.shaded ? { backgroundColor: BAND } : {}]}>
      <Text>{cell.label}</Text>
    </View>
  );
  const value = (cell: PaperCell, width: string) => (
    <View style={{ width, flexDirection: "row", alignItems: "flex-end", borderBottomWidth: cell.options ? 0 : 0.6, borderColor: INK, paddingHorizontal: 3, paddingTop: 3, paddingBottom: 2, minHeight: 15 }}>
      {cell.prefix ? <Text style={{ marginRight: 4 }}>{cell.prefix}</Text> : null}
      <View style={{ flexGrow: 1, flexBasis: 0 }}><CellValue cell={cell} /></View>
    </View>
  );
  return (
    <View style={P.block}>
      {block.rows.map((row, i) => (
        <View key={i} style={[P.row, { marginBottom: 3, alignItems: "stretch" }]} wrap={false}>
          {row.flatMap((cell, j) => [
            <View key={`${j}l`} style={{ width: j === 0 ? "24%" : "16%" }}>{label(cell, "100%")}</View>,
            <View key={`${j}c`} style={{ width: 10, paddingTop: 3, paddingBottom: 2, justifyContent: atTop(cell) ? "flex-start" : "flex-end" }}><Text>:</Text></View>,
            <View key={`${j}v`} style={{ flexGrow: 1, flexBasis: 0, marginRight: j === 0 && row.length > 1 ? 10 : 0 }}>{value(cell, "100%")}</View>,
          ])}
        </View>
      ))}
    </View>
  );
}

function RosterValue({ cell }: { cell: RosterCell }): ReactElement {
  if (cell.image) return <Image style={{ height: 24, maxWidth: 70, objectFit: "contain" }} src={cell.image} />;
  if (cell.options) {
    // Stacked, one box per line, as each cell of the Word form's table lists them.
    return (
      <View>
        {cell.options.map((o) => (
          <View key={o.value} style={[P.inlineOption, { marginRight: 0 }]}>
            <Box checked={(cell.selected ?? []).includes(o.value)} />
            <Text style={(cell.selected ?? []).includes(o.value) ? P.bold : {}}>{o.label}</Text>
          </View>
        ))}
      </View>
    );
  }
  return <Text style={P.value}>{cell.text || " "}</Text>;
}

/** A ruled table with a row per person or item: the attendance register, the needs table. */
function rosterRows(block: Extract<PaperBlock, { kind: "roster" }>, key: string): ReactElement[] {
  const width = (i: number) => `${block.widths[i] ?? 100 / block.columns.length}%`;
  const head = (
    <View key={`${key}-head`} style={[P.row, P.tableEdge, P.tableTop, P.tickHeadBand]} wrap={false} minPresenceAhead={30}>
      {block.columns.map((label, i) => (
        <View key={i} style={[P.cell, { width: width(i), alignItems: "center" }]}><Text style={[P.bold, P.center]}>{label}</Text></View>
      ))}
    </View>
  );
  const rows = block.rows.map((row, r) => (
    <View key={`${key}-${r}`} style={[P.row, P.tableEdge, r === block.rows.length - 1 ? P.block : {}]} wrap={false}>
      {row.map((cell, i) => (
        <View key={i} style={[P.cell, { width: width(i), minHeight: 20 }, i === 0 && /^\d+$/.test(cell.text ?? "") ? { alignItems: "center" } : {}]}>
          <RosterValue cell={cell} />
        </View>
      ))}
    </View>
  ));
  return [head, ...rows];
}

/** Signatories side by side, each with a signature line, role, name and date. */
function SignoffRow({ block }: { block: Extract<PaperBlock, { kind: "signoffRow" }> }): ReactElement {
  const rejected = block.columns.filter((c) => c.rejected && c.remarks);
  const field = (label: string, value: string) => (
    <View style={[P.row, { alignItems: "flex-end", marginTop: 5 }]}>
      <Text style={{ width: 52 }}>{label}</Text>
      <View style={[P.lineSlot, { flexGrow: 1, flexBasis: 0, width: "auto" }]}><Text style={P.value}>{value || " "}</Text></View>
    </View>
  );
  const column = (c: SignoffColumn, i: number) => (
    <View key={i} style={{ flexGrow: 1, flexBasis: 0, paddingHorizontal: 6, paddingVertical: 6 }}>
      <Text style={[P.bold, c.rejected ? P.rejected : {}]}>{c.caption}{c.rejected ? " (Rejected)" : ""}</Text>
      <View style={[P.lineSlot, { width: "100%", minHeight: 40, marginTop: 4, position: "relative" }]}>
        {c.signature ? <Image style={P.sigImage} src={c.signature} /> : <Text> </Text>}
        {c.onBehalfOf ? <Text style={P.onBehalf}>{c.onBehalfOf}</Text> : null}
      </View>
      {c.role ? <Text style={{ marginTop: 2 }}>{c.role}</Text> : null}
      {field("Name:", c.name)}
      {c.positionLabel ? field(`${c.positionLabel}:`, c.position) : null}
      {field("Date:", c.date)}
    </View>
  );
  return (
    <View wrap={false} style={[P.block, { marginTop: 10 }]}>
      <View style={[P.row, block.boxed ? { borderWidth: 0.7, borderColor: RULE } : {}]}>{block.columns.map(column)}</View>
      {rejected.map((c, i) => <Text key={i} style={[P.remarks, P.rejected, { marginTop: 4 }]}>{c.caption.replace(/:$/, "")} {c.role} — Remarks: {c.remarks}</Text>)}
    </View>
  );
}

function SignOff({ block }: { block: Extract<PaperBlock, { kind: "signoff" }> }): ReactElement {
  return (
    <View wrap={false} style={{ marginTop: 6 }}>
      <Text style={[P.statement, block.rejected ? P.rejected : {}]}>{block.statement}</Text>
      {block.remarks ? <Text style={P.remarks}>Remarks: {block.remarks}</Text> : null}
      <View style={P.lineRow}>
        <Text style={{ width: 52 }}>Name:</Text>
        <LineSlot value={block.name} />
        <View style={P.lineGap} />
        <Text style={{ width: 56 }}>Signature:</Text>
        {/* The note sits inside the slot's own height, so no line moves. */}
        <View style={{ position: "relative" }}>
          <LineSlot image={block.signature} large={block.large} />
          {block.onBehalfOf ? <Text style={P.onBehalf}>{block.onBehalfOf}</Text> : null}
        </View>
      </View>
      <View style={P.lineRow}>
        <Text style={{ width: 52 }}>Position:</Text>
        <LineSlot value={block.position} />
        <View style={P.lineGap} />
        <Text style={{ width: 56 }}>Date:</Text>
        <LineSlot value={block.date} />
      </View>
    </View>
  );
}

function Block({ block }: { block: PaperBlock }): ReactElement | null {
  switch (block.kind) {
    case "grid":
      return block.rows ? <ArrangedGrid rows={block.rows} /> : <Grid cells={block.cells} />;
    case "ticks":
      return <>{tickTableRows(block, "ticks")}</>;
    case "choiceLine":
      return (
        <View style={P.choiceLine} wrap={false}>
          <Text style={P.choiceLabel}>{block.label}:</Text>
          <InlineOptions options={block.options} selected={block.selected} />
        </View>
      );
    case "long":
      return <LongText block={block} />;
    case "signature":
      return (
        <View wrap={false} style={{ marginTop: 4 }}>
          <View style={P.lineRow}>
            <Text style={P.lineLabel}>{block.label}:</Text>
            <LineSlot image={block.images[0]} large={block.large} />
          </View>
          <View style={P.lineRow}>
            <Text style={P.lineLabel}>Date:</Text>
            <LineSlot value={block.date} />
          </View>
        </View>
      );
    case "images":
      return (
        <View style={P.block} wrap={false}>
          <Text>{block.label}:</Text>
          <View style={P.thumbs}>
            {block.images.map((src, i) => <Image key={i} style={P.thumb} src={src} />)}
          </View>
        </View>
      );
    case "table":
      return <Table block={block} />;
    case "note":
      return <Text style={P.note}>{block.text}</Text>;
    case "signoff":
      return <SignOff block={block} />;
    case "lines":
      return <Lines block={block} />;
    case "colonTable":
      return <ColonTable block={block} />;
    case "roster":
      return <>{rosterRows(block, "roster")}</>;
    case "signoffRow":
      return <SignoffRow block={block} />;
    default:
      return null;
  }
}

/** A section as page-level elements (see tickTableRows for why they are flat). */
function sectionElements(section: PaperSection, index: number): ReactElement[] {
  const out: ReactElement[] = [];
  if (section.heading) {
    out.push(
      <Text key={`s${index}-h`} break={section.newPage} style={[section.level === 1 ? P.partHeading : P.panelHeading, section.newPage ? { marginTop: 0 } : {}]} minPresenceAhead={50}>
        {section.heading}
      </Text>,
    );
  }
  section.blocks.forEach((block, i) => {
    if (block.kind === "ticks") out.push(...tickTableRows(block, `s${index}-b${i}`));
    else if (block.kind === "roster") out.push(...rosterRows(block, `s${index}-b${i}`));
    else out.push(<Block key={`s${index}-b${i}`} block={block} />);
  });
  return out;
}

// ── Document ────────────────────────────────────────────────────────────────

/**
 * The PMW logo the app itself serves, for a paper form whose own settings name
 * none: every Word form carries it in the header's first cell, so a paper copy
 * without it reads as incomplete. Only in a browser, where the app's address
 * is known; elsewhere the cell stays empty as before.
 */
export function defaultPaperLogo(): string | undefined {
  return typeof window !== "undefined" && window.location?.origin ? `${window.location.origin}/logo.png` : undefined;
}

function renderPageNumber({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return `Page ${pageNumber} of ${totalPages}`;
}

function controlCells(data: PdfFormData): { label: string; value: string }[] {
  const h = data.documentHeader;
  const day = (value: string | undefined) => {
    const raw = (value ?? "").trim();
    const formatted = raw ? formatPdfDateTimeValue(raw, false) : "";
    return formatted === "—" ? "" : formatted;
  };
  return [
    { label: "Document Number:", value: (h?.documentNumber ?? "").trim() },
    { label: "Issue Number:", value: (h?.issueNumber ?? "").trim() },
    { label: "Effective Date:", value: day(h?.effectiveDate) },
    { label: "Revision Number:", value: (h?.revisionNumber ?? "").trim() || data.meta.formVersion },
    { label: "Revision Date:", value: day(h?.revisionDate) },
  ];
}

export default function PaperFormDocument(data: PdfFormData) {
  const ctx = buildPdfSectionContext(data);
  const paper = buildPaperDocument(data, {
    fmtDay,
    fmtDateTime: fmtDate,
    control: controlCells(data),
    title: ctx.title,
  });
  const footerNote = ctx.layoutConfig?.footerText?.trim() || `Generated ${fmtDate(new Date().toISOString())}`;
  return (
    <Document>
      <Page size="A4" style={P.page}>
        <HeaderTable header={paper.header} logo={ctx.effectiveLogoUrl || defaultPaperLogo()} />
        {paper.sections.flatMap(sectionElements)}
        <View style={P.footer} fixed>
          <Text>{footerNote}</Text>
          <Text render={renderPageNumber} />
        </View>
      </Page>
    </Document>
  );
}
