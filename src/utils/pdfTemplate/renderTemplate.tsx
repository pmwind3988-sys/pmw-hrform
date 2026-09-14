/**
 * renderTemplate.tsx — Draws a block template with @react-pdf primitives.
 *
 * A smart block delegates to the very component the built-in layout uses, which
 * is what lets the default template be identical to the built-in document
 * rather than a careful imitation of it.
 */
import type { ReactElement } from "react";
import { cloneElement } from "react";
import { View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import {
  HeaderSection, DocumentControlSection, StatusBadgeSection, SubmissionMetaSection,
  AnswersSection, ApprovalsSection, SignaturesSection, EvaluationDetailsSection, IsoStandardsSection,
} from "../pdfSections/sections";
import type { PdfSectionContext } from "../pdfSections/context";
import type { BlockStyle, PdfBlock, PdfTemplate, SmartBlockType } from "./types";

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
  return null; // content blocks arrive in Tasks 6 and 7
}

// Returns a plain array, not a JSX fragment: a <>...</> wrapper is itself an
// element and would add an extra node around the blocks' sections, breaking
// equivalence with the built-in, unwrapped composition (see BuiltInBody in
// FormPdfDocument.tsx). Each block's element is given a React key directly
// (via cloneElement) rather than a keyed <Fragment>, for the same reason.
export function TemplateBody({ template, ctx }: { template: PdfTemplate; ctx: PdfSectionContext }) {
  return template.blocks
    .map((block) => ({ id: block.id, element: renderBlock(block, ctx) }))
    .filter((entry): entry is { id: string; element: ReactElement } => entry.element !== null)
    .map(({ id, element }) => cloneElement(element, { key: id }));
}
