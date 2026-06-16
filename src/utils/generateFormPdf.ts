/**
 * generateFormPdf.ts — Generates PDF, uploads to SharePoint, stores URL on
 * the response item, and opens in a new tab for viewing.
 */
import { pdf } from "@react-pdf/renderer";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "./FormPdfDocument";
import { uploadFormPdf, spPatch, ensurePdfUrlColumn, readMatrixChildItems } from "./formBuilderSP";
import type { MatrixColumnDef } from "./formBuilderSP";

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");

// ── Layer data extraction ──────────────────────────────────────────────────

/**
 * Build layer results array from the raw response item fields.
 * Reads L{n}_Status, L{n}_Email, L{n}_SignedAt, L{n}_Rejection, L{n}_Signature
 * and EvaluationData to produce PdfLayerResult[].
 */
export function buildPdfLayerResults(
  rawResponse: Record<string, unknown>,
  maxLayerCount = 10
): PdfLayerResult[] {
  const results: PdfLayerResult[] = [];

  // Parse EvaluationData JSON if present
  let evalData: Record<number, Record<string, unknown>> = {};
  const rawEval = rawResponse.EvaluationData as string | undefined;
  if (rawEval) {
    try { evalData = JSON.parse(rawEval) as Record<number, Record<string, unknown>>; } catch { /* ignore */ }
  }

  for (let n = 1; n <= maxLayerCount; n++) {
    const status = rawResponse[`L${n}_Status`] as string | undefined;
    if (!status) continue; // No more layers

    // Determine type — evaluation layers have entries in EvaluationData
    const isEval = !!evalData[n];

    const entry: PdfLayerResult = {
      layerNumber: n,
      type: isEval ? "evaluation" : "approval",
      status,
      email: (rawResponse[`L${n}_Email`] as string) || "",
      signedAt: (rawResponse[`L${n}_SignedAt`] as string) || undefined,
      rejection: (rawResponse[`L${n}_Rejection`] as string) || undefined,
      signature: (rawResponse[`L${n}_Signature`] as string) || undefined,
    };

    // For evaluation layers, extract evaluation fields
    if (isEval && evalData[n]) {
      const ed = evalData[n] as Record<string, unknown>;
      entry.evaluationFields = ed.fields as Record<string, unknown> || {};
      entry.confirmerEmail = ed.confirmerEmail as string || "";
      entry.confirmerName = ed.confirmerName as string || "";
    }

    results.push(entry);
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Find all dynamicmatrix/tableinput fields with their column definitions in the survey JSON. */
function findMatrixFields(surveyJson: PdfFormData["surveyJson"]): { name: string; columns: MatrixColumnDef[] }[] {
  const result: { name: string; columns: MatrixColumnDef[] }[] = [];
  const pages = surveyJson?.pages ?? [];
  const childKeys = ["elements", "templateElements", "questions"] as const;

  const asElementArray = (value: unknown): Record<string, unknown>[] => {
    return Array.isArray(value)
      ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
      : [];
  };

  const walkElements = (els: Record<string, unknown>[]) => {
    for (const el of els) {
      const t = el.type as string | undefined;
      if (t === "dynamicmatrix" || t === "matrixdynamic" || t === "tableinput") {
        const name = el.name as string | undefined;
        const cols = (el.columns as MatrixColumnDef[]) || [];
        if (name && cols.length > 0) result.push({ name, columns: cols });
      }

      for (const childKey of childKeys) {
        const children = asElementArray(el[childKey]);
        if (children.length > 0) walkElements(children);
      }

      if (t !== "dynamicmatrix" && t !== "matrixdynamic" && t !== "tableinput") {
        for (const column of asElementArray(el.columns)) {
          const columnElements = asElementArray(column.elements);
          if (columnElements.length > 0) walkElements(columnElements);
        }
      }
    }
  };
  for (const page of pages) {
    if (page.elements) walkElements(page.elements);
  }
  return result;
}

/**
 * Sanitize a field name for use in a SharePoint child list name.
 * Mirrors the sanitization in ensureMatrixChildList.
 */
function sanitizeMatrixFieldName(fieldName: string): string {
  return fieldName.replace(/[^a-zA-Z0-9_ -]/g, "").trim();
}

// ── PDF generation + storage ───────────────────────────────────────────────

export async function generateAndStorePdf(
  token: string,
  listTitle: string,
  responseItemId: number,
  data: PdfFormData
): Promise<string> {
  // ── Inject matrix child rows ──────────────────────────────────────────
  // For dynamicmatrix/tableinput fields, read child list rows and attach
  // them to responseData so the PDF document can render proper tables.
  const matrixFields = findMatrixFields(data.surveyJson);
  for (const mf of matrixFields) {
    const rowIdsKey = `${mf.name}_RowIds`;
    const rowIdsRaw = data.responseData[rowIdsKey];
    if (!rowIdsRaw) continue;

    // RowIds is stored as a JSON string of child item IDs
    let hasRowIds = false;
    if (typeof rowIdsRaw === "string") {
      try {
        const parsed = JSON.parse(rowIdsRaw) as unknown;
        hasRowIds = Array.isArray(parsed) && parsed.length > 0;
      } catch { /* not valid JSON — skip */ }
    } else if (Array.isArray(rowIdsRaw)) {
      hasRowIds = rowIdsRaw.length > 0;
    }
    if (!hasRowIds) continue;

    try {
      const safeName = sanitizeMatrixFieldName(mf.name);
      const childListName = `${data.meta.formTitle} Matrix ${safeName}`;
      const childRows = await readMatrixChildItems(token, childListName, responseItemId);
      if (childRows.length > 0) {
        data.responseData[`${mf.name}_childRows`] = { columns: mf.columns, rows: childRows };
      }
    } catch {
      // Silently skip if child list read fails (list may not exist yet)
    }
  }

  const blob = await Promise.race([
    pdf(FormPdfDocument(data)).toBlob(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF generation timed out")), 60_000)
    ),
  ]);

  // Upload to SharePoint Form PDFs library
  const pdfUrl = await uploadFormPdf(token, listTitle, responseItemId, blob);

  // Store PDF URL on the response item
  try {
    await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
      PdfUrl: pdfUrl,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // If the PdfUrl column doesn't exist yet, add it and retry
    if (msg.includes('PdfUrl') && (msg.includes('does not exist') || msg.includes('not found'))) {
      try {
        await ensurePdfUrlColumn(token, listTitle);
        // SharePoint needs a moment after adding a column before it can be written
        await new Promise(r => setTimeout(r, 2000));
        await spPatch(token, `${SP_SITE_URL}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${responseItemId})`, {
          PdfUrl: pdfUrl,
        });
      } catch (retryErr) {
        console.warn("[PDF] failed to store PdfUrl after adding column:", retryErr);
      }
    } else {
      console.warn("[PDF] failed to store PdfUrl:", e);
    }
  }

  return pdfUrl;
}
