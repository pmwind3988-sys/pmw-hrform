import { describe, expect, it } from "vitest";
import {
  describeApplyResults,
  mergeHarvestIntoProfilePayload,
  profileHarvestObjection,
  type FormProfileRef,
  type ProfileApplyResult,
} from "../directoryHarvestProfile";
import type { DirectoryHarvestSettings } from "../../types";

const HARVEST: DirectoryHarvestSettings = {
  enabled: true,
  nameField: "EmployeeName",
  employeeIdField: "EmployeeId",
  departmentField: "Department",
  companyField: "Company",
  positionField: "Position",
};

/** A stored profile row, shaped as saveFormVersion writes it. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    surveyJson: { pages: [{ elements: [{ name: "EmployeeName", type: "text" }] }] },
    meta: { formId: "PMW-HR-003", formVersion: "1.14" },
    version: "1.14",
    publishKey: "150726training",
    publishLabel: "150726training",
    publishStatus: "active",
    publishExpiresAt: "",
    savedAt: "2026-07-15T02:50:00.000Z",
    changedBy: "ashraf@pmw-group.com",
    layerConfig: {
      version: "1.0",
      layers: [{ layerNumber: 1, type: "evaluation" }],
    },
    ...overrides,
  };
}

function profile(publishKey: string): FormProfileRef {
  return { version: "1.14", publishKey, publishLabel: publishKey, publishStatus: "active" };
}

describe("mergeHarvestIntoProfilePayload", () => {
  it("adds the setting to the profile's layer config", () => {
    const merged = mergeHarvestIntoProfilePayload(payload(), HARVEST);
    expect((merged.layerConfig as Record<string, unknown>).directoryHarvest).toEqual(HARVEST);
  });

  it("leaves the questions exactly as they were", () => {
    const before = payload();
    const merged = mergeHarvestIntoProfilePayload(before, HARVEST);
    expect(merged.surveyJson).toBe(before.surveyJson);
  });

  it("leaves the publish status and expiry alone", () => {
    const merged = mergeHarvestIntoProfilePayload(
      payload({ publishStatus: "off", publishExpiresAt: "2026-12-31T00:00:00.000Z" }),
      HARVEST,
    );
    expect(merged.publishStatus).toBe("off");
    expect(merged.publishExpiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("keeps the workflow that is already there", () => {
    const merged = mergeHarvestIntoProfilePayload(payload(), HARVEST);
    const layerConfig = merged.layerConfig as Record<string, unknown>;
    expect(layerConfig.layers).toEqual([{ layerNumber: 1, type: "evaluation" }]);
    expect(layerConfig.version).toBe("1.0");
  });

  it("carries through keys this app has never heard of", () => {
    // The row is a snapshot written by whichever builder published it. Dropping
    // an unrecognised key would quietly change a live form.
    const merged = mergeHarvestIntoProfilePayload(payload({ somethingNewer: { a: 1 } }), HARVEST);
    expect(merged.somethingNewer).toEqual({ a: 1 });
  });

  it("replaces an earlier harvest setting rather than merging into it", () => {
    const merged = mergeHarvestIntoProfilePayload(
      payload({ layerConfig: { layers: [], directoryHarvest: { enabled: true, nameField: "Old" } } }),
      { enabled: false },
    );
    expect((merged.layerConfig as Record<string, unknown>).directoryHarvest).toEqual({ enabled: false });
  });
});

describe("profileHarvestObjection", () => {
  it("accepts a profile whose workflow has an evaluation step", () => {
    expect(profileHarvestObjection(payload())).toBe("");
  });

  it("accepts an evaluation step inside a manual branch", () => {
    expect(profileHarvestObjection(payload({
      layerConfig: { layers: [], manualBranches: [{ layers: [{ type: "evaluation" }] }] },
    }))).toBe("");
  });

  it("refuses a profile with no workflow saved", () => {
    expect(profileHarvestObjection(payload({ layerConfig: undefined })))
      .toContain("no approval workflow saved");
  });

  it("refuses an approval-only workflow, where nothing would be harvested", () => {
    expect(profileHarvestObjection(payload({ layerConfig: { layers: [{ type: "approval" }] } })))
      .toContain("no evaluation step");
  });

  it("refuses a row it could not read", () => {
    expect(profileHarvestObjection(null)).toContain("could not be read");
    expect(profileHarvestObjection("not json")).toContain("could not be read");
  });
});

describe("describeApplyResults", () => {
  const ok = (key: string): ProfileApplyResult => ({ profile: profile(key), applied: true, problem: "" });
  const bad = (key: string, problem: string): ProfileApplyResult =>
    ({ profile: profile(key), applied: false, problem });

  it("names the profiles it switched on", () => {
    expect(describeApplyResults([ok("150726training"), ok("production")]))
      .toBe("Harvesting is on for 150726training, production.");
  });

  it("says what went wrong when nothing was applied", () => {
    expect(describeApplyResults([bad("production", "no such published profile")]))
      .toBe("production: no such published profile");
  });

  it("reports a partial run as both, rather than as success", () => {
    const line = describeApplyResults([ok("150726training"), bad("production", "could not be saved: 403")]);
    expect(line).toContain("On for 150726training");
    expect(line).toContain("production: could not be saved: 403");
  });
});
