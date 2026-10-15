/**
 * PaperFormView.tsx — A submission drawn on screen the way its paper form
 * prints: the same layout PaperFormDocument.tsx draws into the PDF, from the
 * same `PaperDocument`, so the screen and the printout never disagree.
 *
 * Used for the Training Evaluation Form (see utils/paperPdf/submissionPaperView.ts).
 */
import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import type { PaperBlock, PaperCell, PaperDocument, PaperHeader, PaperOption, PaperSection } from "../../utils/paperPdf/paperLayout";

const INK = "#111111";
const RULE = "#333333";
const BAND = "#DAEEF3";

const cellSx = { border: `1px solid ${RULE}`, px: 0.75, py: 0.5, verticalAlign: "middle", textAlign: "left", fontWeight: 400 } as const;
const tableSx = { borderCollapse: "collapse", width: "100%", tableLayout: "auto" } as const;
const valueSx = { fontWeight: 700 } as const;

export interface PaperFormViewProps {
  doc: PaperDocument;
  /** Only the first PART (the submitter's): the reviewer page shows Part II as its own form. */
  firstPartOnly?: boolean;
  logoUrl?: string;
  /** Draws a stored image (a signature), which may need a token to load. */
  renderImage?: (src: string, alt: string) => ReactNode;
}

function Box11({ checked }: { checked: boolean }) {
  return (
    <Box component="span" aria-hidden sx={{ display: "inline-flex", width: 12, height: 12, border: `1px solid ${RULE}`, alignItems: "center", justifyContent: "center", fontSize: 10, lineHeight: 1, mr: 0.5 }}>
      {checked ? "✓" : ""}
    </Box>
  );
}

function Options({ options, selected }: { options: PaperOption[]; selected: string[] }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", flexWrap: "wrap", columnGap: 1.75, rowGap: 0.25, alignItems: "center" }}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Box component="span" key={o.value} sx={{ display: "inline-flex", alignItems: "center", fontWeight: on ? 700 : 400 }}>
            <Box11 checked={on} />
            {o.label}
            <Box component="span" sx={visuallyHidden}>{on ? " (selected)" : ""}</Box>
          </Box>
        );
      })}
    </Box>
  );
}

const visuallyHidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } as const;

function CellValue({ cell }: { cell: PaperCell }) {
  if (cell.options) return <Options options={cell.options} selected={cell.selected ?? []} />;
  if (cell.lines) return <>{cell.lines.map((line) => <Box key={line} sx={valueSx}>{line}</Box>)}</>;
  return <Box component="span" sx={{ ...valueSx, whiteSpace: "pre-line" }}>{cell.text}</Box>;
}

