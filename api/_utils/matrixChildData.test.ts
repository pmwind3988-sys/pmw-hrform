import { describe, expect, it } from "vitest";

import {
  getDynamicMatrixFields,
  matrixChildListName,
  readMatrixTables,
  sortMatrixRows,
} from "./matrixChildData.js";

const SURVEY = {
  pages: [
    {
      elements: [
        { type: "text", name: "reason" },
        {
          type: "panel",
          elements: [
            {
              type: "dynamicmatrix",
              name: "trips",
              title: "Trips",
              columns: [{ name: "destination", title: "Destination" }],
            },
          ],
        },
      ],
    },
  ],
};

describe("getDynamicMatrixFields", () => {
  it("finds a repeating table nested inside a panel", () => {
    expect(getDynamicMatrixFields(SURVEY)).toEqual([
      { name: "trips", title: "Trips", columns: [{ name: "destination", title: "Destination" }] },
    ]);
  });

  it("accepts the stored wrapper as well as the survey itself", () => {
    expect(getDynamicMatrixFields({ surveyJson: SURVEY, layerConfig: {} })).toHaveLength(1);
  });

  it("ignores a table question with no columns, and anything unparseable", () => {
    expect(getDynamicMatrixFields({ pages: [{ elements: [{ type: "dynamicmatrix", name: "empty" }] }] })).toEqual([]);
    expect(getDynamicMatrixFields(null)).toEqual([]);
    expect(getDynamicMatrixFields("not a survey")).toEqual([]);
  });
});

describe("matrixChildListName", () => {
  it("strips what SharePoint will not accept in a list name", () => {
    expect(matrixChildListName("Travel Claim", "trip/details?")).toBe("Travel Claim Matrix tripdetails");
  });
});

describe("sortMatrixRows", () => {
  it("puts the rows back in the order they were entered", () => {
    expect(sortMatrixRows([{ RowIndex: 2, a: "b" }, { RowIndex: 1, a: "a" }]).map((row) => row.a))
      .toEqual(["a", "b"]);
  });
});

describe("readMatrixTables", () => {
  it("returns one entry per table question that has rows", async () => {
    const tables = await readMatrixTables("Travel Claim", 42, SURVEY, async (listTitle, parentId) => {
      expect(listTitle).toBe("Travel Claim Matrix trips");
      expect(parentId).toBe(42);
      return [{ destination: "Ipoh" }];
    });
    expect(tables.trips.rows).toEqual([{ destination: "Ipoh" }]);
    expect(tables.trips.columns).toEqual([{ name: "destination", title: "Destination" }]);
  });

  it("leaves out a question whose list is missing, rather than failing the load", async () => {
    // A form that never had these tables provisioned must still open.
    const tables = await readMatrixTables("Travel Claim", 42, SURVEY, async () => {
      throw new Error("List 'Travel Claim Matrix trips' not found");
    });
    expect(tables).toEqual({});
  });

  it("leaves out a question with no rows for this submission", async () => {
    expect(await readMatrixTables("Travel Claim", 42, SURVEY, async () => [])).toEqual({});
  });
});
