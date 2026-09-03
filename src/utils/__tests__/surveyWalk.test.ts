import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { forEachSurveyElement } from "../surveyWalk";

/** The names visited, in order, for a given schema. */
function namesIn(surveyJson: unknown): string[] {
  const seen: string[] = [];
  forEachSurveyElement(surveyJson, (element) => {
    const name = element.name;
    if (typeof name === "string" && name) seen.push(name);
  });
  return seen;
}

describe("forEachSurveyElement", () => {
  it("visits the top level of every page", () => {
    expect(namesIn({
      pages: [
        { elements: [{ name: "a" }, { name: "b" }] },
        { elements: [{ name: "c" }] },
      ],
    })).toEqual(["a", "b", "c"]);
  });

  it("goes inside a panel, and the panel itself", () => {
    expect(namesIn({
      pages: [{ elements: [{ type: "panel", name: "p", elements: [{ name: "inner" }] }] }],
    })).toEqual(["p", "inner"]);
  });

  it("goes inside a column layout, which none of the old traversals did", () => {
    // The bug this module exists for: a Company dropdown two columns deep came
    // back empty for a public submitter and populated for a colleague.
    expect(namesIn({
      pages: [{
        elements: [{
          type: "columns",
          name: "cols",
          columns: [
            { elements: [{ name: "left" }] },
            { elements: [{ name: "right" }] },
          ],
        }],
      }],
    })).toEqual(["cols", "left", "right"]);
  });

  it("goes inside a repeater's template", () => {
    expect(namesIn({
      pages: [{ elements: [{ type: "paneldynamic", name: "rep", templateElements: [{ name: "row" }] }] }],
    })).toEqual(["rep", "row"]);
  });

  it("reaches a question nested several containers deep", () => {
    expect(namesIn({
      pages: [{
        elements: [{
          type: "panel", name: "outer",
          elements: [{
            type: "columns", name: "cols",
            columns: [{ elements: [{ type: "panel", name: "inner", elements: [{ name: "deep" }] }] }],
          }],
        }],
      }],
    })).toEqual(["outer", "cols", "inner", "deep"]);
  });

  it("leaves a dynamic matrix's columns alone — those are cells, not containers", () => {
    // They carry their own choices and have no elements to recurse into; the
    // caller handles them, because only it knows whether it handles matrices.
    expect(namesIn({
      pages: [{
        elements: [{
          type: "matrixdynamic",
          name: "matrix",
          columns: [{ name: "col1", cellType: "text" }, { name: "col2", cellType: "dropdown" }],
        }],
      }],
    })).toEqual(["matrix"]);
  });

  it("reads the stored envelope as readily as a bare schema", () => {
    expect(namesIn({ surveyJson: { pages: [{ elements: [{ name: "a" }] }] } })).toEqual(["a"]);
  });

  it("reaches questions on a schema with no pages", () => {
    expect(namesIn({ elements: [{ name: "a" }] })).toEqual(["a"]);
  });

  it("visits nothing, rather than throwing, on anything malformed", () => {
    for (const schema of [null, undefined, "text", 42, [], {}, { pages: "no" }, { pages: [null] }]) {
      expect(namesIn(schema)).toEqual([]);
    }
  });

  it("skips array entries that are not elements", () => {
    expect(namesIn({ pages: [{ elements: [null, "x", { name: "a" }] }] })).toEqual(["a"]);
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n").split("\n");

    const client = read("src/utils/surveyWalk.ts");
    const server = read("api/_utils/surveyWalk.ts");

    expect(server.length).toBe(client.length);
    const differing = client
      .map((line, index) => (line === server[index] ? null : index))
      .filter((index): index is number => index !== null);

    // Divergence here is exactly the bug this module replaced: a question
    // reached by one side and not the other.
    expect(differing.length).toBe(1);
    expect(client[differing[0]]).toContain("api/_utils/surveyWalk.ts");
  });
});
