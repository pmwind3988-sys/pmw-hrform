import { describe, expect, it } from "vitest";
import { MOVE_TO_TOP_LEVEL, moveTargetPath } from "./learningMove";

describe("moving a material back to the top level", () => {
  it("does not share the empty value the Move to menu rests on", () => {
    // The menu only reports a choice that differs from its current value, so
    // an empty "Top level" option can never be chosen.
    expect(MOVE_TO_TOP_LEVEL).not.toBe("");
  });

  it("asks the server for the library root", () => {
    expect(moveTargetPath(MOVE_TO_TOP_LEVEL)).toBe("");
  });

  it("passes a topic's path through untouched", () => {
    expect(moveTargetPath("Safety/Fire Drills")).toBe("Safety/Fire Drills");
  });
});
