/**
 * generateFormPdf.ts — Generates PDF, uploads to SharePoint, stores URL on
 * the response item, and opens in a new tab for viewing.
 */
import { pdf } from "@react-pdf/renderer";
import FormPdfDocument, { type PdfFormData, type PdfLayerResult } from "./FormPdfDocument";
import { uploadFormPdf, spPatch, addColumn } from "./formBuilderSP";

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

// ── PDF generation + storage ───────────────────────────────────────────────

export async function generateAndStorePdf(
  token: string,
  listTitle: string,
  responseItemId: number,
  data: PdfFormData
): Promise<string> {
  const blob = await pdf(FormPdfDocument(data)).toBlob();

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
        await addColumn(token, listTitle, 'PdfUrl', 2);
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

  // Open in new tab for viewing.
  // pdfUrl from SharePoint is server-relative (e.g. /sites/PMWHRDocs/Form%20PDFs/file.pdf),
  // so prepend only the ORIGIN (not SP_SITE_URL which already includes the site path).
  const origin = new URL(SP_SITE_URL).origin;
  const fullUrl = pdfUrl.startsWith("http") ? pdfUrl : `${origin}${pdfUrl}`;
  window.open(fullUrl, "_blank");

  return pdfUrl;
}
