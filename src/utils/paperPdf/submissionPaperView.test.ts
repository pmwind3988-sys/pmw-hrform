import { describe, expect, it } from "vitest";
import { paperDocumentFromAnswers, paperDocumentFromSubmission, surveyQuestionNames } from "./submissionPaperView";
import { TRAINING_EVALUATION_SAMPLE } from "./trainingEvaluationSample";
import type { Submission } from "../../types";

describe("submission paper view", () => {
  it("lists every question a form asks, panels included", () => {
    const names = surveyQuestionNames(TRAINING_EVALUATION_SAMPLE.surveyJson);
    expect(names.has("employeeName")).toBe(true);
    expect(names.has("q9")).toBe(true);
    expect(names.has("employeeSignature")).toBe(true);
    expect(names.has("PdfUrl")).toBe(false);
  });

  it("lays out a reviewer's copy of the answers in the Training Evaluation layout", () => {
    const doc = paperDocumentFromAnswers({
      title: "Training Evaluation Form",
      surveyJson: TRAINING_EVALUATION_SAMPLE.surveyJson,
      responseData: TRAINING_EVALUATION_SAMPLE.responseData,
    });
    expect(doc.variant).toBe("training-evaluation");
    expect(doc.header.control).toEqual([]);
  });

  it("prints a dashboard submission's evaluation step as Part II with its questions", () => {
    const item = {
      listTitle: "Training Evaluation Form",
      surveyJson: TRAINING_EVALUATION_SAMPLE.surveyJson,
      submittedByEmail: "a@example.com",
      submittedAt: "2026-10-01T09:30:00.000Z",
      formStatus: "Approved",
      formVersion: "1.0",
      layerConfig: {
        layers: [{
          layerNumber: 1,
          type: "evaluation",
          surveyElements: TRAINING_EVALUATION_SAMPLE.layerResults?.[0].evaluationSurveyElements,
        }],
      },
      enhancedLayers: [{
        layerNumber: 1, type: "evaluation", status: "confirmed", rawStatus: "Confirmed",
        email: "hod@example.com", confirmedAt: "2027-01-05T03:00:00.000Z", actedByName: "Siti Aminah",
        fields: { p1: true, p2: true, p3: false, p4: true },
      }],
    } as unknown as Submission;
    const doc = paperDocumentFromSubmission(item, TRAINING_EVALUATION_SAMPLE.responseData);
    const part2 = doc.sections.findIndex((s) => s.layer);
    const blocks = doc.sections.slice(part2).flatMap((s) => s.blocks);
    const table = blocks.find((b) => b.kind === "ticks");
    expect(table?.kind === "ticks" && table.rows.map((r) => r.selected)).toEqual([["true"], ["true"], ["false"], ["true"]]);
    expect(blocks.find((b) => b.kind === "signoff")).toMatchObject({ name: "Siti Aminah" });
  });
});