function Header({ header, logoUrl, twoColumns }: { header: PaperHeader; logoUrl?: string; twoColumns: boolean }) {
  const half = Math.ceil(header.companies.length / 2);
  const companyRows = twoColumns
    ? Array.from({ length: half }, (_, i) => [header.companies[i], header.companies[i + half]])
    : header.companies.map((c) => [c]);
  const span = twoColumns ? 4 : 2;
  const control = header.control.filter((c) => c.value);
  return (
    <Box sx={{ mb: 2 }}>
      <Box component="table" sx={tableSx}>
        <tbody>
          <tr>
            <Box component="td" sx={{ ...cellSx, width: "20%", textAlign: "center", height: 52 }}>
              {logoUrl ? <Box component="img" src={logoUrl} alt="Company logo" sx={{ maxHeight: 40, maxWidth: 110, objectFit: "contain", verticalAlign: "middle" }} /> : null}
            </Box>
            <Box component="td" colSpan={span} sx={{ ...cellSx, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{header.organisation}</Box>
          </tr>
          <tr><Box component="td" sx={cellSx}>DOCUMENT TITLE</Box><Box component="td" colSpan={span} sx={{ ...cellSx, textAlign: "center" }}>{header.documentTitle}</Box></tr>
          <tr><Box component="td" sx={cellSx}>FORM TITLE</Box><Box component="td" colSpan={span} sx={{ ...cellSx, textAlign: "center", fontWeight: 700 }}>{header.formTitle}</Box></tr>
          {companyRows.map((row, i) => (
            <tr key={i}>
              {i === 0 ? <Box component="td" rowSpan={companyRows.length} sx={{ ...cellSx, verticalAlign: "top" }}>COMPANIES</Box> : null}
              {row.flatMap((company, j) => [
                <Box component="td" key={`n${j}`} sx={{ ...cellSx, fontWeight: company?.selected ? 700 : 400 }}>{company?.label ?? ""}</Box>,
                <Box component="td" key={`t${j}`} sx={{ ...cellSx, width: 24, px: 0, textAlign: "center" }} aria-label={company?.selected ? "selected" : undefined}>{company?.selected ? "✓" : ""}</Box>,
              ])}
            </tr>
          ))}
        </tbody>
      </Box>
      {control.length > 0 ? (
        <Box component="table" sx={{ ...tableSx, mt: "-1px" }}>
          <tbody>
            <tr>{control.map((c) => <Box component="td" key={c.label} sx={{ ...cellSx, textAlign: "center" }}>{c.label}<br /><b>{c.value}</b></Box>)}</tr>
          </tbody>
        </Box>
      ) : null}
      {header.trace ? <Typography sx={{ fontSize: 11, color: "#555", mt: 0.75 }}>{header.trace}</Typography> : null}
    </Box>
  );
}

const ARRANGED = ["20%", "30%", "17%", "33%"];

function Grid({ block }: { block: Extract<PaperBlock, { kind: "grid" }> }) {
  const rows = block.rows ?? pairUp(block.cells);
  return (
    <Box component="table" sx={{ ...tableSx, tableLayout: "fixed", mb: 1.5 }}>
      <colgroup>{ARRANGED.map((w) => <col key={w} style={{ width: w }} />)}</colgroup>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.length === 1 ? (
              <>
                <Box component="td" sx={{ ...cellSx, verticalAlign: row[0].wide ? "top" : "middle" }}>{row[0].label}</Box>
                <Box component="td" colSpan={3} sx={cellSx}><CellValue cell={row[0]} /></Box>
              </>
            ) : (
              row.flatMap((cell, j) => [
                <Box component="td" key={`${j}l`} sx={{ ...cellSx, verticalAlign: cell.lines ? "top" : "middle" }}>{cell.label}</Box>,
                <Box component="td" key={`${j}v`} sx={cellSx}><CellValue cell={cell} /></Box>,
              ])
            )}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function pairUp(cells: PaperCell[]): PaperCell[][] {
  const rows: PaperCell[][] = [];
  let current: PaperCell[] = [];
  for (const cell of cells) {
    if (cell.wide) {
      if (current.length) rows.push(current);
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
  if (current.length) rows.push(current);
  return rows;
}

function Ticks({ block }: { block: Extract<PaperBlock, { kind: "ticks" }> }) {
  const label = (o: PaperOption, i: number) => (block.numbered && !/^\d+$/.test(o.label.trim()) ? String(i + 1) : o.label);
  const colWidth = block.numbered ? 32 : 44;
  const head = { ...cellSx, backgroundColor: BAND, fontWeight: 700 };
  return (
    <Box sx={{ overflowX: "auto", mb: 1.5 }}>
      <Box component="table" sx={tableSx}>
        <thead>
          {block.banner ? (
            <tr>
              <Box component="th" sx={head}>Evaluation Item</Box>
              <Box component="th" colSpan={block.options.length} sx={{ ...head, textAlign: "center" }}>Rating (✓)</Box>
            </tr>
          ) : null}
          <tr>
            <Box component="th" sx={head}>{block.title}</Box>
            {block.options.map((o, i) => (
              <Box component="th" key={o.value} title={o.label} sx={{ ...head, width: colWidth, textAlign: "center", px: 0 }}>{label(o, i)}</Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.number}>
              <Box component="td" sx={{ ...cellSx, pl: 1 }}>
                <Box component="span" sx={{ display: "inline-block", minWidth: 22, textAlign: "right", mr: 1 }}>{row.number}.</Box>
                {row.label}
              </Box>
              {block.options.map((o) => {
                const on = row.selected.includes(o.value);
                return <Box component="td" key={o.value} aria-label={on ? o.label : undefined} sx={{ ...cellSx, textAlign: "center", px: 0 }}>{on ? "✓" : ""}</Box>;
              })}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

function Ruled({ text, lines }: { text: string; lines: number }) {
  const count = Math.max(lines, text ? text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 110)), 0) : 0);
  return (
    <Box sx={{ position: "relative", minHeight: count * 22, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 21px, ${RULE} 21px 22px)`, mb: 1.5 }}>
      <Box sx={{ ...valueSx, lineHeight: "22px", px: 0.25, whiteSpace: "pre-line" }}>{text}</Box>
    </Box>
  );
}

function Line({ label, children, wide = 230 }: { label: string; children: ReactNode; wide?: number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, mb: 1.25 }}>
      <Box sx={{ minWidth: 110 }}>{label}</Box>
      <Box sx={{ width: wide, maxWidth: "100%", borderBottom: `1px solid ${RULE}`, minHeight: 20, ...valueSx }}>{children}</Box>
    </Box>
  );
}

function Block({ block, renderImage }: { block: PaperBlock; renderImage: (src: string, alt: string) => ReactNode }) {
  switch (block.kind) {
    case "grid":
      return <Grid block={block} />;
    case "ticks":
      return <Ticks block={block} />;
    case "choiceLine":
      return (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.75, mb: 1.5 }}>
          <span>{block.label}:</span>
          <Options options={block.options} selected={block.selected} />
        </Box>
      );
    case "long":
      return (
        <Box>
          <Box>{block.sublabel || /:$/.test(block.label) ? block.label : `${block.label}:`}</Box>
          {block.sublabel ? <Box>{block.sublabel}</Box> : null}
          <Ruled text={block.text} lines={block.lines} />
        </Box>
      );
    case "signature":
      return (
        <Box sx={{ mt: 1, mb: 1.5 }}>
          <Line label={`${block.label}:`}>
            {block.images[0] ? <Box sx={{ height: block.large ? 80 : 44, display: "flex", alignItems: "flex-end" }}>{renderImage(block.images[0], block.label)}</Box> : null}
          </Line>
          <Line label="Date:">{block.date}</Line>
        </Box>
      );
    case "images":
      return (
        <Box sx={{ mb: 1.5 }}>
          <Box>{block.label}:</Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>{block.images.map((src) => <Box key={src} sx={{ width: 140, height: 100 }}>{renderImage(src, block.label)}</Box>)}</Box>
        </Box>
      );
    case "table": {
      const columns = block.field.matrixColumns ?? [];
      const rows = block.field.matrixRows ?? [];
      return (
        <Box sx={{ mb: 1.5, overflowX: "auto" }}>
          <Box>{block.field.label}</Box>
          <Box component="table" sx={tableSx}>
            <thead><tr>{columns.map((c) => <Box component="th" key={c.name} sx={{ ...cellSx, backgroundColor: BAND, fontWeight: 700 }}>{c.title || c.name}</Box>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{columns.map((c) => <Box component="td" key={c.name} sx={cellSx}>{String(row[c.name] ?? "")}</Box>)}</tr>)}</tbody>
          </Box>
        </Box>
      );
    }
    case "note":
      return <Box sx={{ mb: 1, whiteSpace: "pre-line" }}>{block.text}</Box>;
    case "signoff":
      return (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ mb: 1.5, color: block.rejected ? "#b3261e" : INK }}>{block.statement}</Box>
          {block.remarks ? <Box sx={{ mb: 1 }}>Remarks: {block.remarks}</Box> : null}
          <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 4 }}>
            <Box>
              <Line label="Name:">{block.name}</Line>
              <Line label="Position:">{block.position}</Line>
            </Box>
            <Box>
              <Line label="Signature:">{block.signature ? <Box sx={{ height: block.large ? 80 : 40, display: "flex", alignItems: "flex-end" }}>{renderImage(block.signature, "Signature")}</Box> : null}</Line>
              <Line label="Date:">{block.date}</Line>
            </Box>
          </Box>
        </Box>
      );
    default:
      return null;
  }
}

function Section({ section, renderImage }: { section: PaperSection; renderImage: (src: string, alt: string) => ReactNode }) {
  return (
    <Box component="section" sx={{ mt: section.level === 1 ? 2.5 : 1.5 }}>
      {section.heading ? (
        <Typography component={section.level === 1 ? "h3" : "h4"} sx={{ fontWeight: 700, fontSize: section.level === 1 ? 14 : 13, mb: 1, color: INK }}>
          {section.heading}
        </Typography>
      ) : null}
      {section.blocks.map((block, i) => <Block key={i} block={block} renderImage={renderImage} />)}
    </Box>
  );
}

const defaultImage = (src: string, alt: string) => (
  <Box component="img" src={src} alt={alt} sx={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
);

export default function PaperFormView({ doc, firstPartOnly = false, logoUrl, renderImage = defaultImage }: PaperFormViewProps) {
  const firstBreak = doc.sections.findIndex((s, i) => i > 0 && s.level === 1);
  const sections = firstPartOnly && firstBreak > 0 ? doc.sections.slice(0, firstBreak) : doc.sections;
  return (
    <Box
      sx={{
        backgroundColor: "#ffffff",
        color: INK,
        border: `1px solid ${RULE}`,
        borderRadius: "4px",
        p: { xs: 1.5, sm: 3 },
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: 13,
        lineHeight: 1.35,
        overflowX: "auto",
        "& table": { minWidth: 560 },
      }}
    >
      <Header header={doc.header} logoUrl={logoUrl} twoColumns={doc.variant === "training-evaluation"} />
      {sections.map((section, i) => (
        <Box key={i}>
          {section.newPage ? <Box aria-hidden sx={{ borderTop: "2px dashed #9aa4ae", my: 3 }} /> : null}
          <Section section={section} renderImage={renderImage} />
        </Box>
      ))}
    </Box>
  );
}
