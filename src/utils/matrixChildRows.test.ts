import { describe, it, expect, vi } from "vitest";
import { loadMatrixChildRows, matrixChildListName } from "./matrixChildRows";

const survey = {
  pages: [
    {
      name: "p",
      elements: [
        {
          type: "matrixdynamic",
          name: "inspection",
          title: "Pole inspection",
          columns: [{ name: "no", title: "No." }],
        },
      ],
    },
  ],
};

describe("matrixChildListName", () => {
  it("names the list after the form and the question", () => {
    expect(matrixChildListName("ZZ TEST RUN", "inspection")).toBe("ZZ TEST RUN Matrix inspection");
  });

  it("drops characters that would break the list URL", () => {
    expect(matrixChildListName("ZZ TEST RUN", "in/spec'tion")).toBe("ZZ TEST RUN Matrix inspection");
  });
});

describe("loadMatrixChildRows", () => {
  it("returns rows under the _childRows key the layout reads", async () => {
    const read = vi.fn().mockResolvedValue([{ no: "1" }, { no: "2" }]);
    const result = await loadMatrixChildRows(survey, "ZZ TEST RUN", read);
    expect(read).toHaveBeenCalledWith("ZZ TEST RUN Matrix inspection", [{ name: "no", title: "No." }]);
    expect(result).toEqual({
      inspection_childRows: { columns: [{ name: "no", title: "No." }], rows: [{ no: "1" }, { no: "2" }] },
    });
  });

  it("leaves out a matrix with no rows rather than blanking the answer", async () => {
    const result = await loadMatrixChildRows(survey, "ZZ TEST RUN", vi.fn().mockResolvedValue([]));
    expect(result).toEqual({});
  });

  it("survives a matrix whose child list does not exist", async () => {
    const read = vi.fn().mockRejectedValue(new Error("404"));
    await expect(loadMatrixChildRows(survey, "ZZ TEST RUN", read)).resolves.toEqual({});
  });

  it("has nothing to load for a form with no matrix", async () => {
    const read = vi.fn();
    const result = await loadMatrixChildRows({ pages: [{ name: "p", elements: [] }] }, "F", read);
    expect(result).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });
});
