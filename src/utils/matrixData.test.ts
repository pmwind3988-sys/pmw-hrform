import { describe, it, expect } from "vitest";
import { getTabularFields, getDynamicMatrixFields, encodeMatrixRow, decodeMatrixRow } from "./matrixData";
import { buildSurveyJson, createQuestion, getSpColumnKind, QUESTION_TYPES } from "./FormBuilderEngine";

function fieldOfType(type: string) {
  const def = QUESTION_TYPES.find(t => t.type === type);
  if (!def) throw new Error(`no question type ${type}`);
  return createQuestion(def);
}

describe("getTabularFields", () => {
  it("finds both dynamic matrices and table inputs", () => {
    const survey = buildSurveyJson([fieldOfType("dynamicmatrix"), fieldOfType("tableinput")], {});
    expect(getTabularFields(survey).map(f => f.name).sort()).toEqual(
      ["dynamicMatrix", "tableInput"].sort(),
    );
  });

  it("keeps a table that has no columns defined yet", () => {
    const survey = { pages: [{ elements: [{ type: "tableinput", name: "blank", columns: [] }] }] };
    expect(getTabularFields(survey)).toEqual([{ name: "blank", columns: [], title: undefined }]);
  });

  it("reaches tables nested inside a panel", () => {
    const survey = {
      pages: [{ elements: [{ type: "panel", elements: [{ type: "dynamicmatrix", name: "inner", columns: [] }] }] }],
    };
    expect(getTabularFields(survey).map(f => f.name)).toEqual(["inner"]);
  });

  it("covers every answerable type that has no bare SharePoint column", () => {
    // getSpColumnKind returns null for the layout and display types too, but
    // those never carry an answer. The tables are the ones a respondent fills
    // in, so they are the ones the submit body has to redirect.
    const tabular = ["dynamicmatrix", "tableinput"];
    for (const type of tabular) {
      expect(getSpColumnKind({ type, choices: undefined, inputType: undefined })).toBeNull();
    }
    const survey = { pages: [{ elements: tabular.map(type => ({ type, name: type, columns: [] })) }] };
    expect(getTabularFields(survey).map(f => f.name).sort()).toEqual([...tabular].sort());
  });

  it("catches a columns-less table that getDynamicMatrixFields drops", () => {
    // getDynamicMatrixFields requires at least one column because the child-list
    // path has nothing to write without one. The submit path still has to route
    // the answer, so this is the case that would otherwise slip through.
    const survey = { pages: [{ elements: [{ type: "matrixdynamic", name: "noCols", columns: [] }] }] };
    expect(getDynamicMatrixFields(survey)).toEqual([]);
    expect(getTabularFields(survey).map(f => f.name)).toEqual(["noCols"]);
  });
});

describe("currency ceiling", () => {
  it("no longer ships a max that would reject every positive amount", () => {
    const def = QUESTION_TYPES.find(t => t.type === "currency");
    expect(def?.defaultProps).not.toHaveProperty("max");
  });

  it("drops a stored max of 0 on publish so old forms repair themselves", () => {
    const stale = { ...fieldOfType("currency"), max: 0 };
    const [published] = (buildSurveyJson([stale], {}) as { pages: { elements: Record<string, unknown>[] }[] })
      .pages[0].elements;
    expect(published).not.toHaveProperty("max");
  });

  it("keeps a real ceiling the author set on purpose", () => {
    const capped = { ...fieldOfType("currency"), max: 5000 };
    const [published] = (buildSurveyJson([capped], {}) as { pages: { elements: Record<string, unknown>[] }[] })
      .pages[0].elements;
    expect(published.max).toBe(5000);
  });
});

describe("matrix columns reaching SharePoint", () => {
  /** What `ensureMatrixChildList` keeps: a column is only provisioned if it has a name. */
  const provisionable = (cols: unknown[]) =>
    cols.filter((c): c is { name: string } => !!c && typeof c === "object" && !!(c as { name?: string }).name);

  it("publishes a string-column matrix as named columns", () => {
    // The dynamicmatrix palette default is a plain list of headers. Left as
    // strings they have no `name`, so every data column was dropped when the
    // child list was built — the row was written with only its metadata, and
    // the saved matrix came back empty when the submission was reopened.
    const field = fieldOfType("dynamicmatrix");
    expect(field.columns).toEqual(["Column 1", "Column 2"]);

    const [published] = (buildSurveyJson([field], {}) as { pages: { elements: Record<string, unknown>[] }[] })
      .pages[0].elements;
    expect(published.columns).toEqual([
      { name: "col1", title: "Column 1" },
      { name: "col2", title: "Column 2" },
    ]);
    expect(provisionable(published.columns as unknown[])).toHaveLength(2);
  });

  it("leaves already-named columns alone", () => {
    const field = fieldOfType("tableinput");
    const [published] = (buildSurveyJson([field], {}) as { pages: { elements: Record<string, unknown>[] }[] })
      .pages[0].elements;
    expect(published.columns).toEqual([{ name: "col1", title: "Column 1" }]);
  });
});

describe("matrix rows and SharePoint's own property names", () => {
  const columns = [
    { name: "col1", title: "Column 1" },
    { name: "col2", title: "Column 2" },
  ];
  // What SharePoint actually did to "col1" on a real child list: escaped the
  // leading letter and prefixed OData_.
  const stored: Record<string, string> = {
    col1: "OData__x0063_ol1",
    col2: "OData__x0063_ol2",
  };
  const resolve = (name: string) => stored[name] ?? null;

  it("writes cells under the names SharePoint will accept", () => {
    expect(encodeMatrixRow({ col1: "Child row A", col2: "B" }, columns, resolve)).toEqual({
      OData__x0063_ol1: "Child row A",
      OData__x0063_ol2: "B",
    });
  });

  it("sends an empty cell rather than omitting it", () => {
    expect(encodeMatrixRow({ col1: "only" }, columns, resolve)).toEqual({
      OData__x0063_ol1: "only",
      OData__x0063_ol2: null,
    });
  });

  it("keeps a column the list does not know, so the failure is loud", () => {
    expect(encodeMatrixRow({ col9: "x" }, [{ name: "col9", title: "C9" }], resolve)).toEqual({ col9: "x" });
  });

  it("reads stored cells back under the names the form asked for", () => {
    const row = { Id: 7, RowIndex: 0, OData__x0063_ol1: "Child row A", OData__x0063_ol2: "B" };
    const decoded = decodeMatrixRow(row, columns, resolve);
    expect(decoded.col1).toBe("Child row A");
    expect(decoded.col2).toBe("B");
    // Callers still read these off the same object.
    expect(decoded.Id).toBe(7);
    expect(decoded.RowIndex).toBe(0);
  });

  it("leaves a row alone when the names already match", () => {
    const plain = { col1: "kept", col2: "kept too" };
    expect(decodeMatrixRow(plain, columns, () => null)).toEqual(plain);
  });

  it("round-trips a row", () => {
    const original = { col1: "Child row A", col2: "B" };
    const decoded = decodeMatrixRow(encodeMatrixRow(original, columns, resolve), columns, resolve);
    expect(decoded.col1).toBe(original.col1);
    expect(decoded.col2).toBe(original.col2);
  });
});
