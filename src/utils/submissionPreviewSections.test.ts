import { describe, expect, it } from "vitest";
import { collectPreviewSections } from "./submissionPreviewSections";

describe("submission preview sections", () => {
  // Panel sections were pushed on the way past while the page's own questions
  // waited in one list until the walk finished, so everything outside a panel
  // sank to the bottom of the preview no matter where it had been asked.
  it("lays the record out in the order the form asked", () => {
    const sections = collectPreviewSections({
      pages: [{
        name: "page1",
        title: "Training Feedback",
        elements: [
          { type: "text", name: "trainingDate", title: "Training Date" },
          { type: "panel", name: "employee", title: "Employee Details", elements: [
            { type: "text", name: "employeeName", title: "Employee Name" },
          ] },
          { type: "radiogroup", name: "overallRating", title: "Overall Rating" },
          { type: "panel", name: "ack", title: "Acknowledgement", elements: [
            { type: "signaturepad", name: "employeeSignature", title: "Employee Signature" },
          ] },
        ],
      }],
    }, {
      trainingDate: "2026-06-17",
      employeeName: "Aisyah",
      overallRating: "Excellent",
      employeeSignature: "signature.png",
    });

    expect(sections.map((section) => [section.title, section.fields.map((field) => field.name)])).toEqual([
      ["Training Feedback", ["trainingDate"]],
      ["Employee Details", ["employeeName"]],
      ["", ["overallRating"]],
      ["Acknowledgement", ["employeeSignature"]],
    ]);
  });

  it("drops panels whose fields were never answered", () => {
    const sections = collectPreviewSections({
      pages: [{
        name: "page1",
        title: "Training Feedback",
        elements: [
          { type: "panel", name: "employee", title: "Employee Details", elements: [
            { type: "text", name: "employeeName", title: "Employee Name" },
          ] },
          { type: "text", name: "comments", title: "Comments" },
        ],
      }],
    }, {
      comments: "Well run.",
    });

    expect(sections.map((section) => [section.title, section.fields.map((field) => field.name)])).toEqual([
      ["Training Feedback", ["comments"]],
    ]);
  });
});
