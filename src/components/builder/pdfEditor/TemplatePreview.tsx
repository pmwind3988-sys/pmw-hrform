/** TemplatePreview.tsx — Debounced live PDF preview plus the unresolved-variable warnings list. */
import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { C } from "../constants";
import FormPdfDocument from "../../../utils/FormPdfDocument";
import type { PdfFormData } from "../../../utils/FormPdfDocument";
import { unresolvedVariables } from "../../../utils/pdfTemplate/resolve";
import type { PdfTemplate } from "../../../utils/pdfTemplate/types";
import type { PdfVariable } from "../../../utils/pdfTemplate/variables";

const DEBOUNCE_MS = 400;

export interface TemplatePreviewProps {
  template: PdfTemplate;
  sampleData: PdfFormData;
  catalogue: PdfVariable[];
}

export default function TemplatePreview({ template, sampleData, catalogue }: TemplatePreviewProps) {
  const [objectUrl, setObjectUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const knownTokens = useMemo(() => new Set(catalogue.map((v) => v.token)), [catalogue]);
  const warnings = useMemo(() => unresolvedVariables(template, knownTokens), [template, knownTokens]);
  const variableLabel = (token: string) => catalogue.find((v) => v.token === token)?.label ?? token;

  useEffect(() => {
    let cancelled = false;
    let created = "";

    const timer = setTimeout(() => {
      void (async () => {
        // Set inside the async body rather than in the effect itself: a
        // synchronous setState during an effect schedules a second render
        // before the first has painted (see PdfPreviewDialog.tsx).
        setLoading(true);
        setError("");
        try {
          const blob = await pdf(FormPdfDocument({ ...sampleData, pdfTemplate: template })).toBlob();
          if (cancelled) return;
          created = URL.createObjectURL(blob);
          setObjectUrl(created);
        } catch {
          if (!cancelled) setError("The preview could not be generated for this document.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (created) URL.revokeObjectURL(created);
    };
  }, [template, sampleData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {warnings.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: C.amberPale,
            border: `1px solid ${C.amber}`,
            borderRadius: 8,
            padding: "8px 10px",
            margin: "0 0 10px",
            fontSize: 12.5,
            color: C.textPrimary,
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 18, color: C.amber, flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Unresolved variables</div>
            <div>
              {warnings.map((token) => variableLabel(token)).join(", ")} — these no longer match a field or built-in value.
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: "relative", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.7)",
              fontSize: 13,
              color: C.textMuted,
            }}
          >
            Updating preview…
          </div>
        )}
        {error && !loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center", fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}
        {objectUrl && (
          <iframe title="Document preview" src={objectUrl} style={{ width: "100%", height: "100%", border: "none" }} />
        )}
      </div>
    </div>
  );
}
