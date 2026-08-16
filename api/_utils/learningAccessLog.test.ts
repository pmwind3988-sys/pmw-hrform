import { describe, expect, it } from "vitest";
import { sortAccessLogEntries, type AccessLogEntry } from "./learningAccessLog.js";

function entry(loginId: string, viewedAt: string): AccessLogEntry {
  return { loginId, viewerName: loginId, materialId: `m-${loginId}`, materialName: "Material", viewedAt };
}

describe("access log ordering", () => {
  it("puts the most recent view first", () => {
    const sorted = sortAccessLogEntries([
      entry("ali", "2026-03-01T08:00:00.000Z"),
      entry("siti", "2026-03-05T08:00:00.000Z"),
      entry("chong", "2026-02-20T08:00:00.000Z"),
    ]);
    expect(sorted.map((row) => row.loginId)).toEqual(["siti", "ali", "chong"]);
  });

  it("orders by time of day, not just by date", () => {
    const sorted = sortAccessLogEntries([
      entry("morning", "2026-03-01T02:00:00.000Z"),
      entry("evening", "2026-03-01T21:30:00.000Z"),
    ]);
    expect(sorted.map((row) => row.loginId)).toEqual(["evening", "morning"]);
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
    expect(sorted.slice(0, 2).map((row) => row.loginId)).toEqual(["siti", "ali"]);
    expect(sorted.slice(2).map((row) => row.viewedAt)).toEqual(["", ""]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [entry("ali", "2026-03-01T08:00:00.000Z"), entry("siti", "2026-03-05T08:00:00.000Z")];
    sortAccessLogEntries(input);
    expect(input.map((row) => row.loginId)).toEqual(["ali", "siti"]);
  });
});
