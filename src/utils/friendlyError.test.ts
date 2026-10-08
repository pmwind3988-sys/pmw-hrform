import { describe, expect, it } from "vitest";
import { classifyFailure, describeFailure, statusFromError } from "./friendlyError";

describe("statusFromError", () => {
  it("reads a status property", () => {
    expect(statusFromError({ status: 502 })).toBe(502);
  });

  it("reads the shapes the services write", () => {
    expect(statusFromError(new Error("Failed to load learning materials (502)"))).toBe(502);
    expect(statusFromError(new Error("Server returned status 404: nope"))).toBe(404);
    expect(statusFromError(new Error("Failed to load dashboard background: 503"))).toBe(503);
    expect(statusFromError("HTTP 403")).toBe(403);
  });

  it("ignores numbers that are not error statuses", () => {
    expect(statusFromError(new Error("Loaded 157 rows"))).toBeNull();
    expect(statusFromError(new Error("Report for 2026"))).toBeNull();
    expect(statusFromError({ status: 200 })).toBeNull();
  });
});

describe("classifyFailure", () => {
  it("puts offline first, whatever the status", () => {
    expect(classifyFailure({ status: 502, online: false })).toBe("offline");
  });

  it("treats a server error as the server's problem, not 'not found'", () => {
    expect(classifyFailure({ status: 502, online: true })).toBe("unreachable");
  });

  it("recognises a request that never got an answer", () => {
    expect(classifyFailure({ error: new TypeError("Failed to fetch"), online: true })).toBe("unreachable");
  });

  it("separates missing from forbidden", () => {
    expect(classifyFailure({ status: 404, online: true })).toBe("not-found");
    expect(classifyFailure({ status: 403, online: true })).toBe("no-access");
    expect(classifyFailure({ status: 410, online: true })).toBe("gone");
  });
});

describe("describeFailure", () => {
  it("names the thing and never leads with a code", () => {
    const copy = describeFailure("openings", { status: 502, online: true });
    expect(copy.title).toBe("Openings didn't load");
    expect(copy.body).not.toMatch(/connection\.?$/);
    expect(copy.body).toMatch(/on our side/);
    expect(copy.code).toBe("HTTP 502");
  });

  it("does not blame the network for a server error", () => {
    expect(describeFailure("this form", { status: 500, online: true }).body).not.toMatch(/check your connection/i);
  });

  it("leaves the code empty when there is none", () => {
    expect(describeFailure("this form", { error: new Error("boom"), online: true }).code).toBe("");
  });
});
