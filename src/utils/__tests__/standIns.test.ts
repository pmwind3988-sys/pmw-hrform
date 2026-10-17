/**
 * Acting on someone's behalf: a PA set on the CEO's Approval Directory row is
 * asked alongside the CEO, may decide, and is recorded as themselves "on behalf
 * of" the CEO. These pin each half — who gets added, who counts as standing in,
 * what the email says, what the record keeps, and that a paper form prints it
 * without moving a line.
 */
import { describe, expect, it } from "vitest";
import {
  addStandIns,
  describeStandIns,
  isStandInFor,
  resolveLayerAssignee,
  standInEmailNote,
  standInPrincipal,
  standInsOf,
  type DirectoryPerson,
  type ResolvableLayer,
} from "../resolveAssignee";
import { readOnBehalfOf, serializeOnBehalfOf } from "../layerRecipients";
import { onBehalfOfLine } from "../signOff";
import { directoryItemBody, type ApprovalDirectoryInput } from "../approvalDirectory";
import { mapDirectoryColumns } from "../approvalDirectorySchema";
import { planDirectoryImport } from "../approvalDirectoryCsv";
import { resolutionContextFromItem } from "../../components/builder/workflowChainContext";
import { buildPaperDocument, type PaperBlock } from "../paperPdf/paperLayout";
import { TRAINING_REQUISITION_SAMPLE } from "../paperPdf/trainingFormSamples";

const CEO: DirectoryPerson = {
  email: "ceo@pmw.com",
  name: "Dato' Ahmad Faiz",
  department: "Management",
  position: "Chief Executive Officer",
  approverEmail: "",
  delegateEmails: ["pa@pmw.com"],
};
const PA: DirectoryPerson = {
  email: "pa@pmw.com",
  name: "Nurul Huda",
  department: "Management",
  position: "Personal Assistant",
  approverEmail: "ceo@pmw.com",
};
const HOD: DirectoryPerson = {
  email: "hod@pmw.com",
  name: "Goh Kok Leong",
  department: "Engineering",
  position: "HOD",
  approverEmail: "ceo@pmw.com",
};

const people = new Map([CEO, PA, HOD].map((person) => [person.email, person]));
const ports = {
  lookupPerson: async (email: string) => people.get(email.toLowerCase()) ?? null,
  lookupDepartmentApprover: async () => ({ email: "", name: "" }),
  expandDistributionList: async () => [],
};

const userLayer = (value: string): ResolvableLayer => ({
  layerNumber: 2,
  title: "CEO approval",
  authMode: "365",
  assignee: { type: "user", value },
});

describe("standInsOf / isStandInFor", () => {
  it("reads who may act for a person off their row, leaving out themselves and anyone already acting", () => {
    expect(standInsOf(CEO)).toEqual(["pa@pmw.com"]);
    expect(standInsOf({ ...CEO, delegateEmails: ["ceo@pmw.com", "PA@pmw.com", "not an email"] })).toEqual(["PA@pmw.com"]);
    expect(standInsOf(CEO, ["pa@pmw.com"])).toEqual([]);
    expect(standInsOf(null)).toEqual([]);
  });

  it("counts only a different person named on the principal's row", () => {
    expect(isStandInFor("PA@pmw.com", CEO)).toBe(true);
    expect(isStandInFor("ceo@pmw.com", CEO)).toBe(false);
    expect(isStandInFor("hod@pmw.com", CEO)).toBe(false);
    expect(isStandInFor("pa@pmw.com", HOD)).toBe(false);
  });
});

