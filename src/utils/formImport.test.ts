import { describe, it, expect, vi } from "vitest";
import { nextFormVersion, planImport, publishPlannedForm, singleApprovalLayer, slugFromFileName, type PublishDeps } from "./formImport";

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

  it("plans a form the site already has as an update when asked to", () => {
    const [byTitle, bySlug] = planImport(
      [{ name: "f1-drilling.form.json", text: FORM }, { name: "f1-painting.form.json", text: FORM.replace("F1 Drilling", "F1 Painting") }],
      [{ Title: "F1 Drilling", Slug: "f1-drilling" }, { Title: "F1 Painting", Slug: "f1-painting" }],
      { updateExisting: true },
    );
    expect(byTitle).toMatchObject({ status: "update", existingTitle: "F1 Drilling" });
    expect(bySlug).toMatchObject({ status: "update", existingTitle: "F1 Painting" });
  });

  it("updates the form under its own name when only the address matches", () => {
    const [plan] = planImport([{ name: "f1-drilling.form.json", text: FORM }], [{ Title: "Drilling (old)", Slug: "f1-drilling" }], { updateExisting: true });
    expect(plan).toMatchObject({ status: "update", existingTitle: "Drilling (old)" });
  });

  it("refuses an update whose title and address belong to two different forms", () => {
    const [plan] = planImport(
      [{ name: "f1-drilling.form.json", text: FORM }],
      [{ Title: "F1 Drilling", Slug: "drilling" }, { Title: "Other", Slug: "f1-drilling" }],
      { updateExisting: true },
    );
    expect(plan.status).toBe("invalid");
    expect(plan.reason).toMatch(/two different forms/);
  });

  it("still skips forms already on the site when updating is off", () => {
    const [plan] = planImport([{ name: "f1-drilling.form.json", text: FORM }], [{ Title: "F1 Drilling", Slug: "f1-drilling" }], { updateExisting: false });
    expect(plan.status).toBe("exists");
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

describe("nextFormVersion", () => {
  it("goes one minor version past the highest version the form has had", () => {
    expect(nextFormVersion("1.0", [])).toBe("1.1");
    expect(nextFormVersion("1.2", ["1.0", "1.4", "1.3"])).toBe("1.5");
    expect(nextFormVersion("2.9", ["1.12"])).toBe("2.10");
    expect(nextFormVersion("", [])).toBe("1.1");
  });
});

describe("publishPlannedForm, updating a form already on the site", () => {
  const CHECKERS = { version: "1.0" as const, layers: [{ layerNumber: 1, type: "approval" as const, authMode: "365" as const, assignee: { type: "user" as const, value: "checker@pmw.test" }, title: "Checking By", confirmationType: "signature" as const, allowRejectionReason: true }] };
  const HEADER = { documentNumber: "PMW-QC-07", revisionNumber: "3", effectiveDate: "2026-01-01" };
  const CONFIG = {
    Id: "9", Title: "F1 Drilling", FormID: "QC-DRILL", NumberOfApprovalLayer: 1, Slug: "f1-drilling", CurrentVersion: "1.2",
    CurrentPublishKey: "default", CurrentPublishLabel: "Shop floor", IsPublished: true, IsPublic: false,
    ConditionField: "", ApprovalRules: "", LayerConfig: JSON.stringify(CHECKERS), ReferenceConfig: '{"prefix":"QC"}', GroupByField: "jobNo",
  };
  const CURRENT = {
    version: "1.2", publishKey: "default", publishLabel: "Shop floor", layerConfig: CHECKERS, surveyJson: {},
    meta: { formId: "QC-DRILL", formVersion: "1.2", publishKey: "default", publishLabel: "Shop floor", documentHeader: HEADER, isoStandards: "ISO 9001", companies: "PMW", companyChoiceEnabled: false, showBanner: false, logoUrl: "logo.png", pdfConfig: { design: "paper" } },
  };

  function fakeDeps() {
    const calls: string[] = [];
    const record = (name: string, value: unknown = "1") => vi.fn(async () => { calls.push(name); return value; });
    const deps = {
      provisionFormList: record("provision"),
      upsertFormConfig: record("config"),
      upsertApprovers: record("approvers"),
      saveFormVersion: record("version"),
      logEvent: record("log"),
      getFormConfigByTitle: record("read-config", CONFIG),
      getFormVersion: record("read-version", CURRENT),
      getFormVersionHistory: record("read-history", [{ FormVersion: "1.0" }, { FormVersion: "1.3" }]),
    } as unknown as PublishDeps;
    return { deps, calls };
  }
  const [plan] = planImport([{ name: "f1-drilling.form.json", text: FORM }], [{ Title: "F1 Drilling", Slug: "f1-drilling" }], { updateExisting: true });
  const options = { layerConfig: singleApprovalLayer("Other step", "someone@pmw.test"), isPublic: true, changedBy: "admin@pmw.test" };

  it("saves the file as the next version, keeping the form's checkers, address, label and header", async () => {
    const { deps } = fakeDeps();
    await publishPlannedForm("t", plan, options, deps);
    expect(deps.saveFormVersion).toHaveBeenCalledWith("t", expect.objectContaining({
      listTitle: "F1 Drilling",
      slug: "f1-drilling",
      version: "1.4",
      publishKey: "default",
      publishLabel: "Shop floor",
      surveyJson: plan.surveyJson,
      layerConfig: CHECKERS,
      meta: expect.objectContaining({ formId: "QC-DRILL", formVersion: "1.4", documentHeader: HEADER, logoUrl: "logo.png", showBanner: false, pdfConfig: { design: "paper" } }),
    }));
  });

  it("never touches the approvers, and points the form at the new version with its workflow unchanged", async () => {
    const { deps, calls } = fakeDeps();
    await publishPlannedForm("t", plan, options, deps);
    expect(deps.upsertApprovers).not.toHaveBeenCalled();
    expect(calls).not.toContain("approvers");
    expect(deps.upsertFormConfig).toHaveBeenCalledWith("t", "F1 Drilling", {
      formId: "QC-DRILL", numLayers: 1, slug: "f1-drilling", version: "1.4",
      currentPublishKey: "default", currentPublishLabel: "Shop floor", isPublished: true, isPublic: false,
      conditionField: "", approvalRules: null, layerConfig: CONFIG.LayerConfig, referenceConfig: CONFIG.ReferenceConfig, groupByField: "jobNo",
    });
  });

  it("adds columns for new questions the way the builder's republish does, with the form's own step count", async () => {
    const { deps, calls } = fakeDeps();
    await publishPlannedForm("t", plan, options, deps);
    expect(deps.provisionFormList).toHaveBeenCalledWith("t", "F1 Drilling", plan.surveyJson, expect.any(Function), { numLayers: 1, minLayerColumns: 3 });
    expect(calls.indexOf("provision")).toBeLessThan(calls.indexOf("version"));
    expect(calls.indexOf("version")).toBeLessThan(calls.indexOf("config"));
    expect(deps.logEvent).toHaveBeenCalledWith("t", expect.objectContaining({ eventType: "PUBLISHED", before: expect.objectContaining({ version: "1.2" }), after: expect.objectContaining({ version: "1.4" }) }));
  });

  it("stops before writing anything when the form has gone from the site", async () => {
    const { deps } = fakeDeps();
    vi.mocked(deps.getFormConfigByTitle).mockResolvedValueOnce(null);
    await expect(publishPlannedForm("t", plan, options, deps)).rejects.toThrow(/no longer on this site/);
    expect(deps.provisionFormList).not.toHaveBeenCalled();
    expect(deps.saveFormVersion).not.toHaveBeenCalled();
  });

  it("stops before writing anything when the current version cannot be read", async () => {
    const { deps } = fakeDeps();
    vi.mocked(deps.getFormVersion).mockResolvedValueOnce(null);
    await expect(publishPlannedForm("t", plan, options, deps)).rejects.toThrow(/current version/);
    expect(deps.saveFormVersion).not.toHaveBeenCalled();
    expect(deps.upsertFormConfig).not.toHaveBeenCalled();
  });
});
