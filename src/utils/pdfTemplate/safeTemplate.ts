/** safeTemplate.ts — Reading and rendering a template defensively.
 *
 * A PDF is generated after the submission is already saved. A bad template must
 * therefore cost a section at worst and the custom layout at most — never the
 * document, and never the submission.
 */
import { isPdfTemplate, type PdfTemplate } from "./types";

export function readTemplate(value: unknown): PdfTemplate | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  if (!isPdfTemplate(candidate)) return null;
  if (candidate.blocks.length === 0) return null;
  return candidate;
}
