import { describe, expect, it } from "vitest";
import {
  answerAsText,
  buildCorrectionEntry,
  correctedQuestionLabels,
  correctionNotice,
  correctionsFromFields,
} from "../submissionCorrections";
import {
  MAX_CORRECTION_VALUE_LENGTH,
  readSubmissionCorrections,
  recordRoutingCheck,
  recordSubmissionCorrection,
  setWorkflowAssignmentOverride,
} from "../workflowAssignmentData";
import { auditExportHeader, auditExportRow, stepCount } from "../submissionAuditExport";

const survey = {
  pages: [{ elements: [
    { type: "text", name: "amount", title: "Claim amount" },
    { type: "panel", name: "p", elements: [{ type: "comment", name: "reason", title: { default: "Reason" } }] },
  ] }],
};

const entry = (at: string) => buildCorrectionEntry({
  surveyJson: survey,
  before: { amount: "500", reason: "Taxi" },
  after: { amount: "5000", reason: "Taxi" },
  changed: ["amount"],
  by: "Siti@PMW.example",
  at,
})!;

describe("buildCorrectionEntry", () => {
  it("records each changed answer with its wording, before and after", () => {
    expect(entry("2026-11-01T02:00:00.000Z")).toEqual({
      at: "2026-11-01T02:00:00.000Z",
      by: "siti@pmw.example",
      changes: [{ question: "amount", label: "Claim amount", before: "500", after: "5000" }],
    });
  });

  it("records nothing when nothing changed or nobody is signed in", () => {
    expect(buildCorrectionEntry({ surveyJson: survey, before: {}, after: {}, changed: [], by: "a@b.c", at: "x" })).toBeNull();
    expect(buildCorrectionEntry({ surveyJson: survey, before: {}, after: { amount: "1" }, changed: ["amount"], by: " ", at: "x" })).toBeNull();
  });

  it("shows a newly uploaded file by its stored address, not its content", () => {
    const made = buildCorrectionEntry({
      surveyJson: survey, before: { amount: "" }, after: { amount: "data:image/png;base64,AAA" }, changed: ["amount"],
      by: "a@b.c", at: "x", uploaded: new Map([["amount", "https://sp/file.png"]]),
    });
    expect(made?.changes[0].after).toBe("https://sp/file.png");
    expect(answerAsText("data:image/png;base64,AAA")).toBe("(a new file or signature)");
    expect(answerAsText([{ a: 1 }])).toBe('[{"a":1}]');
    expect(answerAsText(["x", "y"])).toBe("x, y");
  });
});

describe("the correction record in WorkflowAssignmentData", () => {
  it("is kept when the column is rewritten by a routing check or a reassignment", () => {
    let raw = JSON.stringify(recordSubmissionCorrection("", entry("2026-11-01T02:00:00.000Z")));
    raw = JSON.stringify(recordRoutingCheck(raw, {
      at: "2026-11-02T00:00:00.000Z", layer: 1, trigger: "daily-run", outcome: "match", saved: ["a@b.c"], routed: ["a@b.c"],
    }).data);
    raw = JSON.stringify(setWorkflowAssignmentOverride(raw, {
      layer: 1, email: "x@y.z", updatedBy: "hr@y.z", updatedAt: "2026-11-03T00:00:00.000Z",
    }));
    expect(readSubmissionCorrections(raw)).toHaveLength(1);
  });

  it("adds every correction and never drops an earlier one", () => {
    let raw: unknown = "";
    for (let i = 0; i < 80; i += 1) raw = JSON.stringify(recordSubmissionCorrection(raw, entry(`2026-11-01T02:${String(i % 60).padStart(2, "0")}:00Z`)));
    expect(readSubmissionCorrections(raw)).toHaveLength(80);
  });

  it("clips a very long answer instead of dropping it", () => {
    const long = "x".repeat(MAX_CORRECTION_VALUE_LENGTH + 50);
    const raw = recordSubmissionCorrection("", { at: "t", by: "a@b.c", changes: [{ question: "q", before: long, after: "" }] });
    expect(readSubmissionCorrections(raw)[0].changes[0].before).toHaveLength(MAX_CORRECTION_VALUE_LENGTH);
  });

  it("is read from the reviewer page's field or the row's own column", () => {
    const corrections = [entry("2026-11-01T02:00:00.000Z")];
    expect(correctionsFromFields({ SubmissionCorrections: JSON.stringify(corrections) })).toEqual(corrections);
    expect(correctionsFromFields({ WorkflowAssignmentData: JSON.stringify({ version: 1, layers: {}, corrections }) })).toEqual(corrections);
    expect(correctionsFromFields({})).toEqual([]);
  });
});

