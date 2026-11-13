/**
 * The strict read of the workflow a submission was made under: exactly its own
 * version and profile, with the default profile's questions for a non-default
 * profile (as `queryWebFormVersion` serves them), and a throw, never a quiet
 * fallback, when a read fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({
  queryListItemByFields: vi.fn(),
  queryWebFormVersion: vi.fn(),
}));
vi.mock("./graphClient.js", () => graph);

const { loadSubmissionLayerConfig } = await import("./submissionLayerConfig.js");

const FORM = "Training Evaluation Form";
const PROFILE_LAYERS = { layers: [{ layerNumber: 1, title: "Profile step" }] };
const STALE = { pages: [{ elements: [{ name: "oldQuestion" }] }] };
const CURRENT = { pages: [{ elements: [{ name: "employeeName" }] }] };
const master = { CurrentVersion: "1.0", LayerConfig: JSON.stringify({ layers: [{ layerNumber: 1, title: "Master step" }] }) };

const versionRow = (surveyJson: unknown, layerConfig?: unknown) =>
  ({ id: "1", fields: { SurveyJSON: JSON.stringify({ surveyJson, ...(layerConfig ? { layerConfig } : {}) }) } });

function byKey(rows: Record<string, unknown>) {
  graph.queryListItemByFields.mockImplementation(async (_t: string, _l: string, filter: { PublishKey?: string }) => {
    const found = rows[filter.PublishKey ?? ""];
    if (found instanceof Error) throw found;
    return found ?? null;
  });
}

const strict = (item: Record<string, unknown>) =>
  loadSubmissionLayerConfig("tok", FORM, master, item, { strict: true });

beforeEach(() => vi.clearAllMocks());

describe("loadSubmissionLayerConfig, strict", () => {
  it("takes a non-default profile's workflow and the default profile's questions", async () => {
    byKey({ "hr-only": versionRow(STALE, PROFILE_LAYERS), production: versionRow(CURRENT) });
    const loaded = await strict({ FormVersion: "1.0", PublishKey: "hr-only" });
    expect(loaded.layerConfig).toEqual(PROFILE_LAYERS);
    expect(loaded.surveyJson).toEqual(CURRENT);
    expect(graph.queryWebFormVersion).not.toHaveBeenCalled();
  });

  it("throws when the default profile cannot be read", async () => {
    byKey({ "hr-only": versionRow(STALE, PROFILE_LAYERS), production: new Error("Graph GET 503") });
    await expect(strict({ FormVersion: "1.0", PublishKey: "hr-only" })).rejects.toThrow("503");
  });

  it("keeps the profile's own questions when there is no default profile, as the reviewer page does", async () => {
    byKey({ "hr-only": versionRow(STALE, PROFILE_LAYERS) });
    await expect(strict({ FormVersion: "1.0", PublishKey: "hr-only" })).resolves.toMatchObject({ surveyJson: STALE });
  });

  it("throws, rather than using the Master Form, when the recorded version is missing or unreadable", async () => {
    byKey({});
    await expect(strict({ FormVersion: "1.0", PublishKey: "hr-only" })).rejects.toThrow("could not be read");
    byKey({ "hr-only": new Error("Graph GET 503") });
    await expect(strict({ FormVersion: "1.0", PublishKey: "hr-only" })).rejects.toThrow("503");
  });

  it("uses the Master Form for a row with no version, or a version with no workflow of its own", async () => {
    await expect(strict({})).resolves.toMatchObject({ layerConfig: { layers: [{ title: "Master step" }] }, surveyJson: null });
    byKey({ production: versionRow(CURRENT) });
    await expect(strict({ FormVersion: "1.0", PublishKey: "production" }))
      .resolves.toMatchObject({ layerConfig: { layers: [{ title: "Master step" }] }, surveyJson: CURRENT });
    expect(graph.queryListItemByFields).toHaveBeenCalledTimes(1);
  });
});
