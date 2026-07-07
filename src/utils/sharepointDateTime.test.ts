import { describe, expect, it } from "vitest";

import { toSharePointMalaysiaDateTime } from "./sharepointDateTime";

describe("toSharePointMalaysiaDateTime", () => {
  it("preserves Malaysia local datetime fields when SharePoint displays stored UTC values", () => {
    expect(toSharePointMalaysiaDateTime("2026-06-22T10:00")).toBe("2026-06-22T02:00:00.000Z");
    expect(toSharePointMalaysiaDateTime("2026-06-22T18:00")).toBe("2026-06-22T10:00:00.000Z");
  });

  it("keeps explicit timezone values as the same instant", () => {
    expect(toSharePointMalaysiaDateTime("2026-06-22T10:00:00+08:00")).toBe("2026-06-22T02:00:00.000Z");
  });
});