describe("correctionNotice", () => {
  const fmt = (iso: string) => `<${iso}>`;
  it("says nothing for an uncorrected submission", () => {
    expect(correctionNotice([], fmt)).toBe("");
  });
  it("names when, and how many answers or times", () => {
    expect(correctionNotice([entry("A")], fmt)).toBe("Corrected by the submitter on <A>, before any step was decided (1 answer changed).");
    expect(correctionNotice([entry("A"), entry("B")], fmt)).toBe("Corrected by the submitter 2 times before any step was decided, last on <B>.");
    expect(correctedQuestionLabels([entry("A"), entry("B")])).toEqual(["Claim amount"]);
  });
});

describe("audit export", () => {
  const item = {
    Title: "Claim Form", Id: 7, ReferenceNo: "CL-011126-0001", SubmittedBy: "siti@pmw.example",
    SubmittedAt: "2026-11-01T01:00:00Z", FormStatus: "Approved", CurrentLayer: 2, FormVersion: "3.0",
    PDPAConsent: true, PDPANoticeVersion: "PMW-PRIVACY-NOTICE-020126-EN", PDPAConsentAt: "2026-11-01T01:00:00Z",
    L1_Status: "Approved", L1_Email: "ceo@pmw.example", L1_ActedBy: "pa@pmw.example", L1_ActedByName: "Lina",
    L1_ActedByPosition: "Personal Assistant", L1_SignedAt: "2026-11-02T03:00:00Z",
    L1_OnBehalfOf: JSON.stringify({ email: "ceo@pmw.example", name: "Faiz", position: "CEO" }),
    L2_Status: "Rejected", L2_Email: "hr@pmw.example", L2_SignedAt: "2026-11-03T03:00:00Z", L2_Rejection: "No receipt",
    WorkflowAssignmentData: JSON.stringify({ version: 1, layers: {}, corrections: [entry("2026-11-01T02:00:00Z")] }),
  };

  it("has a block of columns for every step any row reached", () => {
    expect(stepCount(item)).toBe(2);
    const header = auditExportHeader(2);
    expect(header).toContain("Step 2 rejection reason");
    expect(auditExportRow(item, 2, (iso) => iso)).toHaveLength(header.length);
  });

  it("carries who decided each step, on whose behalf, when and why", () => {
    const header = auditExportHeader(2);
    const row = auditExportRow(item, 2, (iso) => `MY ${iso}`);
    const cell = (name: string) => row[header.indexOf(name)];
    expect(cell("Reference No.")).toBe("CL-011126-0001");
    expect(cell("PDPA consent")).toBe("Yes");
    expect(cell("Corrected by submitter (times)")).toBe("1");
    expect(cell("Answers corrected")).toBe("Claim amount");
    expect(cell("Step 1 decided by")).toBe("Lina");
    expect(cell("Step 1 decided by (email)")).toBe("pa@pmw.example");
    expect(cell("Step 1 on behalf of")).toBe("Faiz, CEO");
    expect(cell("Step 1 decided at")).toBe("MY 2026-11-02T03:00:00Z");
    expect(cell("Step 2 decided by (email)")).toBe("hr@pmw.example");
    expect(cell("Step 2 rejection reason")).toBe("No receipt");
  });

  it("leaves a step nobody decided without a decider", () => {
    const header = auditExportHeader(1);
    const row = auditExportRow({ L1_Status: "Pending", L1_Email: "hod@pmw.example" }, 1, (iso) => iso);
    expect(row[header.indexOf("Step 1 decided by (email)")]).toBe("");
  });
});