describe("addStandIns", () => {
  it("adds the CEO's PA to a step that lands on the CEO, and says why", async () => {
    const resolved = await resolveLayerAssignee(userLayer("ceo@pmw.com"), {}, ports);
    expect(resolved.email).toBe("ceo@pmw.com");
    expect(resolved.emails).toEqual(["ceo@pmw.com", "pa@pmw.com"]);
    expect(resolved.standIns).toEqual([{ email: "pa@pmw.com", forEmail: "ceo@pmw.com", forName: "Dato' Ahmad Faiz" }]);
    expect(resolved.explanation).toContain("pa@pmw.com may act on behalf of Dato' Ahmad Faiz");
  });

  it("leaves a step on somebody with no stand-in exactly as it was", async () => {
    const resolved = await resolveLayerAssignee(userLayer("hod@pmw.com"), {}, ports);
    expect(resolved.emails).toEqual(["hod@pmw.com"]);
    expect(resolved.standIns).toBeUndefined();
  });

  it("never adds anyone to a parked or failed step, or to a distribution list", async () => {
    const parked = { email: "", name: "", emails: [], parked: { reason: "x" } };
    expect(await addStandIns(parked, "chain", ports)).toBe(parked);
    const list = { email: "ceo@pmw.com", name: "", emails: ["ceo@pmw.com"] };
    expect(await addStandIns(list, "distribution-list", ports)).toBe(list);
  });

  it("routes as before when the directory cannot be read", async () => {
    const broken = { lookupPerson: async () => { throw new Error("SharePoint is down"); } };
    const resolved = await addStandIns({ email: "ceo@pmw.com", name: "", emails: ["ceo@pmw.com"] }, "user", broken);
    expect(resolved.emails).toEqual(["ceo@pmw.com"]);
  });
});

describe("standInPrincipal", () => {
  it("names the CEO when their PA signs the CEO's step", async () => {
    expect(await standInPrincipal(ports, "pa@pmw.com", "ceo@pmw.com")).toEqual({
      email: "ceo@pmw.com",
      name: "Dato' Ahmad Faiz",
      position: "Chief Executive Officer",
    });
  });

  it("records the CEO's own decision, and an unrelated co-assignee's, as their own", async () => {
    expect(await standInPrincipal(ports, "ceo@pmw.com", "ceo@pmw.com")).toBeNull();
    expect(await standInPrincipal(ports, "hod@pmw.com", "ceo@pmw.com")).toBeNull();
    expect(await standInPrincipal(ports, "pa@pmw.com", "")).toBeNull();
  });
});

describe("the request email", () => {
  it("tells both readers either can act, and that the first to do so completes the step", () => {
    expect(describeStandIns("Dato' Ahmad Faiz", ["Nurul Huda"], "approval")).toBe(
      "Sent to Dato' Ahmad Faiz and to Nurul Huda, who can act on Dato' Ahmad Faiz's behalf. "
        + "Either of you can approve. Whoever does it first completes this step.",
    );
    expect(describeStandIns("Ali", ["Siti", "Mei"], "evaluation")).toContain("Siti and Mei, who each can act");
    expect(describeStandIns("Ali", [], "approval")).toBe("");
  });

  it("only says so when the stand-in is actually on the email", async () => {
    expect(await standInEmailNote(ports, "ceo@pmw.com", ["ceo@pmw.com", "pa@pmw.com"], "approval")).toContain("Nurul Huda");
    expect(await standInEmailNote(ports, "ceo@pmw.com", ["ceo@pmw.com"], "approval")).toBeUndefined();
    expect(await standInEmailNote(ports, "hod@pmw.com", ["hod@pmw.com", "x@pmw.com"], "approval")).toBeUndefined();
  });
});

