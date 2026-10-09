import { describe, it, expect, vi } from "vitest";
import { planImport, publishPlannedForm, singleApprovalLayer, slugFromFileName, type PublishDeps } from "./formImport";

const FORM = JSON.stringify({ title: "F1 Drilling", pages: [{ name: "p1", elements: [{ type: "text", name: "mouldNo" }] }] });

describe("slugFromFileName", () => {
  it("drops the folder and the .form.json ending", () => {
    expect(slugFromFileName("fixtures/f1-drilling.form.json")).toBe("f1-drilling");
    expect(slugFromFileName("C:\\forms\\Daily Check.json")).toBe("daily-check");
  });
});

describe("planImport", () => {
  it("marks a new, well-formed definition ready, with its slug and form ID from the file name", () => {
    const [plan] = planImport([{ name: "f1-drilling.form.json", text: FORM }], []);
    expect(plan).toMatchObject({ status: "ready", slug: "f1-drilling", title: "F1 Drilling", formId: "F1-DRILLING" });
  });

  it("skips a form whose title or slug the site already has", () => {
    const [byTitle, bySlug] = planImport(
      [{ name: "other.form.json", text: FORM }, { name: "f1-painting.form.json", text: FORM.replace("F1 Drilling", "F1 Painting") }],
      [{ Title: "f1 drilling" }, { Title: "Something", Slug: "f1-painting" }],
    );
    expect(byTitle.status).toBe("exists");
    expect(bySlug.status).toBe("exists");
  });

  it("explains what is wrong with a file it cannot publish", () => {
    const plans = planImport([
      { name: "a.json", text: "{ nope" },
      { name: "b.json", text: JSON.stringify({ pages: [{ elements: [{}] }] }) },
      { name: "c.json", text: JSON.stringify({ title: "Empty", pages: [{ elements: [] }] }) },
    ], []);
    expect(plans.map((p) => p.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(plans.map((p) => p.reason)).toEqual(["Not valid JSON.", "The form has no title.", "The form has no questions."]);
  });

  it("lets only the first of two files with the same slug through", () => {
    const plans = planImport([{ name: "x.form.json", text: FORM }, { name: "X.json", text: FORM.replace("F1 Drilling", "Other") }], []);
    expect(plans.map((p) => p.status)).toEqual(["ready", "invalid"]);
  });
});

describe("singleApprovalLayer", () => {
  it("assigns one person, or several of whom any one may sign", () => {
    expect(singleApprovalLayer("Checking By", "qc@pmw.test")!.layers[0]).toMatchObject({
      title: "Checking By", type: "approval", assignee: { type: "user", value: "qc@pmw.test" },
    });
    expect(singleApprovalLayer("Checking By", "a@pmw.test; b@pmw.test")!.layers[0].assignee).toEqual({ type: "users", value: "a@pmw.test, b@pmw.test" });
  });

  it("is absent when nobody is named", () => {
    expect(singleApprovalLayer("Checking By", "  ")).toBeNull();
  });
});

describe("publishPlannedForm", () => {
  function fakeDeps() {
    const calls: string[] = [];
    const record = (name: string) => vi.fn(async () => { calls.push(name); return "1"; });
    const deps = {
      provisionFormList: record("provision"),
      upsertFormConfig: record("config"),
      upsertApprovers: record("approvers"),
      saveFormVersion: record("version"),
      logEvent: record("log"),
    } as unknown as PublishDeps;
    return { deps, calls };
  }
  const [plan] = planImport([{ name: "f1-drilling.form.json", text: FORM }], []);

  it("runs the builder's publish steps in order and records the checker", async () => {
    const { deps, calls } = fakeDeps();
    const layerConfig = singleApprovalLayer("Checking By", "qc@pmw.test");
    await publishPlannedForm("t", plan, { layerConfig, isPublic: false, changedBy: "admin@pmw.test" }, deps);
    expect(calls).toEqual(["provision", "config", "approvers", "version", "log"]);
    expect(deps.upsertFormConfig).toHaveBeenCalledWith("t", "F1 Drilling", expect.objectContaining({
      slug: "f1-drilling", formId: "F1-DRILLING", numLayers: 1, isPublic: false, isPublished: true,
    }));
    expect(deps.upsertApprovers).toHaveBeenCalledWith("t", "F1 Drilling", [{ email: "qc@pmw.test", name: "Checking By" }]);
  });

  it("writes no approvers when the forms have no approval layer", async () => {
    const { deps, calls } = fakeDeps();
    await publishPlannedForm("t", plan, { layerConfig: null, isPublic: false, changedBy: "a" }, deps);
    expect(calls).toEqual(["provision", "config", "version", "log"]);
  });

  it("refuses a form that is not ready", async () => {
    const { deps } = fakeDeps();
    await expect(publishPlannedForm("t", { ...plan, status: "exists", reason: "Taken." }, { layerConfig: null, isPublic: false, changedBy: "a" }, deps)).rejects.toThrow("Taken.");
  });
});
