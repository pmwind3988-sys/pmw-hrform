import { describe, expect, it } from "vitest";

import { lookupSubmitterName, resolveTrainingTitle } from "./applicantName.js";
import { renderActionRequestEmail, requestSubmitterName } from "./workflowEmailTemplate.js";

describe("training title and submitter on request emails", () => {
  it("reads the course from the trainingTitle question, whatever SharePoint calls the column", () => {
    expect(resolveTrainingTitle({ trainingTitle: "Fire Safety Briefing" })).toBe("Fire Safety Briefing");
    expect(resolveTrainingTitle({ Training_x0020_Title: "First Aid" })).toBe("First Aid");
    expect(resolveTrainingTitle({ Title: "Leave" })).toBe("");
  });

  it("names the submitter beside their address", () => {
    expect(requestSubmitterName("siti@pmw-group.com", "Ali", "Siti Aminah")).toBe("Siti Aminah (siti@pmw-group.com)");
    expect(requestSubmitterName("siti@pmw-group.com", "Ali")).toBe("siti@pmw-group.com");
    expect(requestSubmitterName("GUEST", "Ali", "Nobody")).toBe("Ali");
  });

  it("looks the name up in the directory and never fails the email for it", async () => {
    const directory = (name: string | null) => ({ lookupPerson: async () => (name === null ? null : { name }) });
    expect(await lookupSubmitterName(directory("Siti Aminah"), "siti@pmw-group.com")).toBe("Siti Aminah");
    expect(await lookupSubmitterName(directory(null), "siti@pmw-group.com")).toBe("");
    expect(await lookupSubmitterName({ lookupPerson: async () => { throw new Error("down"); } }, "siti@pmw-group.com")).toBe("");
    expect(await lookupSubmitterName(directory("x"), "GUEST")).toBe("");
  });

  it("prints a Training row only when there is a course", () => {
    const base = {
      formTitle: "Training Evaluation", submittedBy: "siti@pmw-group.com", responseItemId: 42,
      layer: 2, totalLayers: 2, layerType: "evaluation" as const, reviewLink: "https://app/eval/x/42/2",
    };
    const body = renderActionRequestEmail({ ...base, trainingTitle: "Fire Safety Briefing", submitterName: "Siti Aminah" });
    expect(body).toContain("Fire Safety Briefing");
    expect(body).toContain("Siti Aminah (siti@pmw-group.com)");
    expect(renderActionRequestEmail(base)).not.toContain(">Training<");
  });
});