describe("the on-behalf record", () => {
  it("round-trips through its column and prints as one line", () => {
    const stored = serializeOnBehalfOf({ email: "ceo@pmw.com", name: "Dato' Ahmad Faiz", position: "Chief Executive Officer" });
    const record = readOnBehalfOf({ L2_OnBehalfOf: stored }, 2);
    expect(record).toEqual({ email: "ceo@pmw.com", name: "Dato' Ahmad Faiz", position: "Chief Executive Officer" });
    expect(onBehalfOfLine(record)).toBe("On behalf of Dato' Ahmad Faiz, Chief Executive Officer");
  });

  it("reads as signed in person when the column is empty, missing or unreadable", () => {
    expect(readOnBehalfOf({}, 2)).toBeNull();
    expect(readOnBehalfOf({ L2_OnBehalfOf: "not json" }, 2)).toBeNull();
    expect(onBehalfOfLine(null)).toBe("");
  });

  it("routes the next step from the person the PA stood in for, not from the PA", () => {
    const item = {
      SubmittedBy: "staff@pmw.com",
      L1_ActedBy: "pa@pmw.com",
      L1_Email: "ceo@pmw.com",
      L1_OnBehalfOf: serializeOnBehalfOf({ email: "ceo@pmw.com", name: "Dato' Ahmad Faiz", position: "" }),
    };
    expect(resolutionContextFromItem(item, 2).previousActorEmail).toBe("ceo@pmw.com");
    expect(resolutionContextFromItem({ ...item, L1_OnBehalfOf: "" }, 2).previousActorEmail).toBe("pa@pmw.com");
  });
});

describe("setting it up in the directory", () => {
  const input: ApprovalDirectoryInput = {
    personEmail: "ceo@pmw.com",
    personName: "Dato' Ahmad Faiz",
    department: "",
    company: "",
    position: "",
    employeeId: "",
    approverEmail: "",
    isActive: true,
  };
  const map = mapDirectoryColumns(["PersonEmail", "ApproverEmail", "DelegateEmails"].map((name) => ({ key: name, aliases: [name] })));

  it("saves the stand-ins lowercased and ;-separated", () => {
    expect(directoryItemBody({ ...input, delegateEmails: "PA@pmw.com, other@pmw.com" }, false, map).DelegateEmails)
      .toBe("pa@pmw.com; other@pmw.com");
  });

  it("leaves what HR set alone when a write knows nothing about stand-ins", () => {
    expect("DelegateEmails" in directoryItemBody(input, false, map)).toBe(false);
  });

  it("imports them from a spreadsheet column, and leaves them alone when the file has none", () => {
    const withColumn = planDirectoryImport("PersonEmail,ApproverEmail,DelegateEmails\r\nceo@pmw.com,,pa@pmw.com", []);
    expect(withColumn.rows[0].input.delegateEmails).toBe("pa@pmw.com");
    const without = planDirectoryImport("PersonEmail,ApproverEmail\r\nceo@pmw.com,", []);
    expect(without.rows[0].input.delegateEmails).toBeUndefined();
    const bad = planDirectoryImport("PersonEmail,ApproverEmail,DelegateEmails\r\nceo@pmw.com,,ceo@pmw.com", []);
    expect(bad.rows[0].action).toBe("error");
  });
});

describe("the paper form", () => {
  it("carries the note on the stand-in's own sign-off column and nowhere else", () => {
    const data = structuredClone(TRAINING_REQUISITION_SAMPLE);
    data.layerResults![1] = {
      ...data.layerResults![1],
      status: "Approved",
      signedAt: "2026-10-22T03:00:00.000Z",
      signerName: "Nurul Huda",
      signerPosition: "Personal Assistant",
      onBehalfOf: { email: "ghrh@example.com", name: "Wong Chiew Yee", position: "GHRH" },
    };
    const doc = buildPaperDocument(data, { fmtDay: (iso) => iso.slice(0, 10), fmtDateTime: (iso) => iso, control: [], title: "Training Requisition Form" });
    const row = doc.sections.flatMap((s) => s.blocks).find((b): b is Extract<PaperBlock, { kind: "signoffRow" }> => b.kind === "signoffRow");
    expect(row?.columns.map((c) => c.onBehalfOf)).toEqual([undefined, undefined, "On behalf of Wong Chiew Yee, GHRH"]);
    expect(row?.columns[2].name).toBe("Nurul Huda");
  });
});
