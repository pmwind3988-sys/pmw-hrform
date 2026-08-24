import { describe, expect, it } from "vitest";

import {
  expirySourceForms,
  findExpirySourceForm,
  isDateProducingField,
  SUBMITTED_FORM_SOURCE_LAYER,
} from "./publicLinkExpirySources";
import type { LayerConfigItem } from "../../types";

const MAIN_FORM_FIELDS = [
  { name: "requesterName", title: "Requester", type: "text" },
  { name: "permitEnd", title: "Permit End Date", type: "date" },
];

function approval(layerNumber: number, title?: string): LayerConfigItem {
  return {
    layerNumber,
    type: "approval",
    authMode: "365",
    assignee: { type: "user", value: "a@b.com" },
    title,
    confirmationType: "signature",
    allowRejectionReason: true,
  } as LayerConfigItem;
}

function evaluation(
  layerNumber: number,
  surveyElements: Record<string, unknown>[],
  title?: string,
): LayerConfigItem {
  return {
    layerNumber,
    type: "evaluation",
    authMode: "public",
    assignee: { type: "user", value: "a@b.com" },
    title,
    surveyElements,
  } as LayerConfigItem;
}

describe("isDateProducingField", () => {
  it("accepts the date pickers", () => {
    expect(isDateProducingField({ name: "a", type: "date" })).toBe(true);
    expect(isDateProducingField({ name: "a", type: "datepicker" })).toBe(true);
  });

  it("accepts a date carried by a text input", () => {
    expect(isDateProducingField({ name: "a", type: "text", inputType: "date" })).toBe(true);
    expect(isDateProducingField({ name: "a", type: "text", inputType: "datetime-local" })).toBe(true);
  });

  it("accepts the builder's own Date & Time question, drafted or published", () => {
    // In the builder a Date & Time field is `type: "datetime"` with
    // `inputType: "datetime"`; only its published copy says `datetime-local`.
    // The link reads only the date part, so the time never matters here.
    expect(isDateProducingField({ name: "a", type: "datetime", inputType: "datetime" })).toBe(true);
    expect(isDateProducingField({ name: "a", type: "datetime" })).toBe(true);
    expect(isDateProducingField({ name: "a", type: "text", inputType: "datetime" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isDateProducingField({ name: "a", type: "text" })).toBe(false);
    expect(isDateProducingField({ name: "a", type: "rating" })).toBe(false);
    expect(isDateProducingField(undefined)).toBe(false);
  });
});

describe("expirySourceForms", () => {
  it("offers the submitted form to the very first layer", () => {
    const forms = expirySourceForms([approval(1)], 0, MAIN_FORM_FIELDS);
    expect(forms).toHaveLength(1);
    expect(forms[0].sourceLayer).toBe(SUBMITTED_FORM_SOURCE_LAYER);
    expect(forms[0].label).toBe("Submitted form");
    expect(forms[0].description).toBe("the form");
  });

  it("lists date questions first, so the likely answer is on top", () => {
    const forms = expirySourceForms([approval(1)], 0, [
      { name: "notes", title: "Notes", type: "comment" },
      { name: "permitEnd", title: "Permit End Date", type: "date" },
      { name: "requesterName", title: "Requester", type: "text" },
      { name: "startAt", title: "Start", type: "text", inputType: "datetime-local" },
    ]);
    expect(forms[0].questions.map((q) => q.name)).toEqual([
      "permitEnd",
      "startAt",
      "notes",
      "requesterName",
    ]);
  });

  it("offers every earlier layer that collects answers", () => {
    const layers = [
      evaluation(1, [{ name: "eval_date_1", title: "Site Visit Date", type: "date" }], "Safety review"),
      evaluation(2, [{ name: "eval_date_2", type: "date" }]),
      evaluation(3, [{ name: "eval_date_3", type: "date" }]),
    ];
    const forms = expirySourceForms(layers, 2, MAIN_FORM_FIELDS);
    expect(forms.map((f) => [f.sourceLayer, f.label])).toEqual([
      [0, "Submitted form"],
      [1, "Layer 1 — Safety review"],
      [2, "Layer 2"],
    ]);
    expect(forms[1].description).toBe("layer 1's form");
  });

  it("never offers the layer being configured, or any layer after it", () => {
    const layers = [
      evaluation(1, [{ name: "eval_date_1", type: "date" }]),
      evaluation(2, [{ name: "eval_date_2", type: "date" }]),
      evaluation(3, [{ name: "eval_date_3", type: "date" }]),
    ];
    expect(expirySourceForms(layers, 1, MAIN_FORM_FIELDS).map((f) => f.sourceLayer)).toEqual([0, 1]);
  });

  it("skips earlier layers that collect nothing", () => {
    const layers = [
      approval(1, "Manager sign-off"),
      evaluation(2, []),
      evaluation(3, [{ name: "eval_date_3", type: "date" }]),
      approval(4),
    ];
    expect(expirySourceForms(layers, 3, MAIN_FORM_FIELDS).map((f) => f.sourceLayer)).toEqual([0, 3]);
  });

  it("reaches into panels for the questions a layer really asks", () => {
    const layers = [
      evaluation(1, [
        { type: "panel", elements: [{ name: "eval_date_1", title: "Inspected On", type: "date" }] },
      ]),
      approval(2),
    ];
    const forms = expirySourceForms(layers, 1, MAIN_FORM_FIELDS);
    expect(forms[1].questions.map((q) => q.name)).toEqual(["eval_date_1"]);
  });

  it("drops questions with no field name, since nothing is stored under them", () => {
    const layers = [
      evaluation(1, [{ title: "Nameless", type: "date" }, { name: "eval_date_1", type: "date" }]),
      approval(2),
    ];
    const forms = expirySourceForms(layers, 1, MAIN_FORM_FIELDS);
    expect(forms[1].questions.map((q) => q.name)).toEqual(["eval_date_1"]);
  });

  it("offers nothing at all when there are no questions anywhere yet", () => {
    expect(expirySourceForms([approval(1)], 0, [])).toEqual([]);
  });

  it("falls back to the position when a layer carries no layer number", () => {
    const layers = [
      { ...evaluation(1, [{ name: "eval_date_1", type: "date" }]), layerNumber: 0 } as LayerConfigItem,
      approval(2),
    ];
    expect(expirySourceForms(layers, 1, MAIN_FORM_FIELDS).map((f) => f.sourceLayer)).toEqual([0, 1]);
  });
});

describe("findExpirySourceForm", () => {
  const forms = expirySourceForms(
    [evaluation(1, [{ name: "eval_date_1", type: "date" }]), approval(2)],
    1,
    MAIN_FORM_FIELDS,
  );

  it("treats an absent source layer as the submitted form", () => {
    expect(findExpirySourceForm(forms, undefined)?.sourceLayer).toBe(0);
  });

  it("finds an earlier layer that is still on offer", () => {
    expect(findExpirySourceForm(forms, 1)?.label).toBe("Layer 1");
  });

  it("finds nothing for a layer that is no longer on offer", () => {
    expect(findExpirySourceForm(forms, 7)).toBeUndefined();
  });
});
