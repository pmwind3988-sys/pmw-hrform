import { afterEach, describe, expect, it, vi } from "vitest";
import { sortAccessLogEntries, type AccessLogEntry } from "./learningAccessLog.js";

function entry(email: string, viewedAt: string): AccessLogEntry {
  return {
    email,
    viewerName: email,
    viewerPosition: "Contractor",
    viewerDepartment: "Operations",
    materialId: `m-${email}`,
    materialName: "Material",
    viewedAt,
  };
}

describe("access log ordering", () => {
  it("puts the most recent view first", () => {
    const sorted = sortAccessLogEntries([
      entry("ali", "2026-03-01T08:00:00.000Z"),
      entry("siti", "2026-03-05T08:00:00.000Z"),
      entry("chong", "2026-02-20T08:00:00.000Z"),
    ]);
    expect(sorted.map((row) => row.email)).toEqual(["siti", "ali", "chong"]);
  });

  it("orders by time of day, not just by date", () => {
    const sorted = sortAccessLogEntries([
      entry("morning", "2026-03-01T02:00:00.000Z"),
      entry("evening", "2026-03-01T21:30:00.000Z"),
    ]);
    expect(sorted.map((row) => row.email)).toEqual(["evening", "morning"]);
  });

  it("sinks rows with no timestamp instead of floating them to the top", () => {
    // An empty string sorts below every ISO timestamp, so a naive descending
    // comparison would head the report with the rows that say the least.
    const sorted = sortAccessLogEntries([
      entry("unknown", ""),
      entry("ali", "2026-03-01T08:00:00.000Z"),
      entry("alsounknown", ""),
      entry("siti", "2026-03-05T08:00:00.000Z"),
    ]);
    expect(sorted.slice(0, 2).map((row) => row.email)).toEqual(["siti", "ali"]);
    expect(sorted.slice(2).map((row) => row.viewedAt)).toEqual(["", ""]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [entry("ali", "2026-03-01T08:00:00.000Z"), entry("siti", "2026-03-05T08:00:00.000Z")];
    sortAccessLogEntries(input);
    expect(input.map((row) => row.email)).toEqual(["ali", "siti"]);
  });
});

describe("reading the access log", () => {
  async function loadWithRows(queryAllListItems: () => Promise<unknown>) {
    vi.resetModules();
    vi.doMock("./logger.js", () => ({ logWarn: vi.fn(), logError: vi.fn(), logInfo: vi.fn() }));
    vi.doMock("./graphClient.js", () => ({ createListItem: vi.fn(), queryAllListItems }));
    vi.doMock("./sharepointRest.js", () => ({
      ensureListViaSPRest: vi.fn(),
      ensureTextFieldViaSPRest: vi.fn(),
    }));
    return import("./learningAccessLog.js");
  }

  afterEach(() => {
    vi.doUnmock("./graphClient.js");
    vi.doUnmock("./logger.js");
    vi.doUnmock("./sharepointRest.js");
    vi.resetModules();
  });

  it("reads an unprovisioned list as an empty trail", async () => {
    const { readAccessLog } = await loadWithRows(async () => {
      throw new Error('List "Learning Access Log" not found');
    });

    expect(await readAccessLog("graph-token")).toEqual([]);
  });

  it("raises any other failure instead of reporting that nobody opened anything", async () => {
    // The dangerous case: an audit trail that answers "no entries" when what it
    // means is "I could not look".
    const { readAccessLog } = await loadWithRows(async () => {
      throw new Error("Graph GET 503: service unavailable");
    });

    await expect(readAccessLog("graph-token")).rejects.toThrow(/could not be read from SharePoint/);
  });

  it("drops rows missing the fields that identify a view", async () => {
    const { readAccessLog } = await loadWithRows(async () => [
      { id: "1", fields: { Title: "nurul.aisyah", MaterialId: "m1", MaterialName: "Fire Safety", ViewedAt: "2026-03-03T01:00:00.000Z" } },
      { id: "2", fields: { Title: "", MaterialId: "m2" } },
    ]);

    const entries = await readAccessLog("graph-token");
    expect(entries).toHaveLength(1);
    expect(entries[0].materialName).toBe("Fire Safety");
  });
});
