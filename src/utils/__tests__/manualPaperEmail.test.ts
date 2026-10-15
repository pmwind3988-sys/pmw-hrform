import { describe, expect, it } from "vitest";
import { buildManualPaperSubmissionEmail } from "../manualPaperEmail";
import { manualPaperDesign } from "../paperPdf/trainingEvaluationLayout";

describe("manual / paper workflow notice", () => {
  const notice = buildManualPaperSubmissionEmail({
    formTitle: "Training Evaluation Form",
    responseItemId: 12,
    submittedBy: "test.user@pmw.com.my",
    referenceNo: "TEF-300626-0012",
    layer: { layerNumber: 1, type: "evaluation", title: "Immediate Superior/HOD" },
    totalLayers: 1,
    pdfUrl: "https://tenant.sharepoint.com/sites/HR/Form%20PDFs/TEF_12.pdf",
  });

  it("uses the shared workflow subject", () => {
    expect(notice.subject).toBe("[Manual Action Required] Training Evaluation Form – test.user@pmw.com.my (#TEF-300626-0012)");
  });

  it("is the shared workflow email, with the step, the plain instruction and the PDF button", () => {
    expect(notice.body).toContain("<!DOCTYPE html");
    expect(notice.body).toContain("Manual workflow");
    expect(notice.body).toContain("Training Evaluation Form needs manual evaluation");
    expect(notice.body).toContain("Print the attached form, complete the evaluation by hand");
    expect(notice.body).toContain("Immediate Superior/HOD");
    expect(notice.body).toContain("Open the PDF record");
  });
});

describe("the PDF a manual step prints", () => {
  it("is the paper form for the Training Evaluation Form only", () => {
    expect(manualPaperDesign("Training Evaluation Form")).toEqual({ design: "paper" });
    expect(manualPaperDesign("Leave Application")).toEqual({});
  });
});
