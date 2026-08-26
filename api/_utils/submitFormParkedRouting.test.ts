/**
 * The guarantee this feature exists for: a submission is never refused because
 * the directory has no approver or evaluator for the submitter's department.
 *
 * Exercised through the real routing step in submit-form.ts, with only the
 * Graph reads stubbed, so the assertions cover the code the live public/QR path
 * actually runs rather than a re-description of it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const queryListItems = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getListColumns = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

vi.mock("../_utils/graphClient.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  queryListItems: (...args: unknown[]) => queryListItems(...args),
  getListColumns: (...args: unknown[]) => getListColumns(...args),
}));

const { __test__ } = await import("../submit-form.ts");

function departmentLayerConfig(departmentField = "Department") {
  return {
    layers: [
      {
        layerNumber: 1,
        type: "evaluation" as const,
        authMode: "365" as const,
        title: "Evaluation",
        emailSchedule: { mode: "three_months" as const },
        assignee: { type: "department-approver", value: departmentField },
      },
    ],
  };
}

function submissionBody() {
  return {
    Department: "Finance",
    SubmittedBy: "GUEST",
    EmployeeName: "Ali",
  } as Record<string, unknown>;
}

describe("a submission whose department has no approver", () => {
  beforeEach(() => {
    queryListItems.mockReset();
    getListColumns.mockReset();
    getListColumns.mockResolvedValue([]);
  });

  it("is kept and parked when the directory holds no row for the department", async () => {
    queryListItems.mockResolvedValue([]);
    const body = submissionBody();

    await expect(
      __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never),
    ).resolves.toBeUndefined();

    expect(body.FormStatus).toBe("Submitted");
    expect(body.L1_Status).toBe("Needs Routing");
    expect(body.CurrentLayer).toBe(1);
    expect(String(body.RoutingNotes)).toContain("Finance");
    // Nobody may act on it yet, which is the point of parking it.
    expect(body.L1_Email).toBe("");
  });

  it("is kept and parked when two rows claim the same department", async () => {
    queryListItems.mockResolvedValue([
      { fields: { ApproverEmail: "a@pmw.com" } },
      { fields: { ApproverEmail: "b@pmw.com" } },
    ]);
    const body = submissionBody();

    await __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never);

    expect(body.L1_Status).toBe("Needs Routing");
    expect(body.FormStatus).toBe("Submitted");
  });

  it("is kept and parked when the row holds an unusable address", async () => {
    queryListItems.mockResolvedValue([{ fields: { ApproverEmail: "not-an-address" } }]);
    const body = submissionBody();

    await __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never);

    expect(body.L1_Status).toBe("Needs Routing");
    expect(body.FormStatus).toBe("Submitted");
  });

  it("is kept and parked when the directory list cannot be read at all", async () => {
    // A missing list, or a transient Graph failure. Refusing here would lose a
    // submission over an outage the person filling the form cannot see.
    queryListItems.mockRejectedValue(new Error("Graph 503 serviceUnavailable"));
    const body = submissionBody();

    await __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never);

    expect(body.L1_Status).toBe("Needs Routing");
    expect(body.FormStatus).toBe("Submitted");
    expect(String(body.RoutingNotes)).toContain("Graph 503");
  });

  it("is kept and parked when the department question was left blank", async () => {
    queryListItems.mockResolvedValue([]);
    const body: Record<string, unknown> = { ...submissionBody(), Department: "" };

    await __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never);

    expect(body.L1_Status).toBe("Needs Routing");
    expect(body.FormStatus).toBe("Submitted");
  });

  it("routes normally when the directory does have an answer", async () => {
    queryListItems.mockResolvedValue([
      { fields: { ApproverEmail: "siti@pmw.com", ApproverName: "Siti" } },
    ]);
    const body = submissionBody();

    await __test__.applyLayerConfigWorkflow("token", body, departmentLayerConfig() as never);

    expect(body.L1_Status).toBe("Pending");
    expect(body.L1_Email).toBe("siti@pmw.com");
    expect(body.RoutingNotes).toBeUndefined();
  });

  it("still refuses a layer whose department field the builder never chose", async () => {
    // A builder mistake, not a directory gap: worth surfacing at the moment it
    // bites rather than quietly filling an admin queue.
    queryListItems.mockResolvedValue([]);

    await expect(
      __test__.applyLayerConfigWorkflow("token", submissionBody(), departmentLayerConfig("") as never),
    ).rejects.toThrow(/department field/);
  });
});
