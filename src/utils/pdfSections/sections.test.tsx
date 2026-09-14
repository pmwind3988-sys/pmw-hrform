import { describe, expect, it } from "vitest";
import { renderToJson, sampleFormData } from "./testSupport";
import FormPdfDocument from "../FormPdfDocument";

describe("FormPdfDocument", () => {
  it("renders the same element tree after the section extraction", () => {
    expect(renderToJson(FormPdfDocument(sampleFormData()))).toMatchSnapshot();
  });

  it("renders without throwing when there are no layers and no answers", () => {
    const data = sampleFormData();
    data.layerResults = [];
    data.responseData = {};
    expect(() => renderToJson(FormPdfDocument(data))).not.toThrow();
  });
});
