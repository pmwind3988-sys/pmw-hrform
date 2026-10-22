import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  renderActionRequestEmail,
  renderSubmissionOutcomeEmail,
  renderWorkflowEmail,
  WORKFLOW_EMAIL_STATUS,
} from "./workflowEmailTemplate";

const REQUEST = {
  formTitle: "Training Requisition",
  submittedBy: "nur.aisyah@example.com",
  responseItemId: 412,
  layer: 2,
  totalLayers: 3,
  layerType: "approval" as const,
  reviewLink: "https://example.com/eval/training-requisition/412/2",
  referenceNo: "OSH-221026-0014",
  applicantName: "Nur Aisyah",
};

describe("renderWorkflowEmail", () => {
  it("draws a labelled icon circle for each open status", () => {
    const cases = [
      [WORKFLOW_EMAIL_STATUS.actionRequired, "!", "#1E40AF", "status-action-required.png"],
      [WORKFLOW_EMAIL_STATUS.awaitingRouting, "?", "#B45309", "status-awaiting-routing.png"],
      [WORKFLOW_EMAIL_STATUS.manual, "✎", "#B45309", "status-manual-paper.png"],
    ] as const;
    for (const [status, glyph, color, picture] of cases) {
      const body = renderWorkflowEmail({ preheader: "p", eyebrow: "System notification", heading: "h", intro: "i", details: [], status });
      expect(body).toContain(`width:76px;height:76px;margin:0 auto;background-color:${color}`);
      // The cartoon sits in the coloured circle; with pictures blocked, its alt text is the symbol.
      expect(body).toContain(`<img src="https://pmw-hrform.vercel.app/email/${picture}" width="76" height="76" alt="${glyph}"`);
      expect(body).toContain(`color:${color};text-transform:uppercase;letter-spacing:0.06em;text-align:center">${status.label}</p>`);
      // The label under the circle replaces the grey eyebrow.
      expect(body).not.toContain("System notification");
      expect(body).not.toContain("border-radius:999px;padding:5px 14px");
    }
  });

  it("keeps the unlabelled circle and the eyebrow for completed and rejected", () => {
    for (const [status, glyph] of [[WORKFLOW_EMAIL_STATUS.completed, "✓"], [WORKFLOW_EMAIL_STATUS.rejected, "✕"]] as const) {
      const body = renderWorkflowEmail({ preheader: "p", eyebrow: "Status update", heading: "h", intro: "i", details: [], status });
      expect(body).toContain(`line-height:1">${glyph}</td>`);
      expect(body).toContain("Status update");
      expect(body).not.toContain(`>${status.label}</p>`);
    }
  });

  it("prints the callout in an amber box above the details, with bold marked words", () => {
    const body = renderWorkflowEmail({
      preheader: "p", eyebrow: "e", heading: "h", intro: "i",
      details: [{ label: "Form", value: "X" }],
      callout: "**Why it stopped:** <no row>",
    });
    expect(body).toContain("background-color:#FFFBEB");
    expect(body).toContain("<strong style=\"color:#78350F\">Why it stopped:</strong> &lt;no row&gt;");
    expect(body.indexOf("#FFFBEB")).toBeLessThan(body.indexOf(">Form</strong>"));
  });

  it("prints the PA note as a blue For your information box, not a warning", () => {
    const body = renderActionRequestEmail({ ...REQUEST, standInNote: "Sent to Ali (ali@pmw.com) and to Siti." });
    expect(body).toContain("For your information");
    expect(body).toContain("background-color:#EFF6FF");
    expect(body).toContain("Sent to Ali (ali@pmw.com) and to Siti.");
    expect(body).not.toContain("#FFFBEB");
  });

  it("reads every spelling of a layer as a step", () => {
    const body = renderWorkflowEmail({
      preheader: "Rejected at layer #2.", eyebrow: "e", heading: "Stopped at Layer #3", intro: "Moved to layer 4.",
      details: [{ label: "Final status", value: "Completed at layer #3" }],
    });
    expect(body).not.toMatch(/layer/i);
    expect(body).toContain("Stopped at Step 3");
    expect(body).toContain("Moved to step 4.");
    expect(body).toContain("Completed at step 3");
  });
});

describe("renderActionRequestEmail", () => {
  it("is the one wording, with the PDF beside the button when there is one", () => {
    const body = renderActionRequestEmail({ ...REQUEST, pdfUrl: "https://example.com/r.pdf" });
    expect(body).toContain("Training Requisition needs your approval");
    expect(body).toContain("Review &amp; approve form");
    expect(body).toContain("View PDF record");
    expect(body).toContain("Step 2 of 3");
    expect(body).not.toContain("superuser");
  });

  it("names the evaluation button for an evaluation", () => {
    expect(renderActionRequestEmail({ ...REQUEST, layerType: "evaluation" })).toContain("Review &amp; submit evaluation");
  });
});

describe("renderSubmissionOutcomeEmail", () => {
  const OUTCOME = {
    formTitle: "Training Requisition",
    responseItemId: 412,
    layer: 2,
    totalLayers: 3,
    submissionsUrl: "https://example.com/submissions",
  };

  it("gives a rejection its reason, who rejected it and a way back to the request", () => {
    const body = renderSubmissionOutcomeEmail({ ...OUTCOME, outcome: "rejected", reason: "Budget code missing", decidedBy: "Hafiz Rahman" });
    expect(body).toContain("Reason given:</strong> Budget code missing");
    expect(body).toContain("Hafiz Rahman");
    expect(body).toContain("href=\"https://example.com/submissions\"");
    expect(body).toContain("View my submissions");
    expect(body).toContain("rejected at step 2 of 3");
    expect(body).not.toMatch(/layer/i);
  });

  it("says plainly when no reason was recorded", () => {
    const body = renderSubmissionOutcomeEmail({ ...OUTCOME, outcome: "rejected" });
    expect(body).toContain("No reason was recorded.");
    expect(body).not.toContain("Reason given");
  });

  it("links a completed request back to the submitter's list", () => {
    const body = renderSubmissionOutcomeEmail({ ...OUTCOME, layer: 3, outcome: "completed" });
    expect(body).toContain("View my submissions");
    expect(body).toContain("All 3 completed");
    expect(body).not.toMatch(/layer/i);
  });
});

describe("status pictures", () => {
  it("are all in the site's public/email folder", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["status-action-required.png", "status-awaiting-routing.png", "status-manual-paper.png"]) {
      expect(readFileSync(resolve(here, "..", "..", "public", "email", name)).subarray(1, 4).toString()).toBe("PNG");
    }
  });
});

describe("browser copy", () => {
  it("stays identical to this file below the header comment", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const marker = "export interface WorkflowEmailDetail";
    const body = (path: string) => {
      const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      return text.slice(text.indexOf(marker));
    };
    expect(body(resolve(here, "..", "..", "src", "utils", "workflowEmailTemplate.ts")))
      .toBe(body(resolve(here, "workflowEmailTemplate.ts")));
  });
});
