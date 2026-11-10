import { describe, expect, it } from "vitest";
import { chunkPeople, joinPeople, peopleProblem, readPeople, singleLine, tidyPeople } from "./needsPeople";

describe("Training Needs Analysis people on one row", () => {
  it("reads each line of Emp. ID beside the same line of Name", () => {
    expect(readPeople("PMW0211\nPMW0305", "Tan Mei Ling\nNur Aisyah")).toEqual([
      { id: "PMW0211", name: "Tan Mei Ling" },
      { id: "PMW0305", name: "Nur Aisyah" },
    ]);
    // An older row: one person, and a row nobody wrote on still has a line to write on.
    expect(readPeople("PMW0388", "Ravi Kumar")).toEqual([{ id: "PMW0388", name: "Ravi Kumar" }]);
    expect(readPeople(undefined, undefined)).toEqual([{ id: "", name: "" }]);
    // A missing ID keeps its line, so the names below it do not move up.
    expect(readPeople("PMW0211", "Tan\nRavi")).toEqual([{ id: "PMW0211", name: "Tan" }, { id: "", name: "Ravi" }]);
  });

  it("stores the lines joined, and nothing for a row of blank lines", () => {
    expect(joinPeople([{ id: "A1", name: "Tan" }, { id: "", name: "" }])).toEqual({ id: "A1\n", name: "Tan\n" });
    expect(joinPeople([{ id: " ", name: "" }, { id: "", name: "" }])).toEqual({ id: "", name: "" });
  });

  it("drops the lines nobody wrote on", () => {
    expect(tidyPeople([{ id: " A1 ", name: "Tan " }, { id: "", name: " " }, { id: "A2", name: "Ravi" }])).toEqual([
      { id: "A1", name: "Tan" },
      { id: "A2", name: "Ravi" },
    ]);
  });

  it("flags a line with only an ID or only a name once a row holds several people", () => {
    expect(peopleProblem([{ id: "A1", name: "Tan" }, { id: "A2", name: "" }])).toBe("Line 2 has an Emp. ID but no name.");
    expect(peopleProblem([{ id: "", name: "Tan" }, { id: "A2", name: "Ravi" }])).toBe("Line 1 has a name but no Emp. ID.");
    expect(peopleProblem([{ id: "A1", name: "Tan" }, { id: "", name: "" }])).toBe("");
    // One person per row was never checked, and still is not.
    expect(peopleProblem([{ id: "", name: "Tan" }])).toBe("");
  });

  it("keeps Training Needs to one line", () => {
    expect(singleLine("ISO 9001\n  internal auditing")).toBe("ISO 9001 internal auditing");
    expect(singleLine("First aid")).toBe("First aid");
  });

  it("splits a row whose people overrun SharePoint's 255 characters", () => {
    const people = Array.from({ length: 12 }, (_, i) => ({ id: `PMW${String(i).padStart(4, "0")}`, name: `Muhammad Hafizuddin bin Abdul ${i}` }));
    const chunks = chunkPeople(people);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(people);
    for (const chunk of chunks) {
      expect(chunk.map((p) => p.name).join("\n").length).toBeLessThanOrEqual(255);
      expect(chunk.map((p) => p.id).join("\n").length).toBeLessThanOrEqual(255);
    }
    expect(chunkPeople(people.slice(0, 3))).toEqual([people.slice(0, 3)]);
  });
});
