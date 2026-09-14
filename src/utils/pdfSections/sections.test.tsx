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

  it("renders without throwing when there are no layers and no answers", () => {
    const data = sampleFormData();
    data.layerResults = [];
    data.responseData = {};
    expect(() => renderToJson(FormPdfDocument(data))).not.toThrow();
  });
});
