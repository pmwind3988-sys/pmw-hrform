/**
 * testSupport.tsx — Fixtures and a serializer for PDF element trees.
 *
 * Rendering real PDF bytes is slow and compares badly. Serializing the React
 * element tree instead catches every structural or style change while running
 * in milliseconds.
 */
import type { ReactElement, ReactNode } from "react";
import type { PdfFormData } from "../FormPdfDocument";

interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: unknown[];
}

function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "Anonymous";
  const named = type as { displayName?: string };
  return named?.displayName || "Unknown";
}

function serializeChild(child: ReactNode): unknown {
  if (child === null || child === undefined || typeof child === "boolean") return null;
  if (typeof child === "string" || typeof child === "number") return child;
  if (Array.isArray(child)) return child.map(serializeChild).filter((c) => c !== null);
  return renderToJson(child as ReactElement);
}

/** Serializes a react-pdf element tree to comparable plain JSON. */
export function renderToJson(element: ReactElement): JsonNode {
  const { children, ...props } = (element.props ?? {}) as Record<string, unknown> & { children?: ReactNode };
  return {
    type: typeName(element.type),
    props,
    children: ([] as unknown[]).concat(serializeChild(children ?? null) ?? []).filter((c) => c !== null),
  };
}

export function sampleFormData(): PdfFormData {
  return {
    surveyJson: {
      title: "Leave Application",
      pages: [{ name: "page1", elements: [
        { type: "text", name: "employeeName", title: "Employee Name" },
        { type: "text", name: "reason", title: "Reason" },
      ] }],
    },
    responseData: { employeeName: "Aisyah binti Rahman", reason: "Medical" },
    meta: {
      submittedBy: "aisyah@example.com",
      submittedAt: "2026-09-01T08:30:00.000Z",
      formTitle: "Leave Application",
      formVersion: "3",
      formStatus: "Approved",
      referenceNo: "LV-010926-0007",
    },
    layerResults: [
      { layerNumber: 1, type: "approval", status: "Approved", email: "manager@example.com", signedAt: "2026-09-02T02:00:00.000Z", signature: "data:image/png;base64,iVBORw0KGgo=" },
    ],
    isoStandards: "ISO 9001:2015",
    documentHeader: { documentNumber: "HR-F-001", issueNumber: "2", effectiveDate: "2026-01-01", revisionNumber: "1", revisionDate: "2026-06-01" },
  };
}
