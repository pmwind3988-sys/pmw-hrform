import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToJson, sampleFormData } from "./testSupport";
import FormPdfDocument from "../FormPdfDocument";

describe("FormPdfDocument", () => {
  // The footer falls back to `Generated ${new Date()...}` when no
  // `footerText` override is configured, so the snapshot must freeze the
  // clock — otherwise it bakes in the wall-clock minute it was recorded at
  // and fails on every later run.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the same element tree after the section extraction", () => {
    expect(renderToJson(FormPdfDocument(sampleFormData()))).toMatchSnapshot();
  });

  it("draws a banner row over the columns an author grouped", () => {
    const data = sampleFormData();
    data.surveyJson.pages = [
      {
        name: "page1",
        elements: [
          {
            type: "matrixdynamic",
            name: "inspection",
            title: "Pole inspection",
            columns: [
              { name: "no", title: "No." },
              { name: "appGood", title: "Good", group: "Appearance Check" },
              { name: "appKiv", title: "KIV", group: "Appearance Check" },
            ],
          },
        ],
      },
    ];
    data.responseData = { inspection: [{ no: "1", appGood: "2", appKiv: "0" }] };
    const tree = JSON.stringify(renderToJson(FormPdfDocument(data)));
    expect(tree).toContain("Appearance Check");
    // The banner spans two of the three columns.
    expect(tree).toContain("66%");
  });

  it("prints the author's guide under the matrix as lines", () => {
    const data = sampleFormData();
    data.surveyJson.pages = [
      {
        name: "page1",
        elements: [
          {
            type: "matrixdynamic",
            name: "inspection",
            title: "Pole inspection",
            matrixGuide: "<table><tr><th>1a</th><td>M6</td></tr></table>",
            columns: [{ name: "no", title: "No." }],
          },
        ],
      },
    ];
    data.responseData = { inspection: [{ no: "1" }] };
    const tree = JSON.stringify(renderToJson(FormPdfDocument(data)));
    expect(tree).toContain("Guide");
    expect(tree).toContain("1a — M6");
  });

  it("renders without throwing when there are no layers and no answers", () => {
    const data = sampleFormData();
    data.layerResults = [];
    data.responseData = {};
    expect(() => renderToJson(FormPdfDocument(data))).not.toThrow();
  });
});
