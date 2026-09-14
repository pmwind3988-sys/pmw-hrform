/** unlock.ts — Converts a smart block into editable content blocks.
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
        rows.push([cell(field.label), varCell(`field:${field.key}`)]);
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
