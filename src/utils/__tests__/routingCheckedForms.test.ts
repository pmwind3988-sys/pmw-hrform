import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTING_CHECKED_FORM_TITLES, isRoutingCheckedForm } from "../routingCheckedForms";

describe("isRoutingCheckedForm", () => {
  it("lists the Training Evaluation Form", () => {
    expect(ROUTING_CHECKED_FORM_TITLES).toEqual(["Training Evaluation Form"]);
  });

  it("matches ignoring case and extra spaces", () => {
    expect(isRoutingCheckedForm("Training Evaluation Form")).toBe(true);
    expect(isRoutingCheckedForm("TRAINING  EVALUATION form ")).toBe(true);
  });

  it("does not match other forms or blanks", () => {
    expect(isRoutingCheckedForm("Training Needs Analysis")).toBe(false);
    expect(isRoutingCheckedForm("")).toBe(false);
    expect(isRoutingCheckedForm(undefined)).toBe(false);
  });
});

describe("the src/ and api/ copies", () => {
  it("stay identical apart from the header pointing at the other one", () => {
    const root = resolve(__dirname, "../../..");
    const read = (path: string) =>
      readFileSync(resolve(root, path), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

    expect(read("api/_utils/routingCheckedForms.ts")).toBe(read("src/utils/routingCheckedForms.ts"));
  });
});
