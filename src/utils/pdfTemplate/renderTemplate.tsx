/**
 * renderTemplate.tsx — Draws a block template with @react-pdf primitives.
 *
 * A smart block delegates to the very component the built-in layout uses, which
 * is what lets the default template be identical to the built-in document
 * rather than a careful imitation of it.
 */
import type { ReactElement } from "react";
import { cloneElement } from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import {
  HeaderSection, DocumentControlSection, StatusBadgeSection, SubmissionMetaSection,
  AnswersSection, ApprovalsSection, SignaturesSection, EvaluationDetailsSection, IsoStandardsSection,
} from "../pdfSections/sections";
import type { PdfSectionContext } from "../pdfSections/context";
import { C } from "../pdfSections/styles";
import type { BlockStyle, PdfBlock, PdfTemplate, RichSpan, SmartBlockType, TableBlock, TextBlock } from "./types";
import { resolveSpan } from "./resolve";

const SMART: Record<SmartBlockType, (props: { ctx: PdfSectionContext }) => ReactElement | null> = {
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

function spanStyle(span: RichSpan): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (span.bold) out.fontWeight = "bold";
  if (span.italic) out.fontStyle = "italic";
  if (span.underline) out.textDecoration = "underline";
  if (span.fontSize !== undefined) out.fontSize = span.fontSize;
  if (span.color) out.color = span.color;
  return out;
}

function TableBlockView({ block, ctx }: { block: TableBlock; ctx: PdfSectionContext }): ReactElement {
  const widths = block.widths.length ? block.widths : block.rows[0]?.map(() => 100 / (block.rows[0]?.length || 1)) ?? [];
  return (
    <View style={{ ...blockStyleToPdf(block.style) } as Style} break={block.style?.breakBefore}>
      {block.rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.borderLight } as Style} wrap={false}>
          {row.map((cell, c) => (
            <View key={c} style={{ width: `${widths[c] ?? 100 / row.length}%`, padding: 4 } as Style}>
              {cell.map((paragraph, p) => (
                <Text key={p} style={block.hasHeader && r === 0 ? { fontWeight: "bold" } as Style : {}}>
                  {paragraph.spans.map((span, s) => (
                    <Text key={s} style={spanStyle(span) as Style}>{resolveSpan(span, ctx)}</Text>
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

function TextBlockView({ block, ctx }: { block: TextBlock; ctx: PdfSectionContext }): ReactElement {
  return (
    <View style={{ ...blockStyleToPdf(block.style) } as Style} break={block.style?.breakBefore}>
      {block.content.map((paragraph, i) => (
        <Text key={i} style={paragraph.align ? { textAlign: paragraph.align } as Style : {}}>
          {paragraph.list === "bullet" ? "•  " : paragraph.list === "number" ? `${i + 1}.  ` : ""}
          {paragraph.spans.map((span, j) => (
            <Text key={j} style={spanStyle(span) as Style}>{resolveSpan(span, ctx)}</Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

export function renderBlock(block: PdfBlock, ctx: PdfSectionContext): ReactElement | null {
  if (block.kind === "smart") {
    const Section = SMART[block.smart];
    if (!Section) return null;
    const style = blockStyleToPdf(block.style);
    const element = Section({ ctx });
    // An unstyled smart block is emitted bare so its output is identical to the
    // built-in layout's — no extra wrapper, no extra element in the tree.
    if (Object.keys(style).length === 0 && !block.style?.breakBefore) return element;
    return <View style={style as Style} break={block.style?.breakBefore}>{element}</View>;
  }
  if (block.kind === "text") return TextBlockView({ block, ctx });
  if (block.kind === "table") return TableBlockView({ block, ctx });
  if (block.kind === "image") {
    if (!block.src.trim()) return null;
    return <Image src={block.src} style={{ ...blockStyleToPdf(block.style), width: block.width, height: block.height, objectFit: "contain" } as Style} />;
  }
  if (block.kind === "divider") {
    return <View style={{ ...blockStyleToPdf(block.style), borderBottomWidth: block.style?.borderWidth ?? 0.5, borderBottomColor: block.style?.borderColor ?? C.borderLight, marginVertical: 6 } as Style} />;
  }
  if (block.kind === "spacer") return <View style={{ height: block.height } as Style} />;
  if (block.kind === "pageBreak") return <View break />;
  return null;
}

export function safeRenderBlock(block: PdfBlock, ctx: PdfSectionContext): ReactElement | null {
  try {
    return renderBlock(block, ctx);
  } catch (error) {
    console.warn(`PDF template: skipped block ${block?.id} (${block?.kind})`, error);
    return null;
  }
}

// Returns a plain array, not a JSX fragment: a <>...</> wrapper is itself an
// element and would add an extra node around the blocks' sections, breaking
// equivalence with the built-in, unwrapped composition (see BuiltInBody in
// FormPdfDocument.tsx). Each block's element is given a React key directly
// (via cloneElement) rather than a keyed <Fragment>, for the same reason.
export function TemplateBody({ template, ctx }: { template: PdfTemplate; ctx: PdfSectionContext }) {
  return template.blocks
    .map((block) => ({ id: block.id, element: safeRenderBlock(block, ctx) }))
    .filter((entry): entry is { id: string; element: ReactElement } => entry.element !== null)
    .map(({ id, element }) => cloneElement(element, { key: id }));
}
