import { describe, expect, it } from "vitest";

import { sampleAnswersFor, testRunFormUrl } from "../testRunLaunch";

describe("sample answers", () => {
  it("fills a text question with something a reviewer can recognise as a test", () => {
    const answers = sampleAnswersFor({ pages: [{ elements: [{ type: "text", name: "reason" }] }] });
    expect(String(answers.reason)).toContain("Test");
  });

  it("picks the first offered choice, so branching starts somewhere valid", () => {
    const answers = sampleAnswersFor({
      pages: [{ elements: [{ type: "dropdown", name: "branch", choices: ["Managerial", "Non-managerial"] }] }],
    });
    expect(answers.branch).toBe("Managerial");
  });

  it("gives a number question a number and a date question a date", () => {
    const answers = sampleAnswersFor({
      pages: [{ elements: [{ type: "text", name: "days", inputType: "number" }, { type: "text", name: "start", inputType: "date" }] }],
    });
    expect(typeof answers.days).toBe("number");
    expect(String(answers.start)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves a question type it does not understand unanswered rather than guessing", () => {
    expect(sampleAnswersFor({ pages: [{ elements: [{ type: "signaturepad", name: "sign" }] }] })).toEqual({});
  });

  it("survives a form with no pages at all", () => {
    expect(sampleAnswersFor({})).toEqual({});
  });
});

// This app has exactly one form route — `/form/:formId` (see `src/App.tsx`)
// — so there is no public vs. signed-in path to distinguish here. Per the
// task-11 ruling, these tests pin that single path and confirm the ticket
// rides in the query string rather than exercising a second route that does
// not exist.
describe("test run url", () => {
  it("opens the form on the app's one form route", () => {
    const url = testRunFormUrl({ slug: "leave-application", ticket: "abc.def" });
    expect(url).toContain("/form/leave-application");
  });

  it("carries the ticket in the query string", () => {
    const url = testRunFormUrl({ slug: "leave-application", ticket: "abc.def" });
    expect(url).toContain("testTicket=abc.def");
  });
});
